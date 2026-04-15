#!/usr/bin/env node
/**
 * Fetches website URLs for the 40 confirmed-touchless listings we just
 * imported. Uses SerpAPI engine=google_maps with place_id to get full place
 * details (1 credit per listing).
 *
 * Also captures: hours, types, description, extended photo URLs — so we get
 * extra enrichment data on the same credit.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = [resolve(repoRoot, '.env.local'), '/Users/michaelgray/Projects/TouchlessCarWash/.env.local']
  .find(p => { try { readFileSync(p,'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath,'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const apiKey = env.SERPAPI_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const today = new Date(); today.setHours(0,0,0,0);
const { data: confirmed } = await sb.from('listings')
  .select('id, name, city, state, google_place_id, website')
  .gte('created_at', today.toISOString())
  .eq('review_mine_status', 'touchless_found');

const needWebsite = confirmed.filter(c => !c.website && c.google_place_id);
console.log(`Fetching websites for ${needWebsite.length} confirmed-touchless listings...`);

let updated = 0, noWebsite = 0, errors = 0;
for (let i = 0; i < needWebsite.length; i++) {
  const l = needWebsite[i];
  const params = new URLSearchParams({
    engine: 'google_maps',
    place_id: l.google_place_id,
    api_key: apiKey,
  });
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) { errors++; console.error(`  ! ${l.name}: HTTP ${res.status}`); await new Promise(r=>setTimeout(r,2000)); continue; }
    const json = await res.json();
    const place = json.place_results || {};

    const update = {};
    if (place.website) update.website = place.website;
    if (place.hours) update.hours = place.hours;
    if (place.description && place.description.length > 20) update.google_description = place.description;

    if (!update.website) {
      noWebsite++;
      // Still save hours/description if we got them
      if (Object.keys(update).length > 0) await sb.from('listings').update(update).eq('id', l.id);
      console.log(`  - ${l.name} — no website on Google`);
    } else {
      await sb.from('listings').update(update).eq('id', l.id);
      updated++;
      console.log(`  ✓ ${l.name} → ${update.website.slice(0, 50)}`);
    }
  } catch (e) {
    errors++;
    console.error(`  ! ${l.name}: ${e.message.slice(0, 80)}`);
  }
  await new Promise(r => setTimeout(r, 1000)); // throttle to avoid 429
}

const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${apiKey}`)).json();
console.log(`\n=== Done ===`);
console.log(`Updated with website: ${updated}`);
console.log(`No website on Google: ${noWebsite}`);
console.log(`Errors: ${errors}`);
console.log(`SerpAPI credits remaining: ${acct.plan_searches_left}`);
