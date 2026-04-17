#!/usr/bin/env node
/**
 * Parse ScrubaDub location URLs (from their stores-sitemap.xml) to
 * extract city + state + street keyword. The /locations/ page is
 * JS-rendered so we can't scrape individual pages for addresses, but
 * the URL slug encodes the location info reliably:
 *   /locations/natick-ma-worcester-st-natick/ → Natick, MA, Worcester St
 */
import { writeFileSync } from 'node:fs';

const URLS = [
  'https://www.scrubadub.com/locations/biddeford-me-elm-st-biddeford/',
  'https://www.scrubadub.com/locations/brighton-ma-faneuil-st-boston/',
  'https://www.scrubadub.com/locations/brookline-ma-harvard-st-brookline/',
  'https://www.scrubadub.com/locations/chelsea-ma-eastern-ave-chelsea/',
  'https://www.scrubadub.com/locations/coventry-ri-coming-soon-coventry/',
  'https://www.scrubadub.com/locations/dorchester-ma-w-howell-st-dorchester/',
  'https://www.scrubadub.com/locations/framingham-ma-worcester-rd-framingham/',
  'https://www.scrubadub.com/locations/marlborough-ma-maple-st-marlboro/',
  'https://www.scrubadub.com/locations/medford-ma-coming-soon-medford/',
  'https://www.scrubadub.com/locations/natick-ma-worcester-st-natick/',
  'https://www.scrubadub.com/locations/north-providence-ri-coming-soon-north-providence/',
  'https://www.scrubadub.com/locations/portland-me-forest-ave-portland/',
  'https://www.scrubadub.com/locations/providence-ri-coming-soon-providence/',
  'https://www.scrubadub.com/locations/quincy-ma-coddington-st-quincy/',
  'https://www.scrubadub.com/locations/roslindale-ma-american-legion-highway-boston/',
  'https://www.scrubadub.com/locations/salem-nh-n-broadway-salem/',
  'https://www.scrubadub.com/locations/shrewsbury-ma-boston-turnpike-shrewsbury/',
  'https://www.scrubadub.com/locations/south-portland-me-gorham-rd-south-portland/',
  'https://www.scrubadub.com/locations/warwick-ri-bald-hill-road-warwick/',
  'https://www.scrubadub.com/locations/woburn-ma-mishawum-rd-woburn/',
  'https://www.scrubadub.com/locations/worcester-ma-grafton-st-worcester/',
  'https://www.scrubadub.com/locations/worcester-ma-jennings-st-worcester/',
  'https://www.scrubadub.com/locations/worcester-ma-park-ave-worcester/',
  'https://www.scrubadub.com/locations/worcester-ma-shrewsbury-st-worcester/',
];

const STATE_CODES = new Set(['ma', 'me', 'nh', 'ri', 'ct', 'vt', 'ny']);
// Known NAME_ALIASES used in slugs
const ALIASES = { marlboro: 'Marlborough', 'north-providence': 'North Providence', 'south-portland': 'South Portland' };

function titleCase(s) {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const out = [];
for (const url of URLS) {
  const slug = url.match(/\/locations\/([^/]+)/)[1];
  const parts = slug.split('-');
  // Find state code (2 chars, in STATE_CODES)
  let stateIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 2 && STATE_CODES.has(parts[i])) { stateIdx = i; break; }
  }
  if (stateIdx === -1) continue;

  const city = titleCase(parts.slice(0, stateIdx).join(' '));
  const state = parts[stateIdx].toUpperCase();

  // Skip "coming soon" entries
  const rest = parts.slice(stateIdx + 1);
  if (rest[0] === 'coming' && rest[1] === 'soon') {
    continue;  // don't add coming-soon locations
  }

  // Street keyword = first meaningful word after state
  // Filter out trailing city-repeat segments
  const cityLast = parts.slice(0, stateIdx).pop();
  const streetWords = [];
  for (const w of rest) {
    if (w === cityLast) break;
    if (w === 'st' || w === 'rd' || w === 'ave' || w === 'blvd' || w === 'dr' || w === 'hwy' || w === 'way' || w === 'pkwy' || w === 'highway' || w === 'road' || w === 'boulevard' || w === 'street' || w === 'avenue' || w === 'turnpike') {
      streetWords.push(w);
      break;
    }
    streetWords.push(w);
  }
  const streetHint = streetWords.join(' ');
  const key = streetWords.filter(w => w.length > 2 && !['st','rd','ave','blvd','dr','hwy','way'].includes(w))[0] || '';

  out.push({
    url,
    city: ALIASES[parts.slice(0, stateIdx).join('-')] || city,
    state,
    streetHint,
    key: key.replace(/\./g, ''),
  });
}

console.log(`Parsed ${out.length} ScrubaDub locations (excluding "coming soon"):`);
for (const l of out) {
  console.log(`  ${l.city}, ${l.state}  street=${l.streetHint}  key=${l.key}`);
}

writeFileSync('scripts/discovery-output/scrubadub-locations.json', JSON.stringify(out, null, 2));
