#!/usr/bin/env node
/**
 * Chain-completion scan.
 *
 * For each known touchless chain in our DB, query Google for all their
 * location pages via `site:{chaindomain} inurl:/locations` etc. Each
 * result is a specific location page. Extract city+state from URL/title,
 * match against DB, find missing locations, flag for import.
 *
 * Cost: ~1-2 credits per chain = 30-50 credits total.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Known touchless chain domains to complete. Each chain gets one site: query
// to find all indexed location pages.
const CHAINS = [
  { name: 'Cobblestone Auto Spa', domain: 'cobblestone.com', paths: ['/locations', '/locations/', '/our-locations'] },
  { name: 'Brown Bear', domain: 'brownbear.com', paths: ['/locations', '/our-washes'] },
  { name: 'Splash Car Wash', domain: 'splashcarwashes.com', paths: ['/locations', '/our-locations'] },
  { name: 'Drive & Shine', domain: 'driveandshine.com', paths: ['/locations', '/our-wash'] },
  { name: "Haffner's", domain: 'haffners.com', paths: ['/locations', '/car-wash'] },
  { name: 'ScrubaDub', domain: 'scrubadub.com', paths: ['/locations'] },
  { name: 'Blue Tide Car Wash', domain: 'bluetidecarwash.com', paths: ['/locations'] },
  { name: 'Kwik Trip', domain: 'kwiktrip.com', paths: ['/locations'] },
  { name: 'Sheetz', domain: 'sheetz.com', paths: ['/store-locator'] },
  { name: 'Holiday Stationstores', domain: 'circlek.com', paths: ['/us/holiday-station'] },
  { name: 'Autowash', domain: 'autowashco.com', paths: ['/locations'] },
  { name: 'Power Market', domain: 'pwrmarket.com', paths: ['/locations'] },
  { name: 'Foam & Wash', domain: 'foamandwash.com', paths: ['/locations'] },
  { name: 'Prestige Car Wash', domain: 'prestigewash.com', paths: ['/locations'] },
  { name: 'Delta Sonic', domain: 'deltasoniccarwash.com', paths: ['/locations'] },
  { name: 'Mr. Magic', domain: 'mrmagiccarwash.com', paths: ['/locations'] },
  { name: 'Rocky Mountain Car Wash', domain: 'rockymountaincarwash.com', paths: ['/locations'] },
  { name: 'Jurassic Car Wash', domain: 'jurassiccarwash.com', paths: ['/locations'] },
  { name: "Salty Dog Car Wash", domain: 'saltydogcarwash.com', paths: ['/locations'] },
  { name: "Splash'n Shine", domain: 'splashnshine.com', paths: ['/locations'] },
  { name: 'Flagstop Car Wash', domain: 'flagstop.com', paths: ['/locations'] },
  { name: 'Mudbusters', domain: 'mudbusterscarwash.com', paths: ['/locations'] },
  { name: 'Auto Spa Speedy Wash', domain: 'autospaspeedywash.com', paths: ['/locations'] },
  { name: 'Finishline', domain: 'finishlineclean.com', paths: ['/locations'] },
  { name: 'Star Wash Massillon', domain: 'starwashmassillon.com', paths: ['/locations'] },
];

async function serpSearch(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '100', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

// Load our DB listings grouped by chain
const dbByChain = new Map();
const dbByDomain = new Map();
for (let offset = 0; offset < 50000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, website, parent_chain, is_touchless').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const l of data) {
    if (l.parent_chain) {
      if (!dbByChain.has(l.parent_chain)) dbByChain.set(l.parent_chain, []);
      dbByChain.get(l.parent_chain).push(l);
    }
    if (l.website) {
      try {
        const domain = new URL(l.website).hostname.replace(/^www\./, '').toLowerCase();
        if (!dbByDomain.has(domain)) dbByDomain.set(domain, []);
        dbByDomain.get(domain).push(l);
      } catch {}
    }
  }
  if (data.length < 1000) break;
}
console.log(`DB: ${dbByChain.size} parent_chains, ${dbByDomain.size} unique domains`);

const allFoundPages = [];
let creditsUsed = 0;

for (const chain of CHAINS) {
  const q = `site:${chain.domain} inurl:/locations OR inurl:/our-wash OR inurl:/store-locator OR inurl:/locations/`;
  const json = await serpSearch(q);
  creditsUsed++;
  if (json.error) { console.log(`${chain.name}: ${json.error}`); continue; }
  const results = json.organic_results || [];
  // Filter to actual location pages (not root, not pricing, not catalog)
  const locs = results.filter(r => {
    const url = r.link;
    try {
      const u = new URL(url);
      // Only this chain's own domain
      if (u.hostname.replace(/^www\./, '').toLowerCase() !== chain.domain) return false;
      // Location pages usually have a city/address in path
      if (u.pathname === '/' || u.pathname.length < 10) return false;
      // Skip blog/news/pricing
      if (/\/(blog|news|pricing|prices|packages|wash-club|memberships|about|contact|careers|jobs|faq)/i.test(u.pathname)) return false;
      return true;
    } catch { return false; }
  });
  console.log(`${chain.name} (${chain.domain}): ${locs.length} location pages`);
  // Show DB count for comparison
  const dbCount = (dbByDomain.get(chain.domain) || []).length;
  console.log(`  DB already has ${dbCount} listings at this domain`);
  // Extract city+state from URL / title for matching
  for (const r of locs.slice(0, 30)) {
    const titleMatch = (r.title || '').match(/([\w\s]+(?:Car\s*Wash|Auto\s*Spa)?)\s*[-|–]\s*([\w\s]+),?\s*([A-Z]{2})\b/);
    const urlMatch = r.link.match(/\/locations?\/([^\/]+?)(?:-([a-z]{2}))?\/?(?:\?|#|$)/i);
    allFoundPages.push({
      chain: chain.name, domain: chain.domain,
      url: r.link, title: r.title,
      snippet: r.snippet,
    });
  }
}

console.log(`\n=== ${allFoundPages.length} location pages found across ${CHAINS.length} chains (${creditsUsed} credits) ===`);

// For each chain, count DB listings vs found pages
const summary = {};
for (const chain of CHAINS) {
  const dbCount = (dbByChain.get(chain.name) || []).length;
  const foundCount = allFoundPages.filter(p => p.chain === chain.name).length;
  summary[chain.name] = { inDB: dbCount, foundOnSite: foundCount, possiblyMissing: Math.max(0, foundCount - dbCount) };
}
console.log('\nChain completeness (DB vs found on site):');
for (const [c, s] of Object.entries(summary)) {
  if (s.foundOnSite > 0) console.log(`  ${c.padEnd(30)} DB:${s.inDB.toString().padStart(4)}  Found:${s.foundOnSite.toString().padStart(4)}  Gap:${s.possiblyMissing.toString().padStart(4)}`);
}

writeFileSync('scripts/discovery-output/chain-completion-scan.json', JSON.stringify({
  creditsUsed,
  summary,
  pages: allFoundPages,
}, null, 2));
console.log(`\nAudit saved. Review scripts/discovery-output/chain-completion-scan.json`);
console.log(`\nNext step: for chains with a "Gap", compare location pages to DB listings and create new DB rows for missing locations.`);

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI remaining: ${acct.plan_searches_left}`);
