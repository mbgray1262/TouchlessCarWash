#!/usr/bin/env node
/**
 * Backfill Google Maps reviews for thin touchless listings via SerpAPI.
 *
 * Goal: insert ≥2 review_snippets per listing so they escape the
 * `isThinListing()` predicate in lib/listing-quality.ts and qualify for
 * the sitemap. Currently ~1,256 approved touchless listings are excluded
 * from /sitemap.xml because of thin content.
 *
 * Two thin categories (matching lib/listing-quality.ts):
 *   1. SCALED-DUPLICATE CHAIN — parent_chain set, <2 review_snippets,
 *      no google_description. Add ≥2 snippets to unlock.
 *   2. GHOST LISTING — no crawl_snapshot, no extracted_data, 0 reviews.
 *      Any review snippet plus review_count > 0 unlocks.
 *
 * Cost: ~1 SerpAPI credit per listing (google_maps_reviews engine).
 *
 * Usage:
 *   node scripts/backfill-reviews-thin-listings.mjs --dry-run        # show targets
 *   node scripts/backfill-reviews-thin-listings.mjs --limit=50       # test batch
 *   node scripts/backfill-reviews-thin-listings.mjs                  # full run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─── env ───
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
if (!envPath) { console.error('No .env.local found'); process.exit(1); }
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
// Service role required — review_snippets has RLS that blocks anon-key inserts.
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERPAPI_KEY = env.SERPAPI_KEY;
if (!SERPAPI_KEY) { console.error('SERPAPI_KEY missing'); process.exit(1); }
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY not set — inserts will fail due to RLS.');
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── args ───
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');
// SerpAPI plan limit is 1,000 searches/hour. At 4000ms between requests we
// hit ~900/hour with safety buffer for retries. Earlier 1500ms produced
// HTTP 429 throttle errors in the final ~100 listings of the first run.
const DELAY_MS = 4000;

// ─── classifier (mirrors scripts/free-review-mine.py) ───
const TOUCHLESS_POSITIVE = /\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b/gi;
const NEGATIVE_CONTEXT = /\b(?:not|isn[’']?t|wasn[’']?t|aren[’']?t|don[’']?t|doesn[’']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)/i;
const STRONG_NEGATIVE = /\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b/i;

/**
 * Matches the convention in scripts/free-review-mine.py:
 *   - return null  → review has NO touchless keywords at all → skip insert
 *   - return { evidence: false, keywords: [...] } → has keywords but
 *     in negative context (e.g. "not touchless", "claims touchless but") →
 *     insert with is_touchless_evidence=false to preserve the record
 *   - return { evidence: true,  keywords: [...] } → positive confirmation
 *     the wash IS touchless → insert with is_touchless_evidence=true
 *
 * Returning null for unrelated reviews keeps the review_snippets table
 * focused on touchless-related content only — every other script in the
 * codebase follows this pattern.
 */
function classifyReview(text) {
  if (!text || text.length < 10) return null;
  if (STRONG_NEGATIVE.test(text)) return { evidence: false, keywords: ['negative:brushes-touched'] };
  const positives = [...text.matchAll(TOUCHLESS_POSITIVE)];
  if (positives.length === 0) return null;  // not touchless-related — skip
  for (const m of positives) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 60);
    if (NEGATIVE_CONTEXT.test(text.slice(start, end))) return { evidence: false, keywords: ['negative-context'] };
  }
  return { evidence: true, keywords: [...new Set(positives.map(m => m[0].toLowerCase()))] };
}

