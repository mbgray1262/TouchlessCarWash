#!/usr/bin/env node
/**
 * Recategorize H&S Energy Group listings into correct sub-brands.
 *
 * Many listings are tagged parent_chain='Power Market' but are actually
 * Extra Mile or Pinnacle 365 locations. This script matches by address
 * and updates parent_chain accordingly.
 *
 * Run: node scripts/recategorize-hns-brands.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]; })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// ── H&S Energy locations with correct sub-brand ─────────────────────────
// Parsed from https://hnsenergygroup.com/locations-category/car-wash-drive-thru-touchless/
// Brand is determined by the store name on the H&S website.
// Only Extra Mile and Pinnacle 365 entries are listed here — everything else stays Power Market.

const EXTRA_MILE_ADDRESSES = [
  // California
  '3085 E La Palma Ave, Anaheim',
  '700 N Brookhurst St, Anaheim',
  '1101 N Magnolia Ave, Anaheim',
  '4600 Lone Tree Wy, Antioch',
  '251 E Grand Ave, Arroyo Grande',
  '336 Oak St, Brentwood',
  '206 E Hwy 246, Buellton',
  '6971 Beach Blvd, Buena Park',
  '7990 Valley View St, Buena Park',
  '3381 Coach Ln, Cameron Park',
  '17255 Bloomfield Ave, Cerritos',
  '13356 E. South St, Cerritos',
  '12886 Central Ave, Chino',
  '95 Bonita Rd, Chula Vista',
  '221 S Hacienda Blvd, City of Industry',
  '699 E Foothill Blvd, Claremont',
  '860 S Indian Hill Blvd, Claremont',
  '5999 Cerritos Ave, Cypress',
  '32842 CA-1, Dana Point',
  '21095 Golden Springs Dr, Diamond Bar',
  '150 S Diamond Bar Blvd, Diamond Bar',
  '8501 Bond Rd, Elk Grove',
  '8900 Madison Ave, Fair Oaks',
  '4490 Central Way, Fairfield',
  '9881 Greenback Ln, Folsom',
  '1020 Riley St, Folsom',
  '16705 Merrill Ave, Fontana',
  '2950 Nutwood Ave, Fullerton',
  '1730 W Orangethorpe Ave, Fullerton',
  '11971 Valley View St, Garden Grove',
  '850 W Rosecrans Ave, Gardena',
  '25991 Crown Valley Pkwy, Laguna Niguel',
  '5739 Bellflower Blvd, Lakewood',
  '4910 Lakewood Blvd, Lakewood',
  '671 Lincoln Blvd, Lincoln',
  '14000 CA-88, Lockeford',
  '10815 National Blvd, Los Angeles',
  '1628 E Washington Blvd, Montebello',
  '1500 S Paramount Blvd, Montebello',
  '656 Benet Rd, Oceanside',
  '3945 Mission Ave, Oceanside',
  '2191 Vista Way, Oceanside',
  '2844 N Santiago Blvd, Orange',
  '1440 E Washington St, Petaluma',
  '1515 N Garey Ave, Pomona',
  '1903 W Holt Ave, Pomona',
  '3190 W Temple Ave, Pomona',
  '750 Atlantic St, Roseville',
  '1400 E Roseville Pkwy, Roseville',
  '10545 Fairway Dr, Roseville',
  '3300 Bradshaw Rd, Sacramento',
  '9680 Business Park Dr, Sacramento',
  '3481 Fair Oaks Blvd, Sacramento',
  '9700 Jackson Rd, Sacramento',
  '2150 Marconi Ave, Sacramento',
  '5597 Stockton Blvd, Sacramento',
  '8210 Camino Santa Fe, San Diego',
  '2432 Coronado Ave, San Diego',
  '4180 Park Blvd, San Diego',
  '220 Sycamore Rd, San Ysidro',
  '14791 CA-1, Santa Monica',
  '2950 Westminster Blvd, Seal Beach',
  '1105 Santa Anita Ave, South El Monte',
  '6633 Pacific Ave, Stockton',
  '3775 N Tracy Blvd, Tracy',
  '14082 Red Hill Ave, Tustin',
  '182 Nut Tree Pkwy, Vacaville',
  '1991 Broadway, Vallejo',
  '333 Curtola Pkwy, Vallejo',
  '223 Fairgrounds Dr, Vallejo',
  '990 Redwood St, Vallejo',
  '20849 E Valley Blvd, Walnut',
  '390 N Lemon Ave, Walnut',
  '1851 Main St, Watsonville',
  '14941 E. Whittier Blvd, Whittier',
];

const PINNACLE_365_ADDRESSES = [
  // California
  '1401 G St, Arcata',
  '421 J St, Arcata',
  '1649 41st Ave, Capitola',
  '7 Carmel Center Pl, Carmel',
  '27800 Dorris Dr, Carmel',
  '5th Ave & San Carlos St, Carmel by the Sea',
  '1200 Northcrest Dr, Crescent City',
  '1125 4th St, Eureka',
  '2111 4th St, Eureka',
  '1310 5th St, Eureka',
  '3505 Broadway St, Eureka',
  '1007 Broadway St, Eureka',
  '111 W Harris St, Eureka',
  '3973 Walnut Dr, Eureka',
  '1434 Myrtle Avenue, Eureka',
  '809 Main St, Fortuna',
  '1791 Riverwalk Dr, Fortuna',
  '390 S Fortuna Blvd, Fortuna',
  '723 S Fortuna Blvd, Fortuna',
  '860 Redwood Dr, Garberville',
  '1606 Central Ave, McKinleyville',
  '3030 Del Monte Blvd, Marina',
  '687 Lighthouse Ave, Pacific Grove',
  '3122 Redwood Dr, Redway',
  '136 Rio Dell, Wildwood Ave',
  '582 Wildwood Ave, Rio Dell',
  '1764 N Main St, Salinas',
  '417 N Main St, Salinas',
  '2700 Soquel Ave, Santa Cruz',
  '1 Hacienda Dr, Scotts Valley',
  '90 Mt Hermon Rd, Scotts Valley',
  '1305 S Front St, Soledad',
  // Oregon
  '2500 Highway 66, Ashland',
  '460 S Valley View Rd, Ashland',
  '13982 NW Main St, Banks',
  '24485 Highway 101 S, Beaver',
  '3405 N Hwy 97, Bend',
  '2100 NE Hwy 20, Bend',
  '1400 NW College Way, Bend',
  '981 NW Galveston Ave, Bend',
  '1123 Chetco Ave, Brookings',
  '16258 U.S. 101, Brookings',
  '112 Redwood Hwy, Cave Junction',
  '1510 E Pine St, Central Point',
  '1065 E Pine St, Central Point',
  '6779 Crater Lake Highway, Central Point',
  '55870 NW Wilson River Hwy, Gales Creek',
  '701 Garibaldi Ave, Garibaldi',
  '1995 NE 6th St, Grants Pass',
  '836 NE A St, Grants Pass',
  '1044 NW 6th St, Grants Pass',
  '650 Redwood Hwy, Grants Pass',
  '6410 Williams Hwy, Grants Pass',
  '945 N 5th St, Jacksonville',
  '2123 Oregon Ave, Klamath Falls',
  '3434 S 6th St, Klamath Falls',
  '1210 SW Hwy 97, Madras',
  '1068 S Riverside Ave, Medford',
  '1306 Springbrook Rd, Medford',
  '36453 N Hwy 101, Nehalem',
  '34995 Brooten Rd, Pacific City',
  '730 W Main St, Phoenix',
  '914 Oregon St, Port Orford',
  '398 NW 3rd St, Prineville',
  '2005 S Hwy 97, Redmond',
  '95 Pine St, Rogue River',
  '18430 Redwood Hwy, Selma',
  '21222 Highway 62, Shady Cove',
  '56896 Venture Ln, Sunriver',
  '21 Talent Ave, Talent',
  '301 W Valley View Rd, Talent',
  '8160 US-97, Terrebonne',
  '303 Pacific Ave, Tillamook',
  '692 NE Main St, Willamina',
];

// ── Normalize address for fuzzy matching ─────────────────────────────────
function normalize(addr) {
  return addr
    .toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\b(ave|avenue)\b/g, 'ave')
    .replace(/\b(blvd|boulevard)\b/g, 'blvd')
    .replace(/\b(st|street)\b/g, 'st')
    .replace(/\b(rd|road)\b/g, 'rd')
    .replace(/\b(dr|drive)\b/g, 'dr')
    .replace(/\b(ln|lane)\b/g, 'ln')
    .replace(/\b(pkwy|parkway)\b/g, 'pkwy')
    .replace(/\b(hwy|highway)\b/g, 'hwy')
    .replace(/\b(wy|way)\b/g, 'wy')
    .replace(/\b(ct|court)\b/g, 'ct')
    .replace(/\b(pl|place)\b/g, 'pl')
    .replace(/\b(cir|circle)\b/g, 'cir')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract just the street part (before city/state/zip) for matching
function streetPart(fullAddr) {
  // Try to split on ", City" pattern — take just the street
  const parts = fullAddr.split(',');
  return normalize(parts[0]);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // Build lookup maps: normalized street → brand
  const brandByStreet = new Map();
  for (const addr of EXTRA_MILE_ADDRESSES) {
    brandByStreet.set(normalize(addr.split(',')[0]), 'Extra Mile');
  }
  for (const addr of PINNACLE_365_ADDRESSES) {
    brandByStreet.set(normalize(addr.split(',')[0]), 'Pinnacle 365');
  }

  // Fetch all listings that could be H&S Energy locations
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,name,address,city,state,parent_chain,touchless_verified,is_touchless')
    .or('parent_chain.eq.Power Market,name.ilike.%extra mile%,name.ilike.%pinnacle%')
    .order('state')
    .order('city');

  if (error) { console.error('Query error:', error); process.exit(1); }
  console.log(`Fetched ${listings.length} candidate listings\n`);

  const updates = { 'Extra Mile': [], 'Pinnacle 365': [] };
  const unchanged = [];
  const unmatched = [];

  for (const listing of listings) {
    const street = streetPart(listing.address);
    const brand = brandByStreet.get(street);

    if (brand && listing.parent_chain !== brand) {
      updates[brand].push(listing);
    } else if (!brand) {
      // Not in our Extra Mile / Pinnacle 365 lists — stays as-is
      unchanged.push(listing);
    }
  }

  // Report
  console.log(`Will recategorize:`);
  console.log(`  → Extra Mile: ${updates['Extra Mile'].length} listings`);
  console.log(`  → Pinnacle 365: ${updates['Pinnacle 365'].length} listings`);
  console.log(`  Unchanged (stays Power Market or other): ${unchanged.length}`);
  console.log();

  for (const [brand, items] of Object.entries(updates)) {
    if (items.length === 0) continue;
    console.log(`\n── ${brand} ──`);
    for (const l of items) {
      console.log(`  ${l.name} | ${l.address} | ${l.city}, ${l.state} | was: ${l.parent_chain}`);
    }

    if (!DRY_RUN) {
      const ids = items.map(l => l.id);
      const { error: updateErr } = await supabase
        .from('listings')
        .update({
          parent_chain: brand,
          touchless_verified: 'chain',
          is_touchless: true,
        })
        .in('id', ids);

      if (updateErr) {
        console.error(`  ERROR updating ${brand}:`, updateErr);
      } else {
        console.log(`  ✅ Updated ${ids.length} listings to parent_chain='${brand}'`);
      }
    }
  }

  // Also ensure any Extra Mile / Pinnacle 365 listings not yet tagged as touchless get tagged
  if (!DRY_RUN) {
    // Tag remaining Power Market listings that aren't yet chain-verified
    const pmUntagged = unchanged.filter(l =>
      l.parent_chain === 'Power Market' && l.touchless_verified !== 'chain'
    );
    if (pmUntagged.length > 0) {
      const { error: pmErr } = await supabase
        .from('listings')
        .update({ touchless_verified: 'chain', is_touchless: true })
        .in('id', pmUntagged.map(l => l.id));
      if (pmErr) console.error('Error tagging remaining PM:', pmErr);
      else console.log(`\n✅ Also tagged ${pmUntagged.length} remaining Power Market listings as chain-verified`);
    }
  }

  // Summary
  console.log('\n── Final counts ──');
  const { data: finalCounts } = await supabase
    .from('listings')
    .select('parent_chain')
    .in('parent_chain', ['Power Market', 'Extra Mile', 'Pinnacle 365']);

  const counts = {};
  for (const r of finalCounts || []) {
    counts[r.parent_chain] = (counts[r.parent_chain] || 0) + 1;
  }
  console.log(counts);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
