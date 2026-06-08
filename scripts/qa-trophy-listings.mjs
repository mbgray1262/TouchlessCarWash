/**
 * qa-trophy-listings — pre-outreach quality gate for every Best-Of trophy winner.
 *
 * Pulls all listings that hold a top-3 rank in best_of_rankings and checks each
 * against the outreach-readiness bar: hero image (quality), amenities, hours, AI
 * description, address, phone, map directions, review snippets, a HIGH Touchless
 * Satisfaction Score, and the paint-safe badge. Emits a per-listing report +
 * summary so we never email an owner a thin or low-scoring page.
 *
 * Run: node scripts/qa-trophy-listings.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 1. All trophy rows
const { data: trophies } = await db
  .from('best_of_rankings')
  .select('listing_id, metro_slug, metro_name, rank')
  .order('metro_slug').order('rank');
const byListing = new Map();
for (const t of trophies) {
  const arr = byListing.get(t.listing_id) ?? [];
  arr.push(`${t.metro_name} #${t.rank}`);
  byListing.set(t.listing_id, arr);
}
const ids = [...byListing.keys()];
console.log(`Trophy rows: ${trophies.length} | distinct listings: ${ids.length}`);

// 2. Listing records
const listings = [];
for (const c of chunk(ids, 200)) {
  const { data } = await db.from('listings')
    .select('id,name,slug,city,state,address,zip,phone,hours,amenities,latitude,longitude,hero_image,hero_image_source,hero_is_low_res,google_photo_url,street_view_url,logo_photo,photos,google_place_id,google_maps_url,description,description_generated_at,touchless_satisfaction_score,paint_safe_verified,paint_state,parent_chain')
    .in('id', c);
  listings.push(...data);
}

// 3. Review-snippet counts
const snipCount = new Map();
for (const c of chunk(ids, 200)) {
  for (let off = 0; ; off += 1000) {
    const { data } = await db.from('review_snippets').select('listing_id').in('listing_id', c).range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) snipCount.set(r.listing_id, (snipCount.get(r.listing_id) ?? 0) + 1);
    if (data.length < 1000) break;
  }
}

// 4. Evaluate
const nonEmptyObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
const rows = listings.map((l) => {
  const heroMissing = !l.hero_image;
  const heroStreet = !heroMissing && (l.hero_image_source === 'street_view' || /streetview|street_view/i.test(l.hero_image || ''));
  const heroLowRes = !!l.hero_is_low_res;
  const tss = l.touchless_satisfaction_score;
  const snips = snipCount.get(l.id) ?? 0;
  return {
    id: l.id, name: l.name, slug: l.slug, city: l.city, state: l.state,
    chain: l.parent_chain || '',
    trophies: byListing.get(l.id).join('; '),
    hero: heroMissing ? 'MISSING' : heroLowRes ? 'low-res' : heroStreet ? 'street-view' : 'ok',
    amenities: Array.isArray(l.amenities) && l.amenities.length > 0,
    hours: nonEmptyObj(l.hours),
    desc: !!l.description && l.description.trim().length >= 120,
    address: !!l.address && l.address.trim().length > 0,
    phone: !!l.phone,
    directions: !!(l.google_maps_url || l.google_place_id || (l.latitude != null && l.longitude != null)),
    snippets: snips,
    snippetsOk: snips >= 3,
    tss: tss,
    paintSafe: !!l.paint_safe_verified,
  };
});

// 5. Summaries
const n = rows.length;
const pct = (x) => `${x} (${Math.round((x / n) * 100)}%)`;
const fail = {
  heroMissing: rows.filter((r) => r.hero === 'MISSING').length,
  heroWeak: rows.filter((r) => r.hero === 'low-res' || r.hero === 'street-view').length,
  amenities: rows.filter((r) => !r.amenities).length,
  hours: rows.filter((r) => !r.hours).length,
  desc: rows.filter((r) => !r.desc).length,
  address: rows.filter((r) => !r.address).length,
  phone: rows.filter((r) => !r.phone).length,
  directions: rows.filter((r) => !r.directions).length,
  noSnippets: rows.filter((r) => r.snippets === 0).length,
  fewSnippets: rows.filter((r) => !r.snippetsOk).length,
};
const tssBuckets = {
  'null (NO score shown)': rows.filter((r) => r.tss == null).length,
  '<47 Mixed': rows.filter((r) => r.tss != null && r.tss < 47).length,
  '47-61 Fair': rows.filter((r) => r.tss >= 47 && r.tss < 62).length,
  '62-75 Good': rows.filter((r) => r.tss >= 62 && r.tss < 76).length,
  '76-83 Very Good': rows.filter((r) => r.tss >= 76 && r.tss < 84).length,
  '84+ Excellent': rows.filter((r) => r.tss >= 84).length,
};

console.log('\n================ COMPLETENESS GAPS (of ' + n + ' distinct trophy listings) ================');
console.log('hero MISSING:        ', pct(fail.heroMissing));
console.log('hero weak (sv/lowres):', pct(fail.heroWeak));
console.log('no amenities:        ', pct(fail.amenities));
console.log('no hours:            ', pct(fail.hours));
console.log('no/thin AI desc:     ', pct(fail.desc));
console.log('no street address:   ', pct(fail.address));
console.log('no phone:            ', pct(fail.phone));
console.log('no map directions:   ', pct(fail.directions));
console.log('ZERO review snippets:', pct(fail.noSnippets));
console.log('<3 review snippets:  ', pct(fail.fewSnippets));
console.log('\n================ TOUCHLESS SATISFACTION SCORE distribution ================');
for (const [k, v] of Object.entries(tssBuckets)) console.log(`  ${k.padEnd(22)}: ${pct(v)}`);
console.log('paint-safe verified:  ', pct(rows.filter((r) => r.paintSafe).length));

// 6. "Not ready" = fails any HARD criterion (hero present, amenities, hours, desc, address, directions, >=3 snippets, tss>=62)
const hardFail = rows.filter((r) =>
  r.hero === 'MISSING' || !r.amenities || !r.hours || !r.desc || !r.address || !r.directions || !r.snippetsOk || r.tss == null || r.tss < 62);
console.log(`\n================ NOT-READY: ${hardFail.length} of ${n} fail >=1 hard criterion ================`);
const reasons = (r) => [
  r.hero === 'MISSING' && 'hero', !r.amenities && 'amenities', !r.hours && 'hours', !r.desc && 'desc',
  !r.address && 'addr', !r.directions && 'dir', !r.snippetsOk && `snips(${r.snippets})`,
  r.tss == null ? 'TSS:null' : r.tss < 62 ? `TSS:${r.tss}` : false,
].filter(Boolean).join(',');

writeFileSync('scripts/_qa-trophy-report.csv',
  'name,city,state,chain,trophies,hero,amenities,hours,desc,address,phone,directions,snippets,tss,paintSafe,fails\n' +
  rows.map((r) => [r.name, r.city, r.state, r.chain, `"${r.trophies}"`, r.hero, r.amenities, r.hours, r.desc, r.address, r.phone, r.directions, r.snippets, r.tss ?? '', r.paintSafe, `"${reasons(r) || 'READY'}"`].join(',')).join('\n'));
console.log('\nFull per-listing CSV → scripts/_qa-trophy-report.csv');
console.log('\nSample not-ready (first 25):');
for (const r of hardFail.slice(0, 25)) console.log(`  [${reasons(r)}]  ${r.name} — ${r.city},${r.state}  (${r.trophies})`);
