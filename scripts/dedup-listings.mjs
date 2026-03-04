/**
 * dedup-listings.mjs
 *
 * Finds duplicate listings using multiple strategies:
 *   1. Same google_place_id (definitive duplicate)
 *   2. Same normalized name + address + city + state (exact duplicate)
 *   3. Same address + city + state with very similar names (fuzzy duplicate)
 *
 * Deletes the record with the least data, keeping the richest one.
 *
 * Pass --dry-run (default) to see what would be deleted.
 * Pass --execute to actually perform deletions.
 */

const DRY_RUN = !process.argv.includes('--execute');

const SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78';

const COLUMNS = 'id,name,slug,address,city,state,zip,phone,website,rating,review_count,is_approved,is_featured,is_touchless,latitude,longitude,hero_image,logo_photo,parent_chain,google_photo_url,google_logo_url,street_view_url,google_photos_count,google_description,google_subtypes,google_category,business_status,is_google_verified,google_maps_url,google_id,google_place_id,description,touchless_wash_types,equipment_brand,equipment_model,created_at';

async function fetchAllListings() {
  const allRows = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/listings?select=${COLUMNS}&order=id&offset=${offset}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await res.text()}`);
    const rows = await res.json();
    allRows.push(...rows);
    if (offset % 10000 === 0) console.log(`  ...fetched ${allRows.length}`);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}

async function deleteListings(ids) {
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const filter = batch.map(id => `"${id}"`).join(',');
    const url = `${SUPABASE_URL}/rest/v1/listings?id=in.(${filter})`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
    });
    if (!res.ok) {
      console.error(`  DELETE batch failed (${res.status}):`, await res.text());
    } else {
      deleted += batch.length;
      if (deleted % 1000 === 0 || i + BATCH >= ids.length) {
        console.log(`  ...deleted ${deleted}/${ids.length}`);
      }
    }
  }
  return deleted;
}

function normalise(str) {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreRecord(l) {
  let score = 0;
  const textFields = [
    'phone', 'website', 'hero_image', 'logo_photo', 'google_photo_url',
    'google_logo_url', 'street_view_url', 'google_description', 'google_subtypes',
    'google_category', 'google_maps_url', 'google_id', 'google_place_id',
    'description', 'equipment_brand', 'equipment_model', 'parent_chain',
  ];
  for (const f of textFields) {
    if (l[f] && String(l[f]).trim()) score += 1;
  }
  if (Array.isArray(l.touchless_wash_types) && l.touchless_wash_types.length > 0) score += 1;
  if (l.rating > 0) score += 2;
  if (l.review_count > 0) score += 2;
  if (l.google_photos_count > 0) score += 1;
  if (l.latitude) score += 1;
  if (l.longitude) score += 1;
  if (l.is_touchless === true) score += 3;
  if (l.is_approved) score += 2;
  if (l.is_featured) score += 2;
  if (l.is_google_verified) score += 1;
  if (l.description) score += 3;
  if (l.hero_image) score += 2;
  return score;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== EXECUTE MODE ===');
  console.log('Fetching all listings...');
  const listings = await fetchAllListings();
  console.log(`Total listings: ${listings.length}\n`);

  const deleteSet = new Set(); // IDs to delete

  // --- Strategy 1: Same google_place_id ---
  console.log('Strategy 1: Same google_place_id...');
  const byPlaceId = new Map();
  for (const l of listings) {
    if (!l.google_place_id) continue;
    const key = l.google_place_id;
    if (!byPlaceId.has(key)) byPlaceId.set(key, []);
    byPlaceId.get(key).push(l);
  }
  const placeIdDupes = [...byPlaceId.entries()].filter(([, g]) => g.length > 1);
  console.log(`  Found ${placeIdDupes.length} groups with duplicate google_place_id`);

  for (const [, group] of placeIdDupes) {
    const scored = group.map(l => ({ ...l, _score: scoreRecord(l) }));
    scored.sort((a, b) => b._score - a._score || b.review_count - a.review_count || b.rating - a.rating);
    for (const loser of scored.slice(1)) {
      deleteSet.add(loser.id);
    }
  }
  console.log(`  IDs to delete so far: ${deleteSet.size}`);

  // --- Strategy 2: Same name + address + city + state ---
  console.log('\nStrategy 2: Same name + address + city + state...');
  const byNameAddr = new Map();
  for (const l of listings) {
    if (deleteSet.has(l.id)) continue; // already marked
    const key = `${normalise(l.name)}|${normalise(l.address)}|${normalise(l.city)}|${normalise(l.state)}`;
    if (!byNameAddr.has(key)) byNameAddr.set(key, []);
    byNameAddr.get(key).push(l);
  }
  const nameAddrDupes = [...byNameAddr.entries()].filter(([, g]) => g.length > 1);
  console.log(`  Found ${nameAddrDupes.length} exact duplicate groups`);

  for (const [, group] of nameAddrDupes) {
    const scored = group.map(l => ({ ...l, _score: scoreRecord(l) }));
    scored.sort((a, b) => b._score - a._score || b.review_count - a.review_count || b.rating - a.rating);
    for (const loser of scored.slice(1)) {
      deleteSet.add(loser.id);
    }
  }
  console.log(`  IDs to delete so far: ${deleteSet.size}`);

  // --- Summary ---
  const touchlessDeleted = [...deleteSet].filter(id => listings.find(l => l.id === id)?.is_touchless === true).length;
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total listings:        ${listings.length}`);
  console.log(`Duplicates to delete:  ${deleteSet.size}`);
  console.log(`  Touchless:           ${touchlessDeleted}`);
  console.log(`After cleanup:         ${listings.length - deleteSet.size}`);

  // Show examples
  let shown = 0;
  for (const [, group] of placeIdDupes) {
    if (shown >= 5) break;
    const scored = group.map(l => ({ ...l, _score: scoreRecord(l) }));
    scored.sort((a, b) => b._score - a._score || b.review_count - a.review_count);
    console.log(`\n--- Example: place_id=${group[0].google_place_id} ---`);
    for (const s of scored) {
      const tag = deleteSet.has(s.id) ? 'DELETE' : 'KEEP';
      console.log(`  [${tag}] "${s.name}" | ${s.address} | score:${s._score} | rating:${s.rating} | reviews:${s.review_count} | touchless:${s.is_touchless}`);
    }
    shown++;
  }

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no records deleted ===');
    console.log('Run with --execute to actually delete.');
  } else {
    const idsArray = [...deleteSet];
    console.log(`\nDeleting ${idsArray.length} duplicate listings...`);
    const deleted = await deleteListings(idsArray);
    console.log(`Done! Deleted ${deleted} listings.`);
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
