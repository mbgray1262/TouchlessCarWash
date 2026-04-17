#!/usr/bin/env node
/**
 * Revert 16 obvious-false-positive Yelp imports:
 *   - Detailers (hand wash, detailing shops)
 *   - Tunnel-branded businesses ("Express", "Tunnel O Suds", "Zoom Express")
 *   - Generic Shell Gas Station (too generic a name to classify)
 *
 * These got through yesterday's 1-positive-review threshold because
 * customer reviews sometimes mention "touchless" in comparison context
 * ("I wish this was touchless", "I went here expecting touchless").
 * The strict keyword filter couldn't catch every ambiguous phrasing.
 *
 * Set is_touchless=false + is_approved=false. Keep the row (so if a
 * future pass finds strong 3+ review evidence, we can re-promote).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const TUNNEL = /\b(?:tunnel|express)\b/i;
const NOT_WASH = /\b(?:detailing|detail|mobile|hand wash|hand-wash)\b/i;
const GAS_GENERIC = /^Shell Gas Station$/i;

const { data } = await sb.from('listings')
  .select('id, name, city, state')
  .eq('classification_source', 'imported_apr16_yelp_new_business');

const toRevert = data.filter(l =>
  TUNNEL.test(l.name) || NOT_WASH.test(l.name) || GAS_GENERIC.test(l.name)
);

console.log(`Reverting ${toRevert.length} false-positive imports:`);
for (const l of toRevert) console.log(`  ${l.name.slice(0,40).padEnd(40)} ${l.city}, ${l.state}`);

const ids = toRevert.map(l => l.id);
let done = 0;
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const { error } = await sb.from('listings').update({
    is_touchless: false,
    is_approved: false,
    touchless_verified: null,
    classification_source: 'reverted_apr17_yelp_import_bad_name',
    crawl_notes: `Reverted: business name contains 'tunnel', 'express', 'detailing', 'mobile' or 'hand wash' — clear non-touchless signals that slipped through yesterday's 1-positive-review threshold. Reviews probably mentioned touchless in comparison/aspiration context rather than confirming the service.`,
  }).in('id', batch);
  if (!error) done += batch.length;
  else console.error(error);
}
console.log(`\nReverted: ${done}`);
