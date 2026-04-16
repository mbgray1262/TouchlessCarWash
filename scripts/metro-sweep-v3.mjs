#!/usr/bin/env node
/**
 * Metro sweep v3 — small-state gap metros. Applies the new tunnel-chain
 * blocklist at the domain level BEFORE promotion, so we don't have to
 * revert afterwards like v1/v2.
 *
 * Budget: ~30 credits (50 → 20 reserve).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Small-state metros + a few previously-missed mid-sized metros.
// Each = 1 SerpAPI credit.
const METROS = [
  // MS (1 touchless), WY (4), NM (5), RI (5), DE (5), UT (7), AK (10), AR (12), AL (12), ME (13)
  ['Jackson', 'MS'], ['Gulfport', 'MS'], ['Biloxi', 'MS'],
  ['Cheyenne', 'WY'], ['Casper', 'WY'],
  ['Albuquerque', 'NM'], ['Santa Fe', 'NM'], ['Las Cruces', 'NM'],
  ['Providence', 'RI'], ['Warwick', 'RI'],
  ['Wilmington', 'DE'], ['Dover', 'DE'],
  ['Salt Lake City', 'UT'], ['Provo', 'UT'], ['Ogden', 'UT'],
  ['Anchorage', 'AK'], ['Fairbanks', 'AK'],
  ['Little Rock', 'AR'], ['Fayetteville', 'AR'], ['Fort Smith', 'AR'],
  ['Birmingham', 'AL'], ['Huntsville', 'AL'], ['Mobile', 'AL'], ['Montgomery', 'AL'],
  ['Portland', 'ME'], ['Bangor', 'ME'],
  ['Boise', 'ID'], ['Nampa', 'ID'],
  // Mid-size previously-missed
  ['Kansas City', 'KS'],
];

// EXPANDED blocklist — apply at domain-match time, so we never promote these
const TUNNEL_DOMAINS = new Set([
  'tidalwaveautospa.com',
  'whistleexpresscarwash.com',
  'take5carwashes.com',
  'tsunamiexpress.com',
  'mistercarwash.com',
  'quickquack.com',
  'tommysexpress.com',
  'zipscarwash.com',
  'whitewaterexpress.com',
  'rocketwashwi.com',
  'americanpridexpress.com',
  'myexpresscarwash.com',
  'quicknclean.net',
  'xpressolube.com',
  'way.com',
]);
const EXCLUDE_DOMAINS = /^(?:yelp\.com|m\.yelp\.com|facebook\.com|instagram\.com|tiktok\.com|amazon\.com|alibaba\.com|ebay\.com|walmart\.com|quora\.com|reddit\.com|yellowpages\.com|mapquest\.com|tripadvisor\.com|bbb\.org|carwashforum\.com|carwash\.com|threads\.com|github\.com|pinterest\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|wikipedia\.org|google\.com)$/i;

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

async function serpSearch(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '30', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

console.log('Loading DB listings...');
const db = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, website, is_touchless').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  db.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${db.length} listings`);

const dbByDomain = new Map();
for (const l of db) {
  if (l.website) {
    const d = extractDomain(l.website);
    if (d) {
      if (!dbByDomain.has(d)) dbByDomain.set(d, []);
      dbByDomain.get(d).push(l);
    }
  }
}

const promotions = new Set();
const tunnelBlocked = new Map();
const candidateDomains = new Map();
let creditsUsed = 0;

for (const [city, state] of METROS) {
  const q = `"touchless" OR "touch-free" OR "touch free" OR "brushless" OR "laser wash" "car wash" "${city}, ${state}"`;
  const json = await serpSearch(q);
  creditsUsed++;
  if (json.error) { console.log(`${city}, ${state}: ${json.error}`); continue; }
  const results = json.organic_results || [];
  const touchlessRe = /touchless|touch-free|touch free|brushless|no brushes|laserwash|laser wash|only water touches/i;
  let matchedHere = 0, blockedHere = 0;
  for (const r of results) {
    const blob = `${r.title || ''} ${r.snippet || ''}`;
    if (!touchlessRe.test(blob)) continue;
    const domain = extractDomain(r.link);
    if (!domain || EXCLUDE_DOMAINS.test(domain)) continue;
    if (TUNNEL_DOMAINS.has(domain)) {
      tunnelBlocked.set(domain, (tunnelBlocked.get(domain) || 0) + 1);
      blockedHere++;
      continue;
    }
    if (dbByDomain.has(domain)) {
      const hits = dbByDomain.get(domain).filter(l => l.state === state && l.is_touchless !== true);
      for (const l of hits) { promotions.add(l.id); matchedHere++; }
    }
    if (!candidateDomains.has(domain)) candidateDomains.set(domain, { count: 0, metros: new Set() });
    const c = candidateDomains.get(domain);
    c.count++;
    c.metros.add(`${city}, ${state}`);
  }
  console.log(`${String(city+', '+state).padEnd(26)} results:${String(results.length).padStart(3)}  promoted:${matchedHere}  blocked:${blockedHere}`);
}

console.log(`\n=== Summary ===`);
console.log(`Credits used: ${creditsUsed}`);
console.log(`Promotions queued: ${promotions.size}`);
console.log(`Tunnel blocks applied: ${[...tunnelBlocked.values()].reduce((a,b)=>a+b,0)}`);
if (tunnelBlocked.size > 0) {
  console.log(`  Blocked domains:`);
  for (const [d, n] of tunnelBlocked) console.log(`    ${d}: ${n}`);
}

if (promotions.size > 0) {
  const ids = [...promotions];
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true,
      is_approved: false,
      touchless_verified: 'website',
      classification_source: 'promoted_apr16_metro_sweep_v3',
      crawl_notes: 'Promoted: metro-sweep v3 domain match with tunnel-chain blocklist applied. Held at is_approved=false pending enrichment.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`DB promotions applied (unapproved pending enrichment): ${done}`);
}

writeFileSync('scripts/discovery-output/metro-sweep-v3.json', JSON.stringify({
  creditsUsed, promotions: promotions.size,
  tunnelBlocked: [...tunnelBlocked.entries()].map(([d,n])=>({domain:d, count:n})),
  topDomains: [...candidateDomains.entries()].map(([d,v])=>({domain:d, count:v.count, metros:[...v.metros]})).sort((a,b)=>b.count-a.count).slice(0, 80),
}, null, 2));

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`\nSerpAPI remaining: ${acct.plan_searches_left}`);
