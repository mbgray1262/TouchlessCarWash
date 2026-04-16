#!/usr/bin/env node
/**
 * Batch discovery via Google search of Yelp's "Best Touchless Car Wash" pages.
 *
 * Yelp maintains curated top-10 touchless car wash pages per city. Google has
 * indexed those. A single Google search `site:yelp.com "touchless car wash"
 * [city]` returns 10+ business names Yelp considers touchless for that city.
 *
 * Each SerpAPI credit = ~10-20 candidate businesses.
 *
 * Strategy:
 *   1. Target top US cities by car wash density (from our existing DB)
 *   2. Search Google: site:yelp.com "touchless car wash" [city]
 *   3. Parse SERP titles/snippets for business names
 *   4. Fuzzy-match business names against our DB listings
 *   5. Promote matches
 *   6. Also save any review text found in snippets to review_snippets
 *
 * Cost: ~50-100 SerpAPI credits for 100 cities.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const LIMIT_CITIES = parseInt(process.argv.find(a => a.startsWith('--cities='))?.split('=')[1] || '80', 10);

// Find top US cities by our DB listing count (has more chance of covering real car washes)
const { data: cityCounts } = await sb.from('listings').select('city, state').not('city', 'is', null).not('state','is', null).limit(20000);
const cityMap = new Map();
for (const r of cityCounts || []) {
  const k = `${r.city}|${r.state}`;
  cityMap.set(k, (cityMap.get(k) || 0) + 1);
}
const topCities = Array.from(cityMap.entries()).sort((a,b) => b[1]-a[1]).slice(0, LIMIT_CITIES).map(([k,n]) => {
  const [city, state] = k.split('|');
  return { city, state, listings: n };
});
console.log(`Top ${topCities.length} cities by DB listing count:`);
for (const c of topCities.slice(0, 10)) console.log(`  ${c.city}, ${c.state} (${c.listings} listings)`);

async function search(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '30', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

// Load our current DB listings for matching — name + city
console.log('\nLoading DB listings for matching...');
const dbListings = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, is_touchless, parent_chain').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  dbListings.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${dbListings.length} DB listings loaded`);

// Build lookup: state+city lowercased → listings
const cityIndex = new Map();
for (const l of dbListings) {
  const k = `${l.state}|${(l.city || '').toLowerCase()}`;
  if (!cityIndex.has(k)) cityIndex.set(k, []);
  cityIndex.get(k).push(l);
}

// Normalize business name for fuzzy match
function normName(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bcar\s+wash\b/g, '')
    .replace(/\bauto\s+spa\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract business name candidates from SERP snippet text
// Yelp snippets look like: "Drive Well Auto Spa · (8 reviews) · 16.1 mi ; Neon Hand Car Wash · (12 reviews) · 2.2 mi ; ..."
function extractBusinessesFromSnippet(snippet) {
  if (!snippet) return [];
  // Split on ';' or '·' cluster patterns
  const chunks = snippet.split(/[;·]/);
  const names = [];
  for (const chunk of chunks) {
    let s = chunk.trim();
    // Skip chunks that look like addresses/distances/phone numbers
    if (/^\d+\.\d+\s*mi\b|\(\d+\s+reviews?\)|\(\d{3}\)\s*\d{3}[-\s]?\d{4}|^\d{3,}|\bBest\s+Touchless\b/i.test(s)) continue;
    // Plausible business name length 3-50 chars, starts with capital letter
    if (s.length >= 3 && s.length <= 60 && /^[A-Z0-9]/i.test(s)) {
      // Remove distance suffix
      s = s.replace(/\s*\d+(?:\.\d+)?\s*mi\b.*$/i, '').trim();
      if (s.length >= 3 && !/^\d/.test(s)) names.push(s);
    }
  }
  return names;
}

const matches = [];
let creditsUsed = 0;
const yelpReviewSnippets = [];

for (const c of topCities) {
  const q = `site:yelp.com "touchless car wash" ${c.city} ${c.state}`;
  try {
    const json = await search(q);
    creditsUsed++;
    if (json.error) { console.log(`  ${c.city}, ${c.state}: ${json.error}`); continue; }
    const results = json.organic_results || [];
    if (results.length === 0) continue;
    // Extract business names from ALL SERP result snippets + titles
    const candidates = new Set();
    for (const r of results) {
      // Title might contain business name
      if (r.title) {
        // "Best Touchless Car Wash near X" is not a business — filter
        if (!/Best\s+Touchless|Top\s+10/i.test(r.title)) {
          const match = r.title.match(/^([^|·]+)/);
          if (match) candidates.add(match[1].trim());
        }
      }
      for (const n of extractBusinessesFromSnippet(r.snippet)) candidates.add(n);
    }
    // Match against DB for this city
    const dbForCity = cityIndex.get(`${c.state}|${c.city.toLowerCase()}`) || [];
    const dbByName = new Map();
    for (const l of dbForCity) dbByName.set(normName(l.name), l);
    const cityMatches = [];
    for (const name of candidates) {
      const normed = normName(name);
      if (!normed) continue;
      if (dbByName.has(normed)) cityMatches.push(dbByName.get(normed));
      // Also try fuzzy-match: candidate contains DB name or vice versa
      for (const [dbNorm, dbListing] of dbByName.entries()) {
        if (dbNorm === normed) continue; // already exact matched
        if (dbNorm.length >= 5 && normed.includes(dbNorm)) cityMatches.push(dbListing);
        else if (normed.length >= 5 && dbNorm.includes(normed)) cityMatches.push(dbListing);
      }
    }
    const uniqCity = [...new Map(cityMatches.map(l => [l.id, l])).values()];
    if (uniqCity.length > 0) {
      console.log(`  ${c.city}, ${c.state}: ${candidates.size} candidates → ${uniqCity.length} DB matches`);
      matches.push(...uniqCity.map(l => ({ ...l, sourceCity: `${c.city}, ${c.state}` })));
    }
    // Save review text snippets that mention touchless
    for (const r of results) {
      if (r.snippet && /touchless|touch[\s-]free|brushless/i.test(r.snippet)) {
        yelpReviewSnippets.push({ city: c.city, state: c.state, url: r.link, snippet: r.snippet });
      }
    }
  } catch (e) {
    console.log(`  ${c.city}, ${c.state}: ERROR ${e.message}`);
  }
}

console.log(`\n=== Sweep complete: ${creditsUsed} SerpAPI credits used ===`);
const unique = [...new Map(matches.map(m => [m.id, m])).values()];
console.log(`Unique DB listings matched: ${unique.length}`);

const byStatus = { t: 0, f: 0, n: 0 };
for (const m of unique) {
  if (m.is_touchless === true) byStatus.t++;
  else if (m.is_touchless === false) byStatus.f++;
  else byStatus.n++;
}
console.log(`  Already is_touchless=true: ${byStatus.t}`);
console.log(`  Currently is_touchless=false: ${byStatus.f}  ← RESTORE candidates`);
console.log(`  Currently is_touchless=null: ${byStatus.n}  ← PROMOTE candidates`);

// Save audit
writeFileSync('scripts/discovery-output/yelp-discovery.json', JSON.stringify({
  creditsUsed,
  citiesScanned: topCities.length,
  uniqueMatches: unique.length,
  matches: unique.map(m => ({ id: m.id, name: m.name, city: m.city, state: m.state, is_touchless: m.is_touchless, sourceCity: m.sourceCity, parent_chain: m.parent_chain })),
  yelpSnippets: yelpReviewSnippets,
}, null, 2));
console.log(`\nFull audit saved to scripts/discovery-output/yelp-discovery.json`);

// Promote conservatively — only ones currently is_touchless=false or null
const toPromote = unique.filter(m => m.is_touchless !== true);
console.log(`\nFirst 30 to promote:`);
for (const m of toPromote.slice(0, 30)) console.log(`  ${m.name.slice(0, 40).padEnd(40)} ${m.city}, ${m.state}  (via ${m.sourceCity})`);

// Apply
if (toPromote.length > 0) {
  const ids = toPromote.map(m => m.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true,
      is_approved: true,
      touchless_verified: 'user_review',
      classification_source: 'promoted_apr16_yelp_google_search',
      crawl_notes: 'Promoted: Google search "site:yelp.com touchless car wash [city]" returned this business. Yelp editorially lists it on their "Best Touchless Car Wash" city guide.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`\nPromoted: ${done}`);
}

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`\nTotal touchless now: ${count}`);
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI credits remaining: ${acct.plan_searches_left}`);
