#!/usr/bin/env node
/**
 * Regenerate city_descriptions as templates with placeholder tokens.
 *
 *   {{TOTAL_LISTINGS}} = live count of approved touchless in this city
 *   {{TOP_LISTING}}    = name of the top-rated listing (highest rating × log(reviews))
 *   {{TOP_RATING}}     = that top listing's rating (e.g. "4.7")
 *   {{TOP_REVIEWS}}    = that top listing's review count
 *
 * Placeholders are substituted at page render time (see
 * renderCityDescription in app/state/[state]/[city]/page.tsx) so counts
 * never go stale.
 *
 * Each city gets a hook varied by data shape:
 *   - Cities with a dominant chain get a chain-centric hook
 *   - Cities with a standout top listing (high rating + high reviews) get a hero-listing hook
 *   - Cities with 24-hour service get an always-open hook
 *   - Cities with laser wash amenity get an equipment-specific hook
 *   - Otherwise get a location-reality hook tied to state context
 *
 * No LLM required — deterministic, varied, grounded in real per-city data.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'Washington DC', FL:'Florida',
  GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts',
  MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana',
  NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
  TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};

// Regional climate/context reason WHY touchless matters in that state
const STATE_CONTEXT = {
  AL: 'Gulf humidity and red clay', AK: 'harsh winter road brine', AZ: 'fine desert dust',
  AR: 'red clay country roads', CA: 'coastal salt air and strict water rules',
  CO: 'magnesium chloride de-icer on I-70 and the Front Range',
  CT: 'New England winter road salt', DE: 'Atlantic I-95 salt spray',
  DC: 'dense commuter parking', FL: 'love bug splatter and tropical humidity',
  GA: 'iron-rich red clay', HI: 'tropical salt air and volcanic grit',
  ID: 'high-desert dust and mountain-pass salt', IL: 'Chicago winter salt and farm-country dust',
  IN: 'Great Lakes winter brine', IA: 'gravel county roads and heavy de-icer',
  KS: 'prairie wind-blown dust', KY: 'Appalachian foothill clay',
  LA: 'Gulf swamp humidity and hurricane-season grit', ME: 'Atlantic winter salt',
  MD: 'Bay-area humidity and DC-corridor traffic', MA: "Nor'easter road salt",
  MI: 'Great Lakes lake-effect winter brine',
  MN: 'extreme-cold road salt exposure',
  MS: 'Gulf humidity and cotton-country red dust',
  MO: 'Ozark drives and metro commuter grind',
  MT: 'mag-chloride de-icer and big-sky distances',
  NE: 'plains winter and I-80 commercial traffic',
  NV: 'desert dust in the Vegas Valley and beyond',
  NH: 'White Mountain winter salt', NJ: "Jersey Shore salt and NYC-commuter density",
  NM: 'high-desert adobe-red dust',
  NY: 'upstate winter brine and NYC-tight parking',
  NC: 'Piedmont red clay and Blue Ridge pollen',
  ND: 'brutal prairie winters',
  OH: 'Rust Belt winter salt and Lake Erie humidity',
  OK: 'red dust and tornado-alley storm mud',
  OR: 'Pacific NW rain and mountain-pass mag chloride',
  PA: 'Appalachian winter salt and dense metro traffic',
  RI: 'coastal salt air and Providence commuter grind',
  SC: 'Low Country humidity and coastal salt',
  SD: 'prairie dust and Badlands drives',
  TN: 'Smoky Mountain drives and red-clay foothills',
  TX: 'oil-field dust and Gulf-coast love bugs',
  UT: 'Wasatch Front winter inversion and red rock dust',
  VT: 'mud season and maple-country back roads',
  VA: 'Blue Ridge drives and NOVA commuter density',
  WA: 'Pacific NW rain and Cascade pass de-icer',
  WV: 'Appalachian hollers and coal-country dust',
  WI: 'Great Lakes snow belt and dense Kwik Trip Touch-Free coverage',
  WY: 'big-sky distances and brutal winter wind',
};

function pickHook(data, stateName, stateContext) {
  // Pick one hook type based on what data the city actually has.
  // Each hook is unique per data slice, so two cities with different
  // top listings / chains / amenities will get different opening prose.
  const { city, topListing, topChain, has24hr, hasLaser, totalCount } = data;

  // Priority 1: a standout top listing (high rating + lots of reviews)
  if (topListing && topListing.rating >= 4.5 && topListing.review_count >= 100) {
    return `{{TOP_LISTING}} leads the ${city} touchless scene with a {{TOP_RATING}}-star rating across {{TOP_REVIEWS}} customer reviews — a meaningful signal in a market where ${stateContext} makes a paint-safe wash a weekly necessity.`;
  }
  // Priority 2: dominant chain in this city
  if (topChain && topChain.count >= 2) {
    return `${topChain.name} dominates ${city}'s touchless footprint with ${topChain.count} bays here alone, part of the chain's broader ${stateName} presence. The touchless model suits ${stateContext}, which is harder on paint than most out-of-town drivers realize.`;
  }
  // Priority 3: 24-hour service
  if (has24hr) {
    return `${city} drivers can hit a touchless bay around the clock — at least one location here runs 24 hours, a rare convenience that matters when ${stateContext} demands an immediate rinse after a long drive.`;
  }
  // Priority 4: laser-wash equipment specifically
  if (hasLaser) {
    return `${city}'s touchless options include laser-guided wash equipment — the kind of precision setup that genuinely matters in ${stateName}, where ${stateContext} leaves behind grime that brush tunnels would just smear across clear coat.`;
  }
  // Priority 5 (default): location + state context
  if (totalCount === 1 && topListing) {
    return `${topListing.name} is the sole verified touchless option in ${city}, ${stateName} — a purely brushless wash worth knowing about when ${stateContext} calls for a no-friction rinse.`;
  }
  return `Touchless bays in ${city}, ${stateName} offer exactly what a state dealing with ${stateContext} needs: a high-pressure rinse with no brushes, cloth strips, or foam pads to drag grit across your finish.`;
}

function pickCountSentence(totalCount) {
  if (totalCount === 1) {
    return `{{TOP_LISTING}} is the only verified touchless location currently in our directory here.`;
  }
  // Varied phrasing so 2-listing cities don't all read identical
  const templates = [
    `Our directory currently tracks {{TOTAL_LISTINGS}} verified touchless locations in the area.`,
    `The current count stands at {{TOTAL_LISTINGS}} verified brushless washes within the city.`,
    `As of right now, {{TOTAL_LISTINGS}} touchless bays are verified and approved in our directory for this market.`,
    `We've verified {{TOTAL_LISTINGS}} brushless locations here, each confirmed as a true no-touch wash.`,
  ];
  return templates[totalCount % templates.length];
}

function pickCloser(data, stateName) {
  const { city, topListing, topChain, avgRating, totalCount } = data;
  if (totalCount === 1) {
    return ''; // one-listing cities are already fully covered by hook + count
  }
  if (topChain && topChain.count >= 2) {
    // Chain-focused closer
    if (topListing && topListing.name !== topChain.name) {
      return `Among independent operators, {{TOP_LISTING}} stands out with a {{TOP_RATING}}-star rating and {{TOP_REVIEWS}} customer reviews.`;
    }
    return `Customer sentiment averages ${avgRating} stars across the ${city} touchless footprint.`;
  }
  if (topListing && topListing.review_count >= 50) {
    return `The most-reviewed spot here is {{TOP_LISTING}} at {{TOP_RATING}} stars and {{TOP_REVIEWS}} customer reviews — a useful gauge of reliability.`;
  }
  if (topListing) {
    return `{{TOP_LISTING}} is currently our highest-rated touchless option in ${city}, holding a {{TOP_RATING}}-star score.`;
  }
  return `Most ${city} touchless washes are operated by independent locals rather than national chains.`;
}

function buildDescription(data, stateName, stateContext) {
  const hook = pickHook(data, stateName, stateContext);
  const count = pickCountSentence(data.totalCount);
  const closer = pickCloser(data, stateName);
  return [hook, count, closer].filter(Boolean).join(' ');
}

async function main() {
  // Load all approved touchless listings grouped by state+city
  console.log('Loading listings...');
  const byCity = new Map(); // key: "STATE|CityName" → { listings: [] }
  for (let offset = 0; offset < 60000; offset += 1000) {
    const { data } = await sb.from('listings')
      .select('id, name, city, state, rating, review_count, parent_chain, hours, amenities, touchless_wash_types')
      .eq('is_touchless', true).eq('is_approved', true)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const l of data) {
      if (!l.state || !l.city) continue;
      const key = `${l.state}|${l.city}`;
      if (!byCity.has(key)) byCity.set(key, []);
      byCity.get(key).push(l);
    }
    if (data.length < 1000) break;
  }
  console.log(`  ${byCity.size} unique state+city combos with approved touchless\n`);

  let done = 0, failed = 0, skipped = 0;
  const cityKeys = [...byCity.keys()];

  for (const key of cityKeys) {
    const [stateCode, city] = key.split('|');
    const stateName = STATE_NAMES[stateCode];
    const stateContext = STATE_CONTEXT[stateCode];
    if (!stateName || !stateContext) { skipped++; continue; }

    const listings = byCity.get(key);

    // Compute per-city data
    const totalCount = listings.length;
    // Top listing by rating × log(review_count + 1) — balances rating & volume
    const topListing = [...listings]
      .filter(l => l.rating && l.rating > 0)
      .sort((a, b) => (b.rating * Math.log10((b.review_count ?? 0) + 2)) - (a.rating * Math.log10((a.review_count ?? 0) + 2)))[0];

    // Dominant chain
    const chainCounts = {};
    for (const l of listings) {
      if (l.parent_chain) chainCounts[l.parent_chain] = (chainCounts[l.parent_chain] || 0) + 1;
    }
    const topChainEntry = Object.entries(chainCounts).sort((a,b) => b[1] - a[1])[0];
    const topChain = topChainEntry ? { name: topChainEntry[0], count: topChainEntry[1] } : null;

    // Amenities: 24-hour service? laser wash?
    const has24hr = listings.some(l => {
      const h = l.hours;
      if (!h) return false;
      return Object.values(h).some(v => typeof v === 'string' && /24\s*(?:hour|hr)|open\s*24|24\/7/i.test(v));
    });
    const hasLaser = listings.some(l => {
      const a = (l.amenities || []).join(' ') + ' ' + (l.touchless_wash_types || []).join(' ');
      return /laser/i.test(a);
    });

    // Avg rating
    const rated = listings.filter(l => l.rating && l.rating > 0);
    const avgRating = rated.length
      ? (rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length).toFixed(1)
      : null;

    const cityData = {
      city,
      totalCount,
      topListing: topListing ? { name: topListing.name, rating: Number(topListing.rating).toFixed(1), review_count: topListing.review_count ?? 0 } : null,
      topChain,
      has24hr,
      hasLaser,
      avgRating,
    };

    const desc = buildDescription(cityData, stateName, stateContext);
    if (desc.length < 80) { skipped++; continue; }

    const { error } = await sb.from('city_descriptions').upsert({
      state: stateCode,
      city,
      description: desc,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'state,city' });

    if (error) {
      failed++;
      if (failed <= 3) console.log(`  ❌ ${city}, ${stateCode}: ${error.message}`);
    } else {
      done++;
      if (done % 200 === 0) console.log(`  progress: ${done}/${cityKeys.length}`);
    }
  }

  console.log(`\nDone: ${done} updated, ${failed} failed, ${skipped} skipped`);

  // Show a few samples
  console.log('\n=== Sample rendered descriptions ===');
  for (const sampleKey of ['IL|Chicago', 'MT|Billings', 'IA|Davenport']) {
    const [sc, ci] = sampleKey.split('|');
    const { data } = await sb.from('city_descriptions').select('description').eq('state', sc).ilike('city', ci).maybeSingle();
    if (data) {
      // Also fetch live counts to render a sample
      const { count: total } = await sb.from('listings').select('*', { count: 'exact', head: true })
        .eq('is_touchless', true).eq('is_approved', true).eq('state', sc).ilike('city', ci);
      const rendered = data.description
        .replace(/\{\{TOTAL_LISTINGS\}\}/g, String(total))
        .replace(/\{\{TOP_LISTING\}\}/g, '[top listing]')
        .replace(/\{\{TOP_RATING\}\}/g, '[rating]')
        .replace(/\{\{TOP_REVIEWS\}\}/g, '[reviews]');
      console.log(`\n${ci}, ${sc}:\n${rendered}`);
    }
  }
}

main();
