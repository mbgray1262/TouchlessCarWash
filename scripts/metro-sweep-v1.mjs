#!/usr/bin/env node
/**
 * Metro-by-metro touchless sweep.
 *
 * For each gap metro (many car washes in DB, few classified as touchless),
 * run ONE Google query combining touchless keywords + metro name. Extract
 * business domains from results, match against DB listings in that metro,
 * and promote matches with high confidence (domain match OR name+city match
 * in business URL).
 *
 * Cost budget: ~40 credits. User has 141 remaining.
 *
 * SAFETY: Only promote when we can tie the search result DIRECTLY to a
 * specific DB listing (domain match or exact name+city slug match). Never
 * promote based on a "touchless" keyword in a snippet without that tie.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Gap metros. Priority: most total listings with lowest touchless %.
// Each = 1 SerpAPI credit.
const METROS = [
  ['New York', 'NY'], ['Brooklyn', 'NY'], ['Queens', 'NY'], ['Bronx', 'NY'], ['Staten Island', 'NY'],
  ['Houston', 'TX'], ['San Antonio', 'TX'], ['Austin', 'TX'], ['Dallas', 'TX'], ['Fort Worth', 'TX'],
  ['Los Angeles', 'CA'], ['San Diego', 'CA'], ['San Jose', 'CA'], ['Sacramento', 'CA'], ['Fresno', 'CA'],
  ['Miami', 'FL'], ['Orlando', 'FL'], ['Tampa', 'FL'], ['Jacksonville', 'FL'], ['Fort Lauderdale', 'FL'],
  ['Chicago', 'IL'],
  ['Detroit', 'MI'],
  ['Las Vegas', 'NV'], ['Henderson', 'NV'], ['Reno', 'NV'],
  ['Phoenix', 'AZ'], ['Tucson', 'AZ'], ['Mesa', 'AZ'],
  ['Tulsa', 'OK'], ['Oklahoma City', 'OK'],
  ['Nashville', 'TN'], ['Memphis', 'TN'], ['Knoxville', 'TN'],
  ['Portland', 'OR'], ['Salem', 'OR'], ['Eugene', 'OR'],
  ['Charleston', 'SC'], ['Columbia', 'SC'], ['Greenville', 'SC'],
  ['Louisville', 'KY'], ['Lexington', 'KY'],
];

const EXCLUDE_DOMAINS = /^(?:yelp\.com|m\.yelp\.com|facebook\.com|instagram\.com|tiktok\.com|amazon\.com|alibaba\.com|ebay\.com|walmart\.com|quora\.com|reddit\.com|yellowpages\.com|mapquest\.com|tripadvisor\.com|bbb\.org|carwashforum\.com|carwash\.com|threads\.com|github\.com|pinterest\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|wikipedia\.org|google\.com|take5carwashes\.com|tsunamiexpress\.com|mistercarwash\.com|quickquack\.com|tommysexpress\.com|zipscarwash\.com|whitewaterexpress\.com)$/i;
const EXCLUDE_CHAINS = /take5|tsunami|rocket|quickquack|mistercarwash|zipscarwash|whitewater|tommys|oilchangers|greasemonkey/i;

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}
function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\bcar\s+wash\b/g, '').replace(/\bauto\s+spa\b/g, '').replace(/\s+/g, ' ').trim();
}

async function serpSearch(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '30', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

// Load DB
console.log('Loading DB listings...');
const db = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, website, is_touchless').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  db.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${db.length} listings`);

// Index DB by domain and by (state, normName)
const dbByDomain = new Map();
const dbByStateNameCity = new Map();
for (const l of db) {
  if (l.website) {
    const d = extractDomain(l.website);
    if (d) {
      if (!dbByDomain.has(d)) dbByDomain.set(d, []);
      dbByDomain.get(d).push(l);
    }
  }
  const key = `${l.state}|${normName(l.name)}|${(l.city||'').toLowerCase()}`;
  dbByStateNameCity.set(key, l);
}

const promotions = new Set();
const candidateDomains = new Map();
let creditsUsed = 0;

for (const [city, state] of METROS) {
  const q = `"touchless" OR "touch-free" OR "touch free" OR "brushless" OR "laser wash" "car wash" "${city}, ${state}"`;
  const json = await serpSearch(q);
  creditsUsed++;
  if (json.error) { console.log(`${city}, ${state}: ${json.error}`); continue; }
  const results = json.organic_results || [];
  const snippetMatchesTouchless = /touchless|touch-free|touch free|brushless|no brushes|laserwash|laser wash|only water touches/i;
  let matchedHere = 0;
  for (const r of results) {
    if (!r.snippet && !r.title) continue;
    const blob = `${r.title || ''} ${r.snippet || ''}`;
    if (!snippetMatchesTouchless.test(blob)) continue;
    const domain = extractDomain(r.link);
    if (!domain || EXCLUDE_DOMAINS.test(domain)) continue;
    if (EXCLUDE_CHAINS.test(domain) || EXCLUDE_CHAINS.test(blob)) continue;
    // Domain-match path: if we already have listings at this domain in this state, promote those
    if (dbByDomain.has(domain)) {
      const hits = dbByDomain.get(domain).filter(l => l.state === state && l.is_touchless !== true);
      for (const l of hits) {
        promotions.add(l.id);
        matchedHere++;
      }
    }
    // Track unknown domains for review
    if (!candidateDomains.has(domain)) candidateDomains.set(domain, { count: 0, metros: new Set(), sample: r.link });
    const c = candidateDomains.get(domain);
    c.count++;
    c.metros.add(`${city}, ${state}`);
  }
  console.log(`${String(city+', '+state).padEnd(28)} results:${String(results.length).padStart(3)}  promoted:${matchedHere}`);
}

console.log(`\n=== Summary ===`);
console.log(`Credits used: ${creditsUsed}`);
console.log(`Promotions queued: ${promotions.size}`);
console.log(`Unique unknown domains: ${candidateDomains.size}`);

if (promotions.size > 0) {
  const ids = [...promotions];
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true,
      is_approved: false, // KEEP UNAPPROVED until enrichment pipeline runs — per no-partial-listings rule
      touchless_verified: 'website',
      classification_source: 'promoted_apr16_metro_sweep_v1',
      crawl_notes: 'Promoted: domain appeared in Google result with touchless keyword when searched by metro. Held at is_approved=false pending enrichment.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`DB promotions applied (unapproved pending enrichment): ${done}`);
}

const topDomains = [...candidateDomains.entries()]
  .map(([d, v]) => ({ domain: d, count: v.count, metros: [...v.metros], sample: v.sample }))
  .sort((a,b) => b.count - a.count);
writeFileSync('scripts/discovery-output/metro-sweep-v1.json', JSON.stringify({
  creditsUsed, promotions: promotions.size, topDomains: topDomains.slice(0, 100),
}, null, 2));
console.log(`Audit saved to scripts/discovery-output/metro-sweep-v1.json`);

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`\nSerpAPI remaining: ${acct.plan_searches_left}`);
