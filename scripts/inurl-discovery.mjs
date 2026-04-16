#!/usr/bin/env node
/**
 * Discovery via Google `inurl:` operator (SerpAPI).
 *
 * Google has already indexed which domains have /touchless/, /touch-free/,
 * /laser-wash/ etc. in their URLs. We exploit that index by searching with
 * inurl: operator, collecting domains, and matching them against our DB.
 *
 * If a listing's website domain matches a URL Google identifies as containing
 * touchless/brushless/laser paths, that's strong evidence.
 *
 * Cost: ~25 SerpAPI credits for a broad sweep.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Queries — combine inurl: with car-wash context to avoid TSA/faucet noise
const QUERIES = [
  // URL path patterns
  'inurl:/touchless-car-wash',
  'inurl:/touch-free-car-wash',
  'inurl:/touch-free-wash',
  'inurl:/touchless-wash',
  'inurl:/touchless-bay',
  'inurl:/touch-free',
  'inurl:/touchless "car wash"',
  'inurl:/touchfree "car wash"',
  'inurl:/brushless "car wash"',
  'inurl:/laserwash',
  'inurl:/laser-wash',
  'inurl:/our-wash touchless',
  'inurl:/our-washes touchless',
  'inurl:/services touchless "car wash"',
  'inurl:/wash-options touchless',
  // Include equipment brand URLs
  'inurl:laserwash "car wash" -pdq.com',
  'inurl:washworld "car wash"',
  'inurl:pdq-laserwash',
  // Automatic touchless
  'inurl:touchless-automatic',
  'inurl:automatic-touchless',
];

// Excluded domains — known non-touchless chains, articles, marketplaces, etc.
const EXCLUDE_DOMAINS = /^(?:yelp\.com|m\.yelp\.com|facebook\.com|instagram\.com|tiktok\.com|shop\.tiktok\.com|amazon\.com|alibaba\.com|ebay\.com|walmart\.com|quora\.com|reddit\.com|yellowpages\.com|mapquest\.com|tripadvisor\.com|bbb\.org|carwashforum\.com|carwash\.com|threads\.com|carwashworld\.com\.au|github\.com|justanswer\.com|pinterest\.com|linkedin\.com|youtube\.com|twitter\.com|x\.com|wikipedia\.org|automateusa\.com|opwvws\.com|opw-ftg\.eu|pdq\.com|markvii\.net|washworld\.com|ncswash\.com|reliableplus\.com|zimbrick\.com|washhounds\.com|carparts\.com|mbofnewton\.com|springfieldacura\.com|take5carwashes\.com|tsunamiexpress\.com|rocketwashwi\.com|myexpresscarwash\.com)$/i;
// Also exclude tunnel-chain URL patterns even if domain unique
const TUNNEL_CHAIN_URL_RE = /take5carwash|tsunamiexpress|rocketwashwi|myexpresscarwash|mistercarwash|quickquack|zipscarwash|tommysexpress|whitewaterexpress/i;

async function serpSearch(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '50', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

const foundDomains = new Map(); // domain → { count, firstQuery, urls }
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
      if (!domain) continue;
      if (EXCLUDE_DOMAINS.test(domain)) continue;
      if (TUNNEL_CHAIN_URL_RE.test(r.link)) continue;
      if (!foundDomains.has(domain)) foundDomains.set(domain, { count: 0, urls: [], queries: [] });
      const d = foundDomains.get(domain);
      d.count++;
      d.urls.push(r.link);
      d.queries.push(q);
    }
  } catch (e) {
    console.log(`"${q}": error ${e.message}`);
  }
}

console.log(`\n=== Collected ${foundDomains.size} unique domains from ${creditsUsed} SerpAPI credits ===`);

// Match against our DB — find listings whose website domain matches
const all = [];
for (let offset = 0; offset < 50000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, website, is_touchless, touchless_verified, classification_source').not('website','is',null).range(offset, offset + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`DB listings with website: ${all.length}`);

const matches = [];
for (const l of all) {
  const domain = extractDomain(l.website);
  if (domain && foundDomains.has(domain)) {
    matches.push({ ...l, matchedDomain: domain, evidence: foundDomains.get(domain) });
  }
}
console.log(`\n=== ${matches.length} DB listings match a Google-indexed touchless URL ===`);

const byStatus = { alreadyTouchless: 0, notTouchless: 0, nullTouchless: 0 };
const toPromote = [];
for (const m of matches) {
  if (m.is_touchless === true) byStatus.alreadyTouchless++;
  else if (m.is_touchless === false) { byStatus.notTouchless++; toPromote.push(m); }
  else { byStatus.nullTouchless++; toPromote.push(m); }
}
console.log(`  Already is_touchless=true: ${byStatus.alreadyTouchless}`);
console.log(`  Currently is_touchless=false: ${byStatus.notTouchless}`);
console.log(`  Currently is_touchless=null: ${byStatus.nullTouchless}`);

console.log(`\nSample domains WITH multiple matches (possible chains):`);
const byDomain = new Map();
for (const m of matches) {
  if (!byDomain.has(m.matchedDomain)) byDomain.set(m.matchedDomain, []);
  byDomain.get(m.matchedDomain).push(m);
}
const multi = Array.from(byDomain.entries()).filter(([,arr]) => arr.length >= 2).sort((a,b) => b[1].length - a[1].length);
for (const [d, arr] of multi.slice(0, 15)) console.log(`  ${d}: ${arr.length} DB listings`);

console.log(`\nFirst 30 to promote (currently not touchless):`);
for (const m of toPromote.slice(0, 30)) {
  console.log(`  ${m.name.slice(0, 40).padEnd(40)} ${m.city}, ${m.state}  → ${m.matchedDomain}`);
}

// Save audit
writeFileSync('scripts/discovery-output/inurl-discovery.json', JSON.stringify({
  queries: QUERIES,
  domainsFound: Array.from(foundDomains.entries()).map(([d, v]) => ({ domain: d, ...v })),
  matches: matches.map(m => ({ id: m.id, name: m.name, city: m.city, state: m.state, website: m.website, matched: m.matchedDomain })),
  toPromote: toPromote.map(m => ({ id: m.id, name: m.name, city: m.city, state: m.state, matched: m.matchedDomain })),
}, null, 2));
console.log('\nAudit saved. Review scripts/discovery-output/inurl-discovery.json');
console.log('\nNot promoting automatically — review list first, then run promotion separately.');

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`\nSerpAPI credits remaining: ${acct.plan_searches_left}`);
