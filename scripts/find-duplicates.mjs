/**
 * find-duplicates.mjs
 *
 * Queries all listings from the Supabase database and identifies TRUE duplicates:
 *   1. Same address + city + state (case-insensitive) -- these are the real duplicates
 *   2. Same name + address + city + state -- true name+address duplicates
 *   3. Same address, different names -- same location, rebranded/alternate names
 *
 * READ-ONLY -- does not modify any data.
 */

const SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78';

const COLUMNS = [
  'id',
  'name',
  'slug',
  'address',
  'city',
  'state',
  'zip',
  'phone',
  'website',
  'rating',
  'review_count',
  'is_approved',
  'is_featured',
  'is_touchless',
  'latitude',
  'longitude',
  'hero_image',
  'logo_photo',
  'parent_chain',
  'google_photo_url',
  'google_logo_url',
  'street_view_url',
  'google_photos_count',
  'google_description',
  'google_subtypes',
  'google_category',
  'business_status',
  'is_google_verified',
  'google_maps_url',
  'google_id',
  'google_place_id',
  'description',
  'touchless_wash_types',
  'equipment_brand',
  'equipment_model',
  'created_at',
].join(',');

// ---------------------------------------------------------------------------
// Fetch ALL listings with pagination (Supabase caps at 1000 per request)
// ---------------------------------------------------------------------------
async function fetchAllListings() {
  const allRows = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let done = false;

  while (!done) {
    const url = `${SUPABASE_URL}/rest/v1/listings?select=${COLUMNS}&offset=${offset}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase request failed (${res.status}): ${text}`);
    }

    const rows = await res.json();
    allRows.push(...rows);
    console.log(`  ...fetched ${allRows.length} so far`);

    if (rows.length < PAGE_SIZE) {
      done = true;
    } else {
      offset += PAGE_SIZE;
    }
  }

  return allRows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalise(str) {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Count how many "data" fields on a listing are populated. */
function countPopulatedFields(listing) {
  const dataFields = [
    'phone',
    'website',
    'hero_image',
    'logo_photo',
    'google_photo_url',
    'google_logo_url',
    'street_view_url',
    'google_description',
    'google_subtypes',
    'google_category',
    'google_maps_url',
    'google_id',
    'google_place_id',
    'description',
    'touchless_wash_types',
    'equipment_brand',
    'equipment_model',
    'latitude',
    'longitude',
    'parent_chain',
  ];

  let count = 0;
  for (const f of dataFields) {
    const val = listing[f];
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.trim() === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;
    count++;
  }
  return count;
}

function printListing(l, indent = '  ') {
  const pop = countPopulatedFields(l);
  console.log(`${indent}ID:            ${l.id}`);
  console.log(`${indent}Name:          ${l.name}`);
  console.log(`${indent}Address:       ${l.address}`);
  console.log(`${indent}City/State:    ${l.city}, ${l.state} ${l.zip}`);
  console.log(`${indent}Slug:          ${l.slug}`);
  console.log(`${indent}Rating:        ${l.rating}  |  Reviews: ${l.review_count}`);
  console.log(`${indent}Approved:      ${l.is_approved}  |  Touchless: ${l.is_touchless}`);
  console.log(`${indent}Description:   ${!!l.description}  |  Hero Image: ${!!l.hero_image}`);
  console.log(`${indent}Phone:         ${!!l.phone}  |  Website: ${!!l.website}`);
  console.log(`${indent}Google Photos: ${l.google_photos_count ?? 'n/a'}  |  Google PID: ${!!l.google_place_id}`);
  console.log(`${indent}Populated:     ${pop} fields`);
  console.log(`${indent}Created:       ${l.created_at}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Fetching all listings from Supabase...');
  const listings = await fetchAllListings();
  console.log(`\nTotal listings fetched: ${listings.length}\n`);

  // --- Build address-based groups (these are the TRUE duplicates) ---
  const byAddr = new Map();
  for (const l of listings) {
    const addr = normalise(l.address);
    if (!addr) continue;
    const key = `${addr}|${normalise(l.city)}|${normalise(l.state)}`;
    if (!byAddr.has(key)) byAddr.set(key, []);
    byAddr.get(key).push(l);
  }

  const addrDups = [...byAddr.entries()]
    .filter(([, g]) => g.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  // Separate into: same name dups vs different name dups
  const sameNameGroups = [];
  const diffNameGroups = [];

  for (const [key, group] of addrDups) {
    const names = new Set(group.map((l) => normalise(l.name)));
    if (names.size === 1) {
      sameNameGroups.push([key, group]);
    } else {
      diffNameGroups.push([key, group]);
    }
  }

  // ---- SECTION 1: Exact duplicates (same name + same address) ----
  console.log('='.repeat(80));
  console.log('SECTION 1: EXACT DUPLICATES (same name + address + city + state)');
  console.log('='.repeat(80));
  console.log(`Found ${sameNameGroups.length} group(s)\n`);

  let printLimit = 100; // print first N groups for readability
  let printed = 0;
  for (const [key, group] of sameNameGroups) {
    if (printed >= printLimit) break;
    const [address, city, state] = key.split('|');
    console.log('-'.repeat(80));
    console.log(`Group: "${group[0].name}" at "${address}", ${city}, ${state}  (${group.length} listings)`);
    console.log('-'.repeat(80));
    for (const l of group) {
      printListing(l);
    }
    printed++;
  }
  if (sameNameGroups.length > printLimit) {
    console.log(`... and ${sameNameGroups.length - printLimit} more groups (truncated)\n`);
  }

  // ---- SECTION 2: Same address, different names ----
  console.log('\n');
  console.log('='.repeat(80));
  console.log('SECTION 2: SAME ADDRESS, DIFFERENT NAMES');
  console.log('='.repeat(80));
  console.log(`Found ${diffNameGroups.length} group(s)\n`);

  printed = 0;
  for (const [key, group] of diffNameGroups) {
    if (printed >= printLimit) break;
    const [address, city, state] = key.split('|');
    const names = [...new Set(group.map((l) => l.name))];
    console.log('-'.repeat(80));
    console.log(`Address: "${address}", ${city}, ${state}  (${group.length} listings)`);
    console.log(`  Different names: ${names.join(' | ')}`);
    console.log('-'.repeat(80));
    for (const l of group) {
      printListing(l);
    }
    printed++;
  }
  if (diffNameGroups.length > printLimit) {
    console.log(`... and ${diffNameGroups.length - printLimit} more groups (truncated)\n`);
  }

  // ---- SECTION 3: Size distribution ----
  console.log('\n');
  console.log('='.repeat(80));
  console.log('DUPLICATE GROUP SIZE DISTRIBUTION');
  console.log('='.repeat(80));

  const sizeCounts = new Map();
  for (const [, group] of addrDups) {
    const size = group.length;
    sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1);
  }
  const sizes = [...sizeCounts.entries()].sort((a, b) => a[0] - b[0]);
  for (const [size, count] of sizes) {
    const listings_in = size * count;
    console.log(`  ${size} listings at same address: ${count} groups (${listings_in} listings total)`);
  }

  // ---- SECTION 4: Listings without addresses ----
  const noAddr = listings.filter((l) => !l.address || normalise(l.address) === '');
  console.log(`\nListings with no address: ${noAddr.length}`);

  // ---- Final summary ----
  const totalDupListings = addrDups.reduce((acc, [, g]) => acc + g.length, 0);
  const removable = addrDups.reduce((acc, [, g]) => acc + (g.length - 1), 0);

  console.log('\n');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total listings in database:                    ${listings.length}`);
  console.log(`Total address-duplicate groups:                ${addrDups.length}`);
  console.log(`  - Same name + same address:                  ${sameNameGroups.length} groups`);
  console.log(`  - Different names at same address:           ${diffNameGroups.length} groups`);
  console.log(`Total listings involved in duplicates:         ${totalDupListings}`);
  console.log(`Potentially removable (keeping 1 per address): ${removable}`);
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
