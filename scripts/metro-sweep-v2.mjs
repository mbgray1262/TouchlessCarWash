#!/usr/bin/env node
/**
 * Metro sweep v2 — next tier of gap metros.
 * Same logic as v1: 1 credit per metro, domain-match promotion only,
 * is_approved=false until enrichment. Budget: ~40 credits (100 → 60).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const METROS = [
  ['Boston', 'MA'], ['Worcester', 'MA'], ['Springfield', 'MA'],
  ['Providence', 'RI'],
  ['Baltimore', 'MD'], ['Annapolis', 'MD'],
  ['Atlanta', 'GA'], ['Savannah', 'GA'], ['Augusta', 'GA'],
  ['Charlotte', 'NC'], ['Raleigh', 'NC'], ['Greensboro', 'NC'], ['Durham', 'NC'],
  ['Richmond', 'VA'], ['Virginia Beach', 'VA'], ['Norfolk', 'VA'], ['Roanoke', 'VA'],
  ['Seattle', 'WA'], ['Spokane', 'WA'], ['Tacoma', 'WA'],
  ['Denver', 'CO'], ['Colorado Springs', 'CO'], ['Boulder', 'CO'],
  ['Milwaukee', 'WI'], ['Madison', 'WI'], ['Green Bay', 'WI'],
  ['Minneapolis', 'MN'], ['St. Paul', 'MN'], ['Duluth', 'MN'],
  ['Des Moines', 'IA'], ['Cedar Rapids', 'IA'],
  ['Kansas City', 'MO'], ['St. Louis', 'MO'], ['Springfield', 'MO'],
  ['Wichita', 'KS'], ['Topeka', 'KS'],
  ['Indianapolis', 'IN'], ['Fort Wayne', 'IN'], ['Evansville', 'IN'],
  ['Cincinnati', 'OH'], ['Cleveland', 'OH'], ['Columbus', 'OH'], ['Toledo', 'OH'],
  ['Pittsburgh', 'PA'], ['Philadelphia', 'PA'], ['Harrisburg', 'PA'],
  ['Buffalo', 'NY'], ['Rochester', 'NY'], ['Syracuse', 'NY'], ['Albany', 'NY'],
];

const EXCLUDE_DOMAINS = /^(?:yelp\.com|m\.yelp\.com|facebook\.com|instagram\.com|tiktok\.com|amazon\.com|alibaba\.com|ebay\.com|walmart\.com|quora\.com|reddit\.com|yellowpages\.com|mapquest\.com|tripadvisor\.com|bbb\.org|carwashforum\.com|carwash\.com|threads\.com|github\.com|pinterest\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|wikipedia\.org|google\.com|take5carwashes\.com|tsunamiexpress\.com|mistercarwash\.com|quickquack\.com|tommysexpress\.com|zipscarwash\.com|whitewaterexpress\.com)$/i;
const EXCLUDE_CHAINS = /take5|tsunami|rocket|quickquack|mistercarwash|zipscarwash|whitewater|tommys|oilchangers|greasemonkey/i;

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
const candidateDomains = new Map();
let creditsUsed = 0;

for (const [city, state] of METROS) {
  const q = `"touchless" OR "touch-free" OR "touch free" OR "brushless" OR "laser wash" "car wash" "${city}, ${state}"`;
  const json = await serpSearch(q);
  creditsUsed++;
  if (json.error) { console.log(`${city}, ${state}: ${json.error}`); continue; }
  const results = json.organic_results || [];
  const touchlessRe = /touchless|touch-free|touch free|brushless|no brushes|laserwash|laser wash|only water touches/i;
  let matchedHere = 0;
  for (const r of results) {
    const blob = `${r.title || ''} ${r.snippet || ''}`;
    if (!touchlessRe.test(blob)) continue;
    const domain = extractDomain(r.link);
    if (!domain || EXCLUDE_DOMAINS.test(domain)) continue;
    if (EXCLUDE_CHAINS.test(domain) || EXCLUDE_CHAINS.test(blob)) continue;
    if (dbByDomain.has(domain)) {
      const hits = dbByDomain.get(domain).filter(l => l.state === state && l.is_touchless !== true);
      for (const l of hits) { promotions.add(l.id); matchedHere++; }
    }
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
      is_approved: false,
      touchless_verified: 'website',
      classification_source: 'promoted_apr16_metro_sweep_v2',
      crawl_notes: 'Promoted: domain matched in metro-sweep Google result with touchless keyword. Held at is_approved=false pending enrichment.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`DB promotions applied (unapproved pending enrichment): ${done}`);
}

writeFileSync('scripts/discovery-output/metro-sweep-v2.json', JSON.stringify({
  creditsUsed, promotions: promotions.size,
  topDomains: [...candidateDomains.entries()].map(([d,v])=>({domain:d, count:v.count, metros:[...v.metros]})).sort((a,b)=>b.count-a.count).slice(0, 100),
}, null, 2));

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`\nSerpAPI remaining: ${acct.plan_searches_left}`);
