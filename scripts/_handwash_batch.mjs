/**
 * Dump N hand-wash validation candidates as a maps_gallery batch on stdout:
 *   [[listing_id, place_id, name], ...]
 * Candidates: is_hand_wash=true, not yet photo-reviewed, has a place_id.
 * Prefer ones MISSING a real hero first (Michael: "many have no images even
 * though there are beautiful Google images") so validation exercises the hard cases.
 *
 * Usage: node scripts/_handwash_batch.mjs [N] > /tmp/hw_batch.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const N = parseInt(process.argv[2] || '10', 10);
const MODE = process.argv[3] || 'handwash'; // 'handwash' candidates | 'selfserve' weed-out test
let q = sb.from('listings')
  .select('id, name, city, state, google_place_id, hero_image, hero_image_source, latitude, longitude')
  .not('google_place_id', 'is', null);
if (MODE === 'selfserve') {
  // Confirmed self-serve wand-bay listings that are NOT hand washes — the weed-out
  // classifier should DROP every one of these (is_hand_wash=false).
  q = q.eq('is_self_service', true).not('self_service_reviewed_at', 'is', null).not('is_hand_wash', 'is', true).order('name');
} else {
  q = q.eq('is_hand_wash', true).is('hand_wash_reviewed_at', null).order('hero_image', { nullsFirst: true });
}
const { data, error } = await q.limit(N);
if (error) { console.error(error); process.exit(1); }
// Meta (coords etc.) to stderr so stdout stays pure batch JSON for python.
console.error(JSON.stringify(data.map(d => ({ id: d.id, name: d.name, city: d.city, state: d.state, place_id: d.google_place_id, lat: d.latitude, lng: d.longitude, has_hero: !!d.hero_image })), null, 2));
process.stdout.write(JSON.stringify(data.map(d => [d.id, d.google_place_id, d.name])));
