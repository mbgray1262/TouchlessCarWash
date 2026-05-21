#!/usr/bin/env node
/**
 * Classify unclassified prospect listings as touchless using SerpAPI's
 * google_maps_reviews engine with the `query=touchless` keyword filter.
 *
 * Each prospect (is_touchless IS NULL + has google_place_id + not yet mined)
 * costs 1 SerpAPI credit. If SerpAPI returns ≥1 review explicitly mentioning
 * "touchless" (via the server-side query filter), our regex classifier
 * confirms it's positive evidence (not "not touchless" / "claims touchless
 * but..."), and we mark the listing as touchless.
 *
 * Approval gate matches the existing review-mine edge function pattern:
 *   - listing gets is_touchless=true, touchless_verified='user_review_serpapi'
 *   - if listing already has a hero_image → is_approved=true (goes live)
 *   - if no hero → stays held until hero pipeline catches up
 *
 * Usage:
 *   node scripts/classify-prospects-via-serpapi.mjs --dry-run        # show targets
 *   node scripts/classify-prospects-via-serpapi.mjs --limit=50       # test batch
 *   node scripts/classify-prospects-via-serpapi.mjs                  # full run
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
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = env.SERPAPI_KEY;
if (!SERPAPI_KEY) { console.error('SERPAPI_KEY missing'); process.exit(1); }
if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY missing — required for listing updates'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── args ───
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 4000;  // ~900 req/hour, under SerpAPI's 1k/hour ceiling

// MODE controls the candidate population and update behavior.
//   classify-prospects (default): is_touchless IS NULL, never-mined.
//     On touchless-evidence found → fully classify (flip is_touchless=true,
//     set touchless_verified, etc).
//   enrich-approved: is_touchless=true AND is_approved=true AND never-mined.
//     On touchless-evidence found → only update review_mine_status +
//     touchless_review_count. Preserve existing verification metadata.
const MODE = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'classify-prospects';
if (!['classify-prospects', 'enrich-approved'].includes(MODE)) {
  console.error(`Unknown --mode=${MODE}. Use classify-prospects or enrich-approved`);
  process.exit(1);
}

// ─── classifier (matches scripts/free-review-mine.py + backfill script) ───
const TOUCHLESS_POSITIVE = /\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b/gi;
const NEGATIVE_CONTEXT = /\b(?:not|isn[’']?t|wasn[’']?t|aren[’']?t|don[’']?t|doesn[’']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)/i;
const STRONG_NEGATIVE = /\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b/i;

function classifyReview(text) {
  if (!text || text.length < 10) return null;
  if (STRONG_NEGATIVE.test(text)) return { evidence: false, keywords: ['negative:brushes-touched'] };
  const positives = [...text.matchAll(TOUCHLESS_POSITIVE)];
  if (positives.length === 0) return null;
  for (const m of positives) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 60);
    if (NEGATIVE_CONTEXT.test(text.slice(start, end))) return { evidence: false, keywords: ['negative-context'] };
  }
  return { evidence: true, keywords: [...new Set(positives.map(m => m[0].toLowerCase()))] };
}

// ─── SerpAPI ───
async function fetchReviewsKeyword(placeId, keyword = 'touchless') {
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(placeId)}&num=20&query=${encodeURIComponent(keyword)}&api_key=${SERPAPI_KEY}`;
  const res = await fetch(url);
  if (res.status === 429) {
    console.log('  ⏸ HTTP 429 hourly throttle — sleeping 65 minutes...');
    await new Promise(r => setTimeout(r, 65 * 60 * 1000));
    return fetchReviewsKeyword(placeId, keyword);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error) {
    if (/hasn't returned any results|No results found/i.test(data.error)) return [];
    throw new Error(`SerpAPI: ${data.error}`);
  }
  return data.reviews || [];
}

// ─── main ───
async function main() {
  console.log(`Mode: ${MODE}`);
  console.log('Loading candidates...');

  const PAGE = 1000;
  let offset = 0;
  const prospects = [];
  while (true) {
    let q = sb.from('listings')
      .select('id, name, city, state, google_place_id, review_count, hero_image, review_mine_status')
      .not('google_place_id', 'is', null)
      .is('review_mine_status', null);
    if (MODE === 'classify-prospects') {
      q = q.is('is_touchless', null);
    } else if (MODE === 'enrich-approved') {
      q = q.eq('is_touchless', true).eq('is_approved', true);
    }
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) { console.error('Query error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const l of data) prospects.push(l);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  prospects.sort((a, b) => (b.review_count ?? 0) - (a.review_count ?? 0));

  console.log(`Found ${prospects.length} prospects with place_ids, never mined`);

  if (DRY_RUN) {
    console.log('\nFirst 10 (by review_count DESC):');
    for (const p of prospects.slice(0, 10)) {
      const heroFlag = p.hero_image ? '🖼' : '  ';
      console.log(`  ${heroFlag} ${p.id} · ${p.name} · ${p.city}, ${p.state} (${p.review_count ?? 0} reviews)`);
    }
    const withHero = prospects.filter(p => p.hero_image).length;
    console.log(`\n  with hero (auto-approve eligible): ${withHero}`);
    console.log(`  no hero (will stay held):           ${prospects.length - withHero}`);
    return;
  }

  // Credit check
  try {
    const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`)).json();
    console.log(`SerpAPI credits available: ${acct.plan_searches_left}\n`);
  } catch {}

  const toProcess = LIMIT > 0 ? prospects.slice(0, LIMIT) : prospects;
  console.log(`Processing ${toProcess.length} prospects (est ~${toProcess.length} credits, ~${(toProcess.length * DELAY_MS / 60000).toFixed(1)} min)\n`);

  let classified = 0, approved = 0, scannedClean = 0, errors = 0, snippetsInserted = 0;
  const start = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const l = toProcess[i];
    try {
      const reviews = await fetchReviewsKeyword(l.google_place_id, 'touchless');

      if (reviews.length === 0) {
        // No touchless mentions — mark as scanned, don't classify.
        await sb.from('listings').update({ review_mine_status: 'scanned_clean' }).eq('id', l.id);
        scannedClean++;
        continue;
      }

      // Classify each review
      const rows = reviews.slice(0, 10)
        .map(r => {
          const text = r.snippet || r.review_text || r.extracted_snippet?.original || '';
          if (!text || text.length < 10) return null;
          const cls = classifyReview(text);
          if (cls === null) return null;
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

      const positiveCount = rows.filter(r => r.is_touchless_evidence).length;

      if (positiveCount === 0) {
        // Reviews returned but classifier rejected all (negative context only)
        await sb.from('listings').update({ review_mine_status: 'scanned_clean' }).eq('id', l.id);
        scannedClean++;
        continue;
      }

      // Insert snippets (upsert with merge to update existing review_ids if any)
      const { data: inserted, error: insErr } = await sb
        .from('review_snippets')
        .upsert(rows, { onConflict: 'review_id' })
        .select('id');
      if (insErr) {
        errors++;
        console.error(`  ! ${l.name.slice(0, 40)} · insert: ${insErr.message.slice(0, 100)}`);
        continue;
      }
      const newSnippetCount = inserted?.length ?? 0;
      snippetsInserted += newSnippetCount;

      // Update listing.
      // - classify-prospects mode: flip is_touchless=true, set verification metadata
      // - enrich-approved mode: listing is already touchless+approved; only
      //   record that we mined it and how many positive reviews we found
      const hasHero = !!l.hero_image;
      let updateRow;
      if (MODE === 'classify-prospects') {
        updateRow = {
          is_touchless: true,
          touchless_verified: 'user_review_serpapi',
          review_mine_status: 'touchless_found',
          review_extract_status: 'extracted',
          touchless_review_count: positiveCount,
          crawl_notes: `Classified as touchless via SerpAPI review mining (query=touchless) — ${positiveCount} positive review(s)`,
        };
        if (hasHero) updateRow.is_approved = true;
      } else {
        // enrich-approved: minimal update, preserve existing classification metadata
        updateRow = {
          review_mine_status: 'touchless_found',
          touchless_review_count: positiveCount,
        };
      }

      const { error: upErr } = await sb.from('listings').update(updateRow).eq('id', l.id);
      if (upErr) {
        errors++;
        console.error(`  ! ${l.name.slice(0, 40)} · update: ${upErr.message.slice(0, 100)}`);
        continue;
      }

      classified++;
      if (hasHero) approved++;
    } catch (e) {
      errors++;
      console.error(`  ! ${l.name?.slice(0, 40)}: ${e.message.slice(0, 120)}`);
      if (errors >= 20 && errors / (i + 1) > 0.5) {
        console.error('\nToo many real errors — stopping to preserve credits');
        break;
      }
    }

    if ((i + 1) % 10 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  [${i+1}/${toProcess.length}] classified:${classified} approved:${approved} clean:${scannedClean} snip:${snippetsInserted} err:${errors} · ${elapsed}s`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n=== Done ===');
  console.log(`Prospects processed:       ${toProcess.length}`);
  console.log(`Classified as touchless:   ${classified}`);
  console.log(`  ...auto-approved (live): ${approved}`);
  console.log(`  ...held (no hero yet):   ${classified - approved}`);
  console.log(`Scanned clean (not TL):    ${scannedClean}`);
  console.log(`Snippets inserted:         ${snippetsInserted}`);
  console.log(`Errors:                    ${errors}`);

  try {
    const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${SERPAPI_KEY}`)).json();
    console.log(`SerpAPI credits remaining: ${acct.plan_searches_left}`);
  } catch {}
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
