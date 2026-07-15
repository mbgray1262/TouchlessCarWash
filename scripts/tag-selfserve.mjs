/**
 * TAG SELF-SERVE (existing DB matches only).
 * Sets is_self_service=true on listings that (a) match a harvested self-serve place_id AND
 * (b) are not an express-tunnel-chain false positive. ADDITIVE — only is_self_service is
 * written; is_touchless / is_approved are never touched. is_self_service is read by NO public
 * page, so this publishes nothing. Backs up every affected row first (reversible).
 *
 * Run: node scripts/tag-selfserve.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Express-tunnel chains (NOT self-serve). A touchless-verified listing overrides this (genuine mixed).
const TUNNEL = /\b(mister car ?wash|take[\s-]?5|zips|quick ?quack|white ?water|super ?star|whistle express|tidal wave|tommy'?s|tsunami|luv car ?wash|go car ?wash|club car ?wash|el car ?wash|autobell|rocket car ?wash|caliber car ?wash|spinx)\b/i;

const harvest = JSON.parse(readFileSync('scripts/_selfserve_harvest.json', 'utf8'));
const harvestIds = new Set(harvest.map(h => h.place_id));

// load all listings, keep those matching a harvested place_id
const rows = []; { let from = 0; while (true) { const { data } = await sb.from('listings').select('id,name,google_place_id,is_touchless,is_self_service,is_approved').not('google_place_id', 'is', null).order('id').range(from, from + 999); if (!data || !data.length) break; data.forEach(r => { if (harvestIds.has(r.google_place_id)) rows.push(r); }); from += data.length; if (data.length < 1000) break; } }
console.log('harvested place_ids matching our DB:', rows.length.toLocaleString());

const toTag = [], excludedTunnel = []; let alreadyTagged = 0, mixTouchless = 0, untyped = 0;
for (const r of rows) {
  if (r.is_self_service === true) { alreadyTagged++; continue; }
  const isTunnelName = TUNNEL.test(r.name || '');
  if (isTunnelName && r.is_touchless !== true) { excludedTunnel.push(r.name); continue; }
  toTag.push(r);
  if (r.is_touchless === true) mixTouchless++; else untyped++;
}

// backup then write (is_self_service only)
writeFileSync(`scripts/_backup_selfserve_tag_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(toTag.map(r => ({ id: r.id, name: r.name, prev_is_self_service: r.is_self_service })), null, 2));
console.log(`\nTagging is_self_service=true on ${toTag.length.toLocaleString()} listings (backup written)...`);
let done = 0;
for (let i = 0; i < toTag.length; i += 200) {
  const ids = toTag.slice(i, i + 200).map(r => r.id);
  const { error } = await sb.from('listings').update({ is_self_service: true }).in('id', ids);
  if (error) { console.log('  ERR', error.message); break; }
  done += ids.length; process.stdout.write(`  ${done}/${toTag.length}\r`);
}

console.log('\n\n==================== SELF-SERVE TAGGING DONE ====================');
console.log(`Tagged is_self_service=true: ${done.toLocaleString()}`);
console.log(`   ├─ existing TOUCHLESS (now touchless + self-serve): ${mixTouchless.toLocaleString()}  (touchless status untouched)`);
console.log(`   └─ previously untyped: ${untyped.toLocaleString()}`);
console.log(`Already tagged (skipped): ${alreadyTagged.toLocaleString()}`);
console.log(`Excluded as express-tunnel false positives: ${excludedTunnel.length.toLocaleString()}  e.g. ${[...new Set(excludedTunnel)].slice(0,6).join(', ')}`);
console.log(`\nNet-new imports (${harvest.length - rows.length} washes not yet in DB) = SEPARATE step, not done here.`);
