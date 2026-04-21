#!/usr/bin/env node
/**
 * Audit every approved touchless listing for two kinds of data integrity
 * problems that flag a listing as suspect:
 *
 *   1. Name mismatch — our listings.name differs meaningfully from what
 *      Google currently calls that business at the same google_place_id.
 *      Usually means the business was renamed, or our data was bad, or
 *      the photo/name don't match the actual business at the place.
 *
 *   2. Duplicate place_id — two or more approved listings share the same
 *      google_place_id. One of them is a duplicate row; the other is
 *      canonical. Merging / deleting duplicates reduces our near-duplicate
 *      content count (good for AdSense) and cleans up user-visible search.
 *
 * This is a DIAGNOSTIC script — it writes no data. It produces a JSON
 * report at scripts/audit-name-mismatches-report.json so we can decide
 * each case manually (rename / re-photo / delete / keep).
 *
 * Cost: ~$5/1000 Places Details calls (Essentials SKU, displayName is a
 * basic field). For ~4,000 listings, roughly $20 total.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1); }
const LOG = resolve(repoRoot, 'scripts/audit-name-mismatches.log');
const REPORT = resolve(repoRoot, 'scripts/audit-name-mismatches-report.json');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

/**
 * Normalise a business name for comparison. Strips common qualifiers
 * ("Car Wash," "LLC," punctuation, casing) so a trivial difference like
 * "Blue Sky Car Wash" vs "Blue Sky CarWash" doesn't get flagged.
 */
function normalize(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’`"]/g, '')
    .replace(/[\u2013\u2014]/g, '-')         // en/em dashes → hyphen
    .replace(/\b(car ?wash|auto ?wash|wash|llc|inc|co|corporation|company)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Simple token-overlap similarity (0..1) so we can rank "sort of similar" cases. */
function similarity(a, b) {
  const aTokens = new Set(normalize(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalize(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let matched = 0;
  for (const t of aTokens) if (bTokens.has(t)) matched++;
  return matched / Math.max(aTokens.size, bTokens.size);
}

async function fetchPlace(placeId) {
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${GOOGLE_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'displayName' }, signal: AbortSignal.timeout(10000) },
    );
    if (r.status === 404) return { notFound: true };
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const d = await r.json();
    return { displayName: d.displayName?.text ?? null };
  } catch (e) { return { error: e.message }; }
}

async function main() {
  appendFileSync(LOG, `\n=== audit-name-mismatches ${new Date().toISOString()} limit=${LIMIT || 'all'} ===\n`);

  // Pull every approved touchless listing with a google_place_id
  const PAGE = 1000;
  const all = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('listings')
      .select('id, name, city, state, google_place_id, slug')
      .eq('is_touchless', true).eq('is_approved', true)
      .not('google_place_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const target = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  log(`Loaded ${all.length} approved touchless listings with place_ids${LIMIT ? `, limiting to ${target.length}` : ''}`);

  // 1. Find duplicate place_ids FIRST (doesn't need API calls)
  const byPlaceId = new Map();
  for (const l of all) {
    const arr = byPlaceId.get(l.google_place_id) ?? [];
    arr.push(l);
    byPlaceId.set(l.google_place_id, arr);
  }
  const duplicates = [];
  for (const [pid, listings] of byPlaceId) {
    if (listings.length > 1) duplicates.push({ place_id: pid, listings });
  }
  log(`Duplicate place_ids: ${duplicates.length} groups covering ${duplicates.reduce((s, d) => s + d.listings.length, 0)} listings\n`);

  // 2. Name-mismatch check via Places API
  const mismatches = [];
  const notFound = [];
  const errors = [];
  for (let i = 0; i < target.length; i++) {
    const l = target[i];
    const r = await fetchPlace(l.google_place_id);
    if (r.error) { errors.push({ ...l, error: r.error }); continue; }
    if (r.notFound) { notFound.push(l); continue; }
    if (!r.displayName) continue;

    const sim = similarity(l.name, r.displayName);
    // Flag anything below 0.5 token overlap as a potential mismatch.
    if (sim < 0.5) {
      mismatches.push({
        id: l.id, slug: l.slug, city: l.city, state: l.state,
        db_name: l.name, google_name: r.displayName, similarity: Number(sim.toFixed(2)),
      });
    }
    if (i % 100 === 0 || i === target.length - 1) {
      log(`  progress: ${i + 1}/${target.length} | mismatches=${mismatches.length} not-found=${notFound.length} err=${errors.length}`);
    }
  }

  // Sort mismatches worst-first (lowest similarity)
  mismatches.sort((a, b) => a.similarity - b.similarity);

  const report = {
    generated_at: new Date().toISOString(),
    total_scanned: target.length,
    name_mismatches: mismatches,
    place_not_found: notFound.map(l => ({ id: l.id, slug: l.slug, db_name: l.name, city: l.city, state: l.state, place_id: l.google_place_id })),
    duplicate_place_ids: duplicates.map(d => ({ place_id: d.place_id, listings: d.listings.map(l => ({ id: l.id, slug: l.slug, name: l.name, city: l.city, state: l.state })) })),
    api_errors: errors.map(e => ({ id: e.id, name: e.name, error: e.error })),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));

  log(`\n=== Summary ===`);
  log(`  Name mismatches (db name vs Google):  ${mismatches.length}`);
  log(`  Place IDs Google no longer recognises: ${notFound.length}`);
  log(`  Duplicate place_id groups:             ${duplicates.length}`);
  log(`  API errors:                            ${errors.length}`);
  log(`  Report written to: ${REPORT}`);
  log(`\nTop 10 worst mismatches:`);
  for (const m of mismatches.slice(0, 10)) {
    log(`  [${m.similarity}] "${m.db_name}" → Google: "${m.google_name}" (${m.city}, ${m.state})`);
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
