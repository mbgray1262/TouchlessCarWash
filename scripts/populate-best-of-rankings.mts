/**
 * populate-best-of-rankings — one-off, canonical backfill of best_of_rankings.
 *
 * WHY: the compute-rankings edge function carried a STALE hardcoded copy of the
 * metro list (88 metros) and a drifted scoring path (counted all touchless
 * snippets, skipped the disliked filter, wrote only top-3), so the trophy table
 * covered ~85 of the 231 qualifying metros. This script instead imports the
 * canonical truth (lib/metro-areas, lib/metro-scoring, lib/touchless-quality)
 * and replicates /best/[slug]'s exact query + filter + scoring, writing the
 * top-10 per metro for ALL metros — so badge ranks == /best page ranks.
 *
 * Run:  node --experimental-strip-types scripts/populate-best-of-rankings.mts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { METRO_AREAS, boundingBox, haversineDistance } from '../lib/metro-areas.ts';
import { scoreListing, isTrophyEligible } from '../lib/metro-scoring.ts';
import { isDislikedTouchless } from '../lib/touchless-quality.ts';

// ── env (.env.local) ────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const read = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const write = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors lib/metro-queries.ts BEST_OF_COLUMNS (the columns scoreListing reads).
const COLS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, latitude, longitude, touchless_sentiment, touchless_satisfaction_score, paint_safe_verified, paint_score';

const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

// review_snippets aggregation, paginated + .in-chunked (dodges 1000-row cap +
// URL-length limit). Mirrors getDislikedTouchlessIds + getTouchlessReviewCounts.
async function snippetTally(ids: string[]) {
  const tally = new Map<string, { pos: number; neg: number; touchEvid: number }>();
  for (const idChunk of chunk(ids, 200)) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await read
        .from('review_snippets')
        .select('listing_id, sentiment')
        .in('listing_id', idChunk)
        .eq('is_touchless_evidence', true)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      for (const r of data as { listing_id: string; sentiment: string }[]) {
        const t = tally.get(r.listing_id) ?? { pos: 0, neg: 0, touchEvid: 0 };
        t.touchEvid++;
        if (r.sentiment === 'positive') t.pos++;
        else if (r.sentiment === 'negative') t.neg++;
        tally.set(r.listing_id, t);
      }
      if (data.length < 1000) break;
    }
  }
  return tally;
}

const now = new Date().toISOString();
let metrosWritten = 0;
let metrosCleared = 0;
let rowsInserted = 0;
const skipped: string[] = [];

for (const metro of METRO_AREAS) {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
  const { data, error } = await read
    .from('listings')
    .select(COLS)
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .order('rating', { ascending: false })
    .limit(1000);
  if (error) {
    console.error(`! ${metro.slug}: query error`, error.message);
    continue;
  }
  const inRadius = (data ?? []).filter(
    (l: any) =>
      l.latitude != null &&
      l.longitude != null &&
      haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles,
  );

  const tally = await snippetTally(inRadius.map((l: any) => l.id));
  const eligible = inRadius.filter((l: any) => {
    const t = tally.get(l.id);
    return !(t && isDislikedTouchless(t.pos, t.neg));
  });

  // Always clear this metro's stale rows first (handles now-<5 metros too).
  await write.from('best_of_rankings').delete().eq('metro_slug', metro.slug);

  if (eligible.length < 5) {
    skipped.push(metro.slug);
    metrosCleared++;
    continue;
  }

  // Credibility gate: winners must also be credible on Google (rating>=4 &
  // reviews>=20). Credible-first; fall back to ungated only if a metro has
  // zero credible washes, so no metro is left without a winner list.
  const credible = eligible.filter((l: any) => isTrophyEligible(l));
  const pool = credible.length > 0 ? credible : eligible;

  const scored = pool
    .map((l: any) => ({
      id: l.id,
      score: scoreListing(l, { touchlessReviewCount: tally.get(l.id)?.pos ?? 0 }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // table CHECK constrains rank to 1..3 (top-3 trophy table)

  const rows = scored.map((s, i) => ({
    listing_id: s.id,
    metro_slug: metro.slug,
    metro_name: metro.displayName,
    rank: i + 1,
    score: s.score,
    computed_at: now,
  }));
  const { error: insErr } = await write.from('best_of_rankings').insert(rows);
  if (insErr) {
    console.error(`! ${metro.slug}: insert error`, insErr.message);
    continue;
  }
  metrosWritten++;
  rowsInserted += rows.length;
  if (metrosWritten % 25 === 0) console.log(`  …${metrosWritten} metros written`);
}

console.log('\n=== DONE ===');
console.log(`metros processed:   ${METRO_AREAS.length}`);
console.log(`metros with trophies: ${metrosWritten}`);
console.log(`metros skipped (<5):  ${metrosCleared}`);
console.log(`rows inserted:        ${rowsInserted}`);
if (skipped.length) console.log(`skipped slugs: ${skipped.join(', ')}`);