// ─── SerpAPI ───
async function fetchReviews(placeId) {
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(placeId)}&api_key=${SERPAPI_KEY}`;
  const res = await fetch(url);
  if (res.status === 429) {
    // Hourly throttle — sleep 65 minutes and retry once. SerpAPI's plan
    // limit is 1,000 searches/hour; the window resets after 60 min.
    console.log('  ⏸ HTTP 429 hourly throttle — sleeping 65 minutes...');
    await new Promise(r => setTimeout(r, 65 * 60 * 1000));
    const res2 = await fetch(url);
    if (!res2.ok) throw new Error(`HTTP ${res2.status} after throttle wait`);
    const data = await res2.json();
    if (data.error) throw new Error(`SerpAPI: ${data.error}`);
    return data.reviews || [];
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`SerpAPI: ${data.error}`);
  return data.reviews || [];
}

// ─── main ───
async function main() {
  console.log('Loading thin-listing targets...');

  // Pull approved touchless listings with a place_id, then apply the thin
  // predicate client-side (matches lib/listing-quality.ts isThinListing).
  const PAGE = 1000;
  let offset = 0;
  const candidates = [];
  while (true) {
    const { data, error } = await sb.from('listings')
      .select('id, name, city, state, google_place_id, parent_chain, review_count, google_description, is_claimed, is_featured, crawl_snapshot, extracted_data')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('google_place_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Query error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const l of data) {
      if (l.is_claimed || l.is_featured) continue;  // manual overrides — already indexed
      const hasContent = l.crawl_snapshot != null || l.extracted_data != null;
      const hasBlurb = !!(l.google_description && l.google_description.trim().length > 0);
      if (l.parent_chain) {
        // chain — thin if <2 snippets AND no blurb (snippet count checked next)
        if (hasBlurb) continue;
        candidates.push(l);
      } else if (!hasContent && (l.review_count ?? 0) < 1) {
        // ghost — thin
        candidates.push(l);
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Filter chain candidates by current snippet count
  const chainIds = candidates.filter(c => c.parent_chain).map(c => c.id);
  const snippetCounts = new Map();
  for (let i = 0; i < chainIds.length; i += 500) {
    const chunk = chainIds.slice(i, i + 500);
    const { data: snips } = await sb.from('review_snippets').select('listing_id').in('listing_id', chunk);
    for (const s of snips || []) snippetCounts.set(s.listing_id, (snippetCounts.get(s.listing_id) ?? 0) + 1);
  }

  const targets = candidates.filter(c => {
    if (!c.parent_chain) return true;
    return (snippetCounts.get(c.id) ?? 0) < 2;
  });

  // Sort: chains first (real businesses with real Google reviews — high yield).
  // Ghosts are listings with review_count=0 on Google — most won't yield reviews
  // (which is why they're ghosts in the first place), so push them to the back.
  targets.sort((a, b) => {
    if (!!a.parent_chain !== !!b.parent_chain) return a.parent_chain ? -1 : 1;
    // Within chains: higher review_count first (more likely to yield touchless evidence)
    const rcDiff = (b.review_count ?? 0) - (a.review_count ?? 0);
    if (rcDiff !== 0) return rcDiff;
    return (a.state + a.city + a.name).localeCompare(b.state + b.city + b.name);
  });

  console.log(`Found ${targets.length} thin listings with place_ids`);
  console.log(`  ghosts:  ${targets.filter(t => !t.parent_chain).length}`);
  console.log(`  chains:  ${targets.filter(t => t.parent_chain).length}`);

  if (DRY_RUN) {
    console.log('\nFirst 10:');
    for (const t of targets.slice(0, 10)) {
      console.log(`  ${t.id} · ${t.name} · ${t.city}, ${t.state} · ${t.parent_chain ? 'chain:' + t.parent_chain : 'ghost'}`);
    }
    return;
  }

  // Check credits before starting
  try {
    const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`)).json();
    console.log(`SerpAPI credits available: ${acct.plan_searches_left}\n`);
  } catch {}

  const toProcess = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
  console.log(`Processing ${toProcess.length} listings (est ~${toProcess.length} credits, ~${(toProcess.length * DELAY_MS / 60000).toFixed(1)} min)\n`);

  let withReviews = 0, withTouchless = 0, noReviews = 0, errors = 0, snippetsInserted = 0;
  const start = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const l = toProcess[i];
    try {
      const reviews = await fetchReviews(l.google_place_id);
      if (reviews.length === 0) { noReviews++; continue; }

      // Build snippet rows — only touchless-related reviews (positive evidence
      // or negative-context mentions). Reviews with zero touchless keywords
      // are skipped entirely (classifier returns null) to keep review_snippets
      // focused on touchless content. Matches the convention in
      // scripts/free-review-mine.py and the rest of the codebase.
      const rows = reviews.slice(0, 10)
        .map(r => {
          const text = r.snippet || r.review_text || r.extracted_snippet?.original || '';
          if (!text || text.length < 10) return null;
          const cls = classifyReview(text);
          if (cls === null) return null;  // not touchless-related — skip
          return {
            listing_id: l.id,
            review_text: text.slice(0, 2000),
            reviewer_name: r.user?.name || r.author || null,
            rating: typeof r.rating === 'number' ? r.rating : (r.rating?.value ?? null),
            review_date: null,
            iso_date: r.iso_date || null,
            review_id: r.review_id || r.link || null,
            is_touchless_evidence: cls.evidence,
            touchless_keywords: cls.keywords,
            source: 'serpapi',
            sentiment: null,
          };
        })
        .filter(Boolean);

      if (rows.length === 0) { noReviews++; continue; }

      // upsert with onConflict so previously-stored reviews don't fail the batch
      const { data: inserted, error } = await sb
        .from('review_snippets')
        .upsert(rows, { onConflict: 'review_id', ignoreDuplicates: true })
        .select('id');
      if (error) {
        errors++;
        console.error(`  ! ${l.name.slice(0, 40)} · insert: ${error.message.slice(0, 100)}`);
        continue;
      }

      const newCount = inserted?.length ?? 0;
      snippetsInserted += newCount;
      if (newCount > 0) withReviews++;
      if (rows.some(r => r.is_touchless_evidence) && newCount > 0) withTouchless++;

      // For ghost listings without review_count, bump it so the predicate sees content
      if (!l.parent_chain && (l.review_count ?? 0) < 1) {
        await sb.from('listings').update({ review_count: reviews.length }).eq('id', l.id);
      }
    } catch (e) {
      errors++;
      console.error(`  ! ${l.name.slice(0, 40)}: ${e.message.slice(0, 120)}`);
      if (errors >= 10 && errors / (i + 1) > 0.4) {
        console.error('\nToo many consecutive errors — stopping to preserve credits');
        break;
      }
    }

    if ((i + 1) % 10 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  [${i+1}/${toProcess.length}] snippets:${snippetsInserted} withRev:${withReviews} touchless:${withTouchless} noRev:${noReviews} err:${errors} · ${elapsed}s`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n=== Done ===');
  console.log(`Listings processed:        ${toProcess.length}`);
  console.log(`With reviews returned:     ${withReviews}`);
  console.log(`With touchless evidence:   ${withTouchless}`);
  console.log(`Snippets inserted:         ${snippetsInserted}`);
  console.log(`No reviews returned:       ${noReviews}`);
  console.log(`Errors:                    ${errors}`);
  console.log(`Avg snippets/listing:      ${withReviews > 0 ? (snippetsInserted / withReviews).toFixed(1) : '0'}`);

  try {
    const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`)).json();
    console.log(`SerpAPI credits remaining: ${acct.plan_searches_left}`);
  } catch {}
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
