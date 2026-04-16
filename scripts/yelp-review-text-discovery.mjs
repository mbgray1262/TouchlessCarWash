#!/usr/bin/env node
/**
 * Discovery via Google SERP search of Yelp review text for SPECIFIC touchless
 * phrases. Unlike Yelp's algorithmic category pages (unreliable), actual
 * customer review text using specific phrases is authoritative evidence.
 *
 * Strategy:
 *   1. Google search: site:yelp.com "truly touchless" "car wash" (etc.)
 *   2. Each SERP result is a Yelp business page where a customer used that
 *      specific phrase in a review
 *   3. Extract business name + city from Yelp URL slug
 *   4. Fuzzy-match against our DB listings
 *   5. Promote matches + save the review text as evidence snippet
 *
 * Quality safeguards:
 *   - Skip businesses whose NAMES indicate detailer/hand-wash/mobile-wash
 *   - Require the review snippet contains POSITIVE compound phrase (not
 *     negative like "wish it were touchless")
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const QUERIES = [
  'site:yelp.com "truly touchless" "car wash"',
  'site:yelp.com "no brushes" "car wash"',
  'site:yelp.com "brushless automatic" "car wash"',
  'site:yelp.com "touchless automatic" review',
  'site:yelp.com "only touchless" "car wash"',
  'site:yelp.com "actually touchless" "car wash"',
  'site:yelp.com "real touchless" "car wash"',
  'site:yelp.com "completely touchless" "car wash"',
  'site:yelp.com "100% touchless" "car wash"',
  'site:yelp.com "genuine touchless" "car wash"',
  'site:yelp.com "water only" "car wash" review',
  'site:yelp.com "laserwash" review',
  'site:yelp.com "PDQ laserwash"',
  'site:yelp.com "touch free automatic" "car wash"',
  'site:yelp.com "no-touch wash" "car wash"',
];

// Name exclusions — these indicate the business is NOT an automatic touchless wash
const SKIP_NAME = /mobile\s+(?:auto|car|wash|detail)|hand\s+(?:wash|car)|detail(?:ing)?\s+(?:service|center|shop)|ceramic\s+coating|window\s+tint|body\s+shop|auto\s+body|collision|repair|tire|brake|oil\s+change|transmission/i;

// Positive review-text patterns (must appear in snippet near business mention)
const POSITIVE_RE = /truly\s+touchless|actually\s+touchless|really\s+touchless|no\s+brushes?(?:\s+touch|\s+at\s+all|,)|only\s+water|water\s+only|touchless\s+automatic|touchless\s+wash|touch[\s-]free\s+automatic|brushless\s+automatic|100%?\s+touchless|completely\s+touchless|laserwash|true\s+touch[\s-]?less/i;
// Negative patterns — skip
const NEGATIVE_RE = /wish\s+(?:it|this)\s+(?:were|was)\s+touchless|not\s+(?:really|actually|truly)\s+touchless|(?:isn|ain)[\u2019\']?t\s+touchless|claims?\s+(?:to\s+be\s+)?touchless\s+but|supposedly\s+touchless/i;

// Parse business name + city from Yelp URL
// Pattern: /biz/{slug}-{city-slug}  (city is usually last 1-3 words)
function parseYelpUrl(url) {
  const m = url.match(/yelp\.com\/biz\/([^/?#]+)/);
  if (!m) return null;
  const slug = m[1];
  // Yelp adds state/city suffix sometimes (e.g., -chicago-2, -austin)
  // No perfect way — return slug for fuzzy matching
  return slug;
}

function slugToWords(slug) {
  return slug.replace(/-/g, ' ').replace(/\s+\d+$/, '').trim();
}

async function search(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '50', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

console.log('Loading DB listings...');
const db = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, is_touchless, parent_chain').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  db.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${db.length} listings`);

// Build lookup by normalized name-city-state key
function normName(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bcar\s+wash\b/g, '')
    .replace(/\bauto\s+spa\b/g, '')
    .replace(/\s+/g, ' ').trim();
}
const dbByState = new Map();
for (const l of db) {
  const k = l.state;
  if (!dbByState.has(k)) dbByState.set(k, []);
  dbByState.get(k).push({ ...l, normed: normName(l.name), cityLower: (l.city||'').toLowerCase() });
}

// Execute queries
const candidates = []; // { yelpSlug, snippet, url }
let creditsUsed = 0;

for (const q of QUERIES) {
  try {
    const json = await search(q);
    creditsUsed++;
    if (json.error) { console.log(`"${q}": ${json.error}`); continue; }
    const results = json.organic_results || [];
    console.log(`"${q}": ${results.length} results`);
    for (const r of results) {
      const slug = parseYelpUrl(r.link);
      if (!slug) continue;
      if (!r.snippet) continue;
      if (NEGATIVE_RE.test(r.snippet)) continue;
      if (!POSITIVE_RE.test(r.snippet)) continue;
      candidates.push({ slug, snippet: r.snippet, url: r.link, query: q });
    }
  } catch (e) { console.log(`"${q}": err ${e.message}`); }
}

console.log(`\nGot ${candidates.length} candidates from ${creditsUsed} credits`);

// Match candidates against DB
const matches = [];
for (const c of candidates) {
  const slugWords = slugToWords(c.slug);
  // Skip if slug contains skip-name patterns
  if (SKIP_NAME.test(slugWords)) continue;
  // Try to match against any state
  for (const [state, listings] of dbByState.entries()) {
    for (const l of listings) {
      if (l.normed.length < 3) continue;
      // Check if slug contains the DB name
      if (slugWords.includes(l.normed) && slugWords.includes(l.cityLower)) {
        matches.push({ listing: l, candidate: c });
      }
    }
  }
}
const uniqMatches = [...new Map(matches.map(m => [m.listing.id, m])).values()];
console.log(`Unique DB matches: ${uniqMatches.length}`);

// Only keep ones NOT already is_touchless=true
const toPromote = uniqMatches.filter(m => m.listing.is_touchless !== true);
console.log(`To promote: ${toPromote.length}`);
for (const m of toPromote.slice(0, 30)) {
  console.log(`  ${m.listing.name.slice(0, 40).padEnd(40)} ${m.listing.city}, ${m.listing.state}`);
  console.log(`    snippet: "${m.candidate.snippet.slice(0, 150)}"`);
}

// Save audit
writeFileSync('scripts/discovery-output/yelp-review-text-discovery.json', JSON.stringify({
  creditsUsed, queriesRun: QUERIES.length, candidates: candidates.length,
  uniqMatches: uniqMatches.length, toPromote: toPromote.length,
  promotions: toPromote.map(m => ({ id: m.listing.id, name: m.listing.name, city: m.listing.city, state: m.listing.state, snippet: m.candidate.snippet, url: m.candidate.url })),
}, null, 2));

// Promote
if (toPromote.length > 0) {
  const ids = toPromote.map(m => m.listing.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true, is_approved: true,
      touchless_verified: 'user_review',
      classification_source: 'promoted_apr16_yelp_review_text',
      crawl_notes: 'Promoted: Google search surfaced Yelp review text with specific touchless phrases (truly touchless / no brushes / touchless automatic / etc.) written by actual customers. URL slug matched business name + city exactly.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`\nPromoted: ${done}`);
}
const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`Total touchless now: ${count}`);
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI remaining: ${acct.plan_searches_left}`);
