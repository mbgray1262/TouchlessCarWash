#!/usr/bin/env node
/**
 * Parse Super Wash's locations page and extract structured list.
 * Pattern on page:
 *   City, ST
 *   *?\s*address
 *   City, ST ZIP
 */
import { readFileSync, writeFileSync } from 'node:fs';
const md = readFileSync('scripts/discovery-output/chain-scrape-super-wash.md', 'utf8');

// Pattern: capture "Address\nCity, ST ZIP"
const rx = /\*?\s*([0-9]+[^\n]{5,80}?(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Ct|Court|Pl|Place|Circle|Cir|Route|Rte|Mt\.?\s*[A-Z][a-z]+))[\.,]?\s*\n\s*([A-Z][A-Za-z\. ]+?),\s+([A-Z]{2})\s+(\d{5})/g;

const locations = [];
const seen = new Set();
let m;
while ((m = rx.exec(md))) {
  const street = m[1].trim().replace(/\s+/g, ' ').replace(/\.$/, '');
  const city = m[2].trim();
  const state = m[3];
  const zip = m[4];
  const key = `${state}|${city}|${street.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  if (seen.has(key)) continue;
  seen.add(key);

  // Extract street number + distinctive word for matching
  const numMatch = street.match(/^\d+/);
  const num = numMatch ? numMatch[0] : '';
  // Distinctive word: first capitalized word after the number that isn't N/S/E/W
  const rest = street.replace(/^\d+\s*/, '').replace(/^[NSEW]\.?\s+/, '');
  const keyword = (rest.split(/\s+/)[0] || '').toLowerCase().replace(/\./g, '');

  locations.push({ street, city, state, zip, num, key: keyword });
}

console.log(`Parsed ${locations.length} Super Wash locations`);
writeFileSync('scripts/discovery-output/super-wash-locations.json', JSON.stringify(locations, null, 2));
console.log(`Saved to scripts/discovery-output/super-wash-locations.json`);

// Emit a JS object format for CHAIN_DATA
console.log('\nCHAIN_DATA entry format:');
console.log('    locations: [');
for (const l of locations.slice(0, 10)) {
  console.log(`      { street: '${l.street.replace(/'/g, "\\'")}', city: '${l.city}', state: '${l.state}', num: '${l.num}', key: '${l.key}' },`);
}
console.log(`      // ... ${locations.length - 10} more`);
console.log('    ],');
