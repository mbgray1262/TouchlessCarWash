#!/usr/bin/env node
/**
 * Second sweep of Google inurl: discovery with expanded query set.
 * Adds more URL patterns Google indexes on touchless car wash sites.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Expanded query set — different URL patterns touchless sites use
const QUERIES = [
  // More URL paths
  'inurl:/touchless-bay',
  'inurl:/touch-free-bay',
  'inurl:/touchless-automatic "car wash"',
  'inurl:/in-bay-automatic "car wash"',
  'inurl:/touch-less "car wash"',
  'inurl:/brushless-wash-bay',
  'inurl:/laser-wash-bay',
  'inurl:/rollover-touchless',
  'inurl:/touchless-rollover',
  // Membership/club URLs
  'inurl:/touchless-wash-club',
  'inurl:/touch-free-club',
  'inurl:/touchless-membership',
  // Equipment-specific URLs
  'inurl:/laserwash-360',
  'inurl:/pdq-laserwash',
  'inurl:/washworld-razor',
  'inurl:/mark-vii',
  // Gallery / services pages
  'inurl:/services/touchless-car-wash',
  'inurl:/services/touch-free-car-wash',
  'inurl:/wash-types/touchless',
  'inurl:/wash-options/touchless',
  // More name patterns
  'inurl:touch-free-car-wash',
  'inurl:touchless-drive-thru',
  'inurl:no-touch-car-wash',
  'inurl:touch-free-auto-wash',
  'inurl:touchless-wash-bays',
  'inurl:brushless-car-wash-near',
];

// Same exclude list as v1 + additions we learned
const EXCLUDE_DOMAINS = /^(?:yelp\.com|m\.yelp\.com|facebook\.com|instagram\.com|tiktok\.com|shop\.tiktok\.com|amazon\.com|alibaba\.com|ebay\.com|walmart\.com|quora\.com|reddit\.com|yellowpages\.com|mapquest\.com|tripadvisor\.com|bbb\.org|carwashforum\.com|carwash\.com|threads\.com|carwashworld\.com\.au|github\.com|justanswer\.com|pinterest\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|wikipedia\.org|automateusa\.com|opwvws\.com|opw-ftg\.eu|pdq\.com|markvii\.net|washworld\.com|ncswash\.com|reliableplus\.com|zimbrick\.com|washhounds\.com|carparts\.com|mbofnewton\.com|springfieldacura\.com|take5carwashes\.com|tsunamiexpress\.com|rocketwashwi\.com|myexpresscarwash\.com|google\.com|ultraleap\.com|scjp\.com|dornbracht\.com|sloan\.com|hillyard\.com|moldex\.com|araero\.com|docs\.ultraleap\.com|deltafaucet\.com|delta\.com|aa\.com|support\.southwest\.com|tsa\.gov|newsnationnow\.com|disneytouristblog\.com)$/i;

async function serpSearch(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '50', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

const foundDomains = new Map();
let creditsUsed = 0;

for (const q of QUERIES) {
  try {
    const json = await serpSearch(q);
    creditsUsed++;
    if (json.error) { console.log(`"${q}": ${json.error}`); continue; }
    const results = json.organic_results || [];
    console.log(`"${q}": ${results.length} results`);
    for (const r of results) {
      const domain = extractDomain(r.link);
      if (!domain || EXCLUDE_DOMAINS.test(domain)) continue;
      if (/take5carwash|tsunamiexpress|rocketwashwi|myexpresscarwash|mistercarwash|quickquack|zipscarwash|tommysexpress|whitewaterexpress/i.test(r.link)) continue;
      if (!foundDomains.has(domain)) foundDomains.set(domain, { count: 0, urls: [] });
      foundDomains.get(domain).count++;
      foundDomains.get(domain).urls.push(r.link);
    }
  } catch (e) { console.log(`"${q}": err ${e.message}`); }
}

console.log(`\n=== ${foundDomains.size} unique domains from ${creditsUsed} credits ===`);

// Load DB listings and match
const all = [];
for (let offset = 0; offset < 50000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, website, is_touchless').not('website','is',null).range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}

const matches = [];
for (const l of all) {
  const domain = extractDomain(l.website);
  if (domain && foundDomains.has(domain)) matches.push({ ...l, matchedDomain: domain });
}
console.log(`DB listings matching: ${matches.length}`);

const byDomain = new Map();
for (const m of matches) {
  if (!byDomain.has(m.matchedDomain)) byDomain.set(m.matchedDomain, []);
  byDomain.get(m.matchedDomain).push(m);
}

// Safety: skip known mixed/tunnel chains and single-domain unknowns
const EXCLUDE_CHAINS = /oilchangers|greasemonkey|gateexpress|take5|tsunami|rocket|quickquack|mistercarwash|zipscarwash|whitewater|tommys/i;

const toPromote = [];
for (const [domain, listings] of byDomain.entries()) {
  if (EXCLUDE_CHAINS.test(domain)) continue;
  // Known-trusted OR 2+ listings at same domain (chain-consistent)
  if (listings.length >= 2 || /cobblestone|brownbear|splashcarwashes|driveandshine|haffners|scrubadub|bluetidecarwash|touchlesscarwashmd|washboxva|chaskacarwash|hogwashcarwash|mybudgetcarwash|bluefallscarwash|hnsenergygroup|wavescarwashes|spotfreecar|clancyscarwash|superkleancarwash|kscarwashes|starwashmassillon|adirondackcarwash|hurricanecarwash/i.test(domain)) {
    for (const l of listings) {
      if (l.is_touchless !== true) toPromote.push(l);
    }
  }
}
console.log(`\nTo promote: ${toPromote.length}`);
for (const m of toPromote.slice(0, 25)) console.log(`  ${m.name.slice(0, 38).padEnd(38)} ${m.city}, ${m.state}  → ${m.matchedDomain}`);

// Apply
if (toPromote.length > 0) {
  const ids = toPromote.map(l => l.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true, is_approved: true,
      touchless_verified: 'website',
      classification_source: 'promoted_apr16_inurl_v2',
      crawl_notes: 'Promoted: business website domain matched Google inurl: v2 sweep (touchless URL paths indexed by Google).',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`Promoted: ${done}`);
}

writeFileSync('scripts/discovery-output/inurl-discovery-v2.json', JSON.stringify({
  creditsUsed, domains: foundDomains.size, matches: matches.length, toPromote: toPromote.length,
  domainBreakdown: Array.from(byDomain.entries()).map(([d, arr]) => ({domain: d, count: arr.length})).sort((a,b)=>b.count-a.count),
}, null, 2));

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`\nTotal touchless now: ${count}`);
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI remaining: ${acct.plan_searches_left}`);
