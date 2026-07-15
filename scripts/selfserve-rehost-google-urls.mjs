/**
 * Fix broken gallery images: the legacy google_photo_url / street_view_url fields
 * hold RAW Google links that expire (~39% already dead) and are appended to the
 * gallery on the detail page + admin. This rehosts the still-ALIVE ones to Supabase
 * (permanent) and repoints the field; NULLs the DEAD ones so no broken thumbnail
 * can render. NEVER touches hero_image or the photos array — every hero is kept.
 *   node scripts/selfserve-rehost-google-urls.mjs        # dry-run
 *   node scripts/selfserve-rehost-google-urls.mjs --run  # apply
 * Scope: is_self_service=true (self-serve + mixed). Backed up + reversible.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const RUN = process.argv.includes('--run');

const isSupabase = (u) => { try { return new URL(u).hostname.includes('supabase'); } catch { return false; } };
async function fetchImg(u) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    return { buf: Buffer.from(await r.arrayBuffer()), ct };
  } catch { return null; }
}
async function rehost(buf, ct, id, slot) {
  const path = `${id}/rehost-${slot}-${Date.now()}.${(ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
  const { error } = await sb.storage.from('listing-photos').upload(path, buf, { contentType: ct, upsert: true });
  if (error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}

// Load scope
let all = [], from = 0;
while (true) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, hero_image, google_photo_url, street_view_url, photos')
    .eq('is_self_service', true)
    .or('google_photo_url.not.is.null,street_view_url.not.is.null')
    .order('id').range(from, from + 999);
  if (!data || !data.length) break;
  all.push(...data); from += data.length;
  if (data.length < 1000) break;
}
console.log(`${all.length} self-serve listings carry a google_photo_url/street_view_url. Processing…\n`);

let rehosted = 0, nulled = 0, kept = 0, touched = 0, nowPlaceholder = [];
const undo = [];
let processed = 0;
const CONC = 10;

async function handleField(l, field, slot) {
  const url = l[field];
  if (!url || isSupabase(url)) return { key: field, alive: !!url }; // already permanent or empty
  const img = await fetchImg(url);
  if (img) {
    if (RUN) {
      const newUrl = await rehost(img.buf, img.ct, l.id, slot);
      if (newUrl) { l._upd = l._upd || {}; l._upd[field] = newUrl; rehosted++; return { key: field, alive: true }; }
    } else { rehosted++; return { key: field, alive: true }; }
    return { key: field, alive: true }; // upload failed → leave as-is (alive)
  }
  // dead → null it
  l._upd = l._upd || {}; l._upd[field] = null; nulled++;
  return { key: field, alive: false };
}

async function worker() {
  while (all.length) {
    const l = all.shift(); processed++;
    const gp = await handleField(l, 'google_photo_url', 'gp');
    const sv = await handleField(l, 'street_view_url', 'sv');
    // Would this listing end up with NO working display image? (hero null + both fallbacks dead/empty)
    const hasHero = !!l.hero_image;
    const hasSupaPhoto = (l.photos || []).some(isSupabase);
    const gpAlive = gp.alive, svAlive = sv.alive;
    if (!hasHero && !hasSupaPhoto && !gpAlive && !svAlive) nowPlaceholder.push(`${l.name} (${l.city}, ${l.state})`);
    if (l._upd) {
      touched++;
      undo.push({ id: l.id, name: l.name, google_photo_url: l.google_photo_url, street_view_url: l.street_view_url });
      if (RUN) { const { error } = await sb.from('listings').update(l._upd).eq('id', l.id); if (error) console.log(`  ⚠ ${l.name}: ${error.message}`); }
    } else kept++;
    if (processed % 100 === 0) console.log(`  …${processed} processed (rehosted ${rehosted}, nulled ${nulled})`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

console.log(`\n${RUN ? 'DONE' : 'DRY RUN'} — listings touched: ${touched}`);
console.log(`  alive Google URLs rehosted to Supabase (repointed): ${rehosted}`);
console.log(`  dead Google URLs nulled: ${nulled}`);
console.log(`  hero_image: NEVER touched (0 heroes changed)`);
console.log(`  listings that will now show a clean placeholder instead of a broken image (were already broken): ${nowPlaceholder.length}`);
if (nowPlaceholder.length) nowPlaceholder.slice(0, 20).forEach((n) => console.log(`     - ${n}`));
if (RUN && undo.length) {
  const f = `scripts/_backup_rehost_google_urls_${Date.now()}.json`;
  writeFileSync(f, JSON.stringify(undo, null, 2));
  console.log(`\nBacked up prior field values (reversible): ${f}`);
}
if (!RUN) console.log('\nDry run. Re-run with --run to apply.');
