#!/usr/bin/env node
/**
 * Audit touchless coverage by state/metro and report SerpAPI credits.
 * Finds gaps so we know where metro-by-metro sweeps are most valuable.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI credits remaining: ${acct.plan_searches_left}`);

const byState = new Map();
const cityCounts = new Map();
const touchlessCityCounts = new Map();
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings')
    .select('state, city, is_touchless')
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  for (const l of data) {
    const key = `${l.city}, ${l.state}`;
    cityCounts.set(key, (cityCounts.get(key) || 0) + 1);
    if (l.is_touchless) {
      byState.set(l.state, (byState.get(l.state) || 0) + 1);
      touchlessCityCounts.set(key, (touchlessCityCounts.get(key) || 0) + 1);
    }
  }
  if (data.length < 1000) break;
}

console.log(`\nTouchless counts by state (lowest first):`);
const statesSorted = [...byState.entries()].sort((a,b)=>a[1]-b[1]);
for (const [s, c] of statesSorted.slice(0, 25)) console.log(`  ${s}: ${c}`);

// Metros where we have MANY total car washes but FEW touchless = likely under-discovered
console.log(`\nMetros with most untapped potential (total car washes >= 15, touchless ratio < 25%):`);
const gaps = [];
for (const [city, total] of cityCounts.entries()) {
  if (total < 15) continue;
  const touch = touchlessCityCounts.get(city) || 0;
  const ratio = touch / total;
  if (ratio < 0.25) gaps.push({ city, total, touch, ratio });
}
gaps.sort((a,b) => b.total - a.total);
for (const g of gaps.slice(0, 30)) {
  console.log(`  ${g.city.padEnd(35)} total:${String(g.total).padStart(4)}  touchless:${String(g.touch).padStart(3)}  (${(g.ratio*100).toFixed(0)}%)`);
}

console.log(`\nTotal states covered: ${byState.size}`);
console.log(`Total metros in DB: ${cityCounts.size}`);
