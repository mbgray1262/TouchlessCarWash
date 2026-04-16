#!/usr/bin/env node
/**
 * Regenerate state_descriptions as templates with placeholder tokens:
 *   {{TOTAL_LISTINGS}}, {{UNIQUE_CITIES}}, {{TOP_CITY}}, {{TOP_CITY_COUNT}}
 *
 * These get substituted at page render time (see renderStateDescription
 * in app/state/[state]/page.tsx) so counts are ALWAYS live — no stale
 * number problem even as listings are added/removed.
 *
 * Each state gets a unique regional hook (weather, terrain, local driving
 * conditions) and varied sentence structure — prevents Google's
 * "Duplicate without user-selected canonical" flag on thin state pages.
 *
 * No LLM required — deterministic, zero-cost, zero-rate-limit.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Per-state: regional hook paragraph (why touchless matters here) + a
// distinctive closing fact. Each is unique prose, different sentence
// structure, and grounded in that state's actual driving reality.
const STATE_CONTENT = {
  AL: {
    hook: "Alabama roads collect a thick paste of Gulf salt air, red-clay dust, and love bug splatter that brush-style tunnels can grind into paint clear coats. Touchless wash bays rinse all of that off with pressure alone — no bristles, no swirl marks.",
    close: "Mobile and Birmingham drivers report the strongest touchless coverage; smaller markets rely on independent mom-and-pop bays.",
  },
  AK: {
    hook: "Between sub-zero winters and a road-brine routine that eats chrome, Alaskan drivers have every reason to avoid the friction brushes of a traditional tunnel. Touchless bays stay operational through the cold snap and pull road salt off without adding scratches.",
    close: "Anchorage anchors most of our state coverage — the Interior has far fewer heated touchless bays due to climate and density.",
  },
  AZ: {
    hook: "Arizona's desert dust is fine enough to slip between the cloth strips of a conventional automatic, grinding like sandpaper across black paint. A genuine touchless wash bypasses that friction entirely — only high-pressure water and presoak touch the surface.",
    close: "Year-round washing weather means Phoenix and Tucson drivers get more life out of a touchless wash plan than anywhere else in the country.",
  },
  AR: {
    hook: "Arkansas drivers contend with red clay that embeds into paint pores and Ouachita gravel that rides up into door seams. A touchless rinse is the safest way to flush that grit without dragging it across the finish.",
    close: "Little Rock and Fayetteville hold most of our state's touchless inventory; rural stretches rely on self-serve bays and occasional touchless stations at truck-stop convenience chains.",
  },
  CA: {
    hook: "California's combination of Pacific salt air, coastal dust, and strict drought-era water rules has made touchless bays a practical necessity — most reclaim-water systems are legally required, and no-brush means no scratch on the used-Tesla resale value.",
    close: "The top three touchless chains (Classy Chassis, Elephant, independent laser washes) all cluster along the I-5 and Pacific Coast Highway corridors.",
  },
  CO: {
    hook: "Colorado Department of Transportation uses magnesium chloride liquid de-icer, which leaves an invisible salt film far worse than rock salt alone. That film requires a high-pressure touchless rinse to lift — brush washes just smear it across the clear coat.",
    close: "Denver Metro, Fort Collins, and Colorado Springs lead statewide touchless density; mountain-pass communities rely heavily on independent laser-wash bays.",
  },
  CT: {
    hook: "New England winter brine paired with Connecticut's tight, hilly roads means salt-laden slush gets everywhere — wheel wells, undercarriage, rocker panels. Touchless bays rinse all of it off without dragging the grit around the car the way cloth-strip tunnels do.",
    close: "Hartford and New Haven dominate our Connecticut coverage; shoreline communities lean toward seasonal self-serve bays.",
  },
  DE: {
    hook: "Delaware is small but sits on a high-traffic Atlantic corridor where I-95 kicks up more salt spray per mile than almost any other state. Even a quick touchless rinse after a round trip flushes that residue before it bonds to the clear coat.",
    close: "Wilmington is the center of our Delaware coverage — the southern beach towns rely largely on seasonal independent operators.",
  },
  DC: {
    hook: "DC commuters navigate some of the tightest parking in the country, which means clipped mirrors and scratched clear coats are constant risks. Touchless washes skip the mechanical arms and cloth strips entirely — nothing physical touches the paint.",
    close: "Most DC touchless options sit just across the Potomac in Arlington and Alexandria due to District real estate constraints.",
  },
  FL: {
    hook: "Florida love bugs are notoriously corrosive — their remains eat into paint within 48 hours of a highway drive. A high-pressure touchless rinse lifts them off without the brushes pushing their residue across the clear coat.",
    close: "The Tampa-to-Jacksonville corridor has the strongest touchless coverage in Florida; Miami's density is growing but remains chain-heavy.",
  },
  GA: {
    hook: "Georgia red clay is iron-rich, which means dust that stays on paint too long actually starts to oxidize and stain. A quick touchless rinse after an off-road detour or a clay-county visit prevents that reddish tint from setting into the finish.",
    close: "Atlanta sprawl drives most Georgia demand — Savannah and Augusta have smaller but rapidly growing touchless footprints.",
  },
  HI: {
    hook: "Hawaiian salt air, volcanic grit on the Big Island, and tropical humidity make traditional tunnel brushes a paint-swirl factory. Touchless bays rinse clean without the mechanical contact that accelerates oxidation on island-kept vehicles.",
    close: "Honolulu dominates our Hawaii coverage; neighbor-island options remain extremely limited.",
  },
  ID: {
    hook: "From Boise's high-desert dust to the mag chloride on mountain passes, Idaho drivers see both the summer grit and the winter salt problem. Touchless bays are the one wash type that handles both without introducing swirl marks.",
    close: "Boise and the Treasure Valley hold most of Idaho's touchless inventory; northern panhandle drivers rely more on self-serve bays.",
  },
  IL: {
    hook: "Chicago lays down enough road salt in a single week to rust a bumper, and downstate farm country dust clings to the undercarriage long into spring. A touchless rinse handles both without brushes dragging abrasive material across the finish.",
    close: "The Chicago metro drives most touchless demand in Illinois — downstate coverage is thinner and more independent-operator-heavy.",
  },
  IN: {
    hook: "Midwest winter brine plus Indiana's proximity to the Great Lakes humidity means salt residue stays on paint longer than in drier states. Touchless bays are the practical counter — high-pressure rinse, no swirl-inducing contact.",
    close: "Indianapolis and Fort Wayne lead our Indiana coverage; Elkhart and South Bend are strong secondary markets fed by regional chain growth.",
  },
  IA: {
    hook: "Gravel county roads and heavy winter de-icer use mean Iowa vehicles pick up both grit and salt film at the same time. A no-touch wash lifts the combination off — brushes would embed the gravel pieces into the paint.",
    close: "Kwik Trip's touch-free program powers much of Iowa's state coverage alongside independent laser-wash bays in the Des Moines and Cedar Rapids metros.",
  },
  KS: {
    hook: "Kansas prairie winds carry fine red dirt that embeds into paint like fine-grit sandpaper. Brush tunnels just smear it; a true touchless rinse lifts it without the mechanical contact that creates swirl damage.",
    close: "Wichita and the Kansas City suburbs hold most of our touchless coverage in Kansas; rural Flint Hills drives rely on truck-stop brushless bays.",
  },
  KY: {
    hook: "Bourbon Trail drives through Kentucky's Appalachian foothills mean a lot of limestone dust and clay — a combination that scratches paint if brushes push it across the clear coat. Touchless bays sidestep the problem entirely.",
    close: "Louisville and Lexington dominate Kentucky's touchless inventory; the eastern counties still lean heavily on self-serve wand bays.",
  },
  LA: {
    hook: "Louisiana swamp humidity, Gulf salt, and hurricane-season grit make a cocktail that bakes onto paint in direct sun. A touchless rinse breaks the film with high-pressure water and presoak chemistry — no brushes needed.",
    close: "Baton Rouge and New Orleans anchor our Louisiana coverage; Shreveport's market is smaller but steadily growing.",
  },
  ME: {
    hook: "Atlantic winter salt and Maine's coastal ferry routes mean vehicles see brine exposure most of the year. Touchless bays stay heated through the worst cold snaps and rinse the salt off without mechanical swirls.",
    close: "Portland is the center of Maine's touchless coverage — northern and eastern Maine rely more on seasonal self-serve stations.",
  },
  MD: {
    hook: "The Baltimore-DC corridor concentrates more salt spray, road grime, and commuter traffic per mile than almost any stretch in the country. A weekly touchless rinse is the bare minimum to keep a commuter's clear coat looking intact.",
    close: "Baltimore and the Maryland DC-suburbs lead touchless coverage; Annapolis and the Eastern Shore rely on smaller independent bays.",
  },
  MA: {
    hook: "Nor'easter road salt and Boston's tight parking combine to create both chemical and mechanical risk for paint. Touchless washes address the first without adding to the second — no brushes near the clear coat.",
    close: "The Boston metro and Worcester hold the strongest touchless density in Massachusetts; western Mass relies on independent laser-wash bays.",
  },
  MI: {
    hook: "Michigan auto-worker heritage meets Great Lakes lake-effect snow — which means locals both care deeply about paint and face some of the worst winter road conditions in the country. Touchless is the practical answer.",
    close: "Detroit Metro leads Michigan's touchless coverage, with Grand Rapids and Ann Arbor as strong secondary hubs.",
  },
  MN: {
    hook: "Minnesota drivers face some of the harshest road salt exposure in the US, and they've responded by building one of the densest touchless networks in the country — anchored by Kwik Trip's Touch-Free program across the state.",
    close: "The Twin Cities dominate touchless density, but Kwik Trip's rural penetration gives Minnesota broader coverage than any other northern state.",
  },
  MS: {
    hook: "Mississippi's Gulf humidity and cotton-country red dust create a sticky film that brushes spread across paint rather than remove. A touchless rinse handles both the moisture and the dust without mechanical contact.",
    close: "Jackson and the Gulf Coast communities hold what touchless inventory exists in Mississippi; rural counties rely heavily on self-serve wand bays.",
  },
  MO: {
    hook: "From St. Louis highway commutes to Ozark mountain drives, Missouri vehicles pick up a mix of salt, dust, and limestone residue. Touchless bays lift the combination without brushing grit across the finish.",
    close: "St. Louis and Kansas City anchor Missouri's touchless inventory; Springfield and Columbia round out the mid-state coverage.",
  },
  MT: {
    hook: "Montana's open-sky highways and mag-chloride winter de-icer mean long drives often end with a hood coated in both dust and invisible salt residue. A touchless wash lifts both without introducing swirl marks.",
    close: "Billings leads Montana's touchless coverage; Glacier-gateway and Yellowstone-gateway communities have growing but still sparse touchless options.",
  },
  NE: {
    hook: "Nebraska prairie winters plus I-80 commercial traffic throw enough salt and fine dust at a windshield that weekly rinses quickly become necessary. Touchless is the paint-safe option for that routine.",
    close: "Omaha and Lincoln hold most of Nebraska's touchless inventory; rural counties rely on truck-stop touch-free bays and Kwik Trip spillover from neighboring states.",
  },
  NV: {
    hook: "Nevada desert dust is fine and abrasive enough to scratch paint if brushes push it around — and Vegas Valley drivers rack up so many miles that the buildup happens fast. Touchless bays rinse it off without the friction.",
    close: "Las Vegas and Reno dominate Nevada's touchless coverage; smaller Lake Tahoe-adjacent communities have a handful of independent bays.",
  },
  NH: {
    hook: "White Mountain winter salt and compact New Hampshire driving routes mean vehicles cycle through brine exposure constantly from December through April. Touchless bays rinse the residue without adding brush-induced swirl patterns.",
    close: "Manchester and Nashua are New Hampshire's touchless hubs; the northern White Mountains have very limited brushless options.",
  },
  NJ: {
    hook: "Jersey Shore salt, NYC-commuter density, and aggressive winter de-icer use combine to make New Jersey one of the hardest states on a vehicle's clear coat. Touchless is the defensive choice — no brushes, no swirl.",
    close: "Northern Jersey's NYC-commuter suburbs drive most of the state's touchless demand; Shore communities see seasonal-only operators.",
  },
  NM: {
    hook: "New Mexico's high-desert dust and adobe-red roads throw a particular kind of iron-rich dirt at vehicles — one that stains if brushed across paint. A true touchless rinse lifts it without the friction that causes staining.",
    close: "Albuquerque holds most of New Mexico's touchless coverage; Santa Fe and Las Cruces have smaller but active independent bays.",
  },
  NV_alt: null,
  NY: {
    hook: "From upstate winter brine to NYC-tight parking, New York drivers see both the chemistry and the mechanical risks that eat paint. Touchless bays remove the first without contributing to the second.",
    close: "Upstate NY — Rochester, Albany, Syracuse, Buffalo — has denser touchless coverage than the five boroughs, where real-estate constraints limit bay-style facilities.",
  },
  NC: {
    hook: "North Carolina Piedmont red clay, coastal salt, and Blue Ridge pollen combine into a seasonal paint assault that brush tunnels just spread around. Touchless handles the rinse cleanly.",
    close: "The Research Triangle and Charlotte metro hold the strongest touchless inventory; coastal Wilmington and Piedmont communities are rapidly catching up.",
  },
  ND: {
    hook: "North Dakota winters are brutal enough that road salt is a constant companion from October through April. Touchless bays are usually the only automatic option that stays operational through the deep cold.",
    close: "Fargo anchors North Dakota's touchless coverage; Bismarck and Grand Forks round out the state's brushless inventory.",
  },
  OH: {
    hook: "Rust Belt winter salt meets Lake Erie humidity in Ohio, creating the kind of slow-burn corrosion that ruins undercarriages. Weekly touchless rinses — especially through February and March — meaningfully extend a vehicle's lifespan.",
    close: "Cleveland, Columbus, and Cincinnati each have strong touchless networks; Dayton and Akron are solid secondary markets.",
  },
  OK: {
    hook: "Oklahoma red dust plus tornado-alley storm mud means vehicles often come out of a single drive looking like they were off-roading. Touchless bays handle both the fine dust and the mud without brushing abrasives across the finish.",
    close: "Oklahoma City and Tulsa hold most of Oklahoma's touchless inventory; the plains communities rely on truck-stop touch-free bays.",
  },
  OR: {
    hook: "Pacific Northwest rain means Oregon vehicles rarely look dry long enough for dirt to bake on — but the constant moisture also means moss, algae, and road film build up fast. Touchless rinses keep that manageable without mechanical swirl.",
    close: "Portland and Eugene hold most of Oregon's touchless coverage; Medford and Bend have smaller but growing brushless networks.",
  },
  PA: {
    hook: "Pennsylvania's Appalachian winters plus dense Pittsburgh and Philly metros mean salt-heavy, traffic-heavy driving conditions. Touchless bays flush the salt without the brushes that grind road grit into clear coats.",
    close: "Philadelphia, Pittsburgh, and the Harrisburg corridor lead Pennsylvania's touchless coverage; Amish country communities have a surprising number of independent laser-wash bays.",
  },
  RI: {
    hook: "Rhode Island is small, but the coastal salt air and Providence commuter base create real paint-wear conditions year-round. Touchless bays handle that without contributing mechanical damage on top of it.",
    close: "Providence holds most of Rhode Island's touchless inventory; the coastal communities supplement with seasonal self-serve stations.",
  },
  SC: {
    hook: "South Carolina Low Country humidity plus coastal salt air plus red clay upstate equals three different paint-threat vectors — all handled by the same touchless rinse, without brushes to spread the damage.",
    close: "Charleston and the Myrtle Beach area hold the strongest coastal touchless coverage; Greenville-Spartanburg anchors upstate inventory.",
  },
  SD: {
    hook: "South Dakota prairie winters and Badlands dust are both abrasive in their own way — and brushes push both across paint rather than removing them. Touchless is the paint-safe path.",
    close: "Sioux Falls dominates South Dakota's touchless coverage; Rapid City and Black Hills communities rely on a smaller independent operator base.",
  },
  TN: {
    hook: "Tennessee's Smoky Mountain drives plus Nashville growth plus red-clay foothills mean a lot of mixed-substrate road grime on any given day. Touchless rinses lift all three types without brushing abrasives around.",
    close: "Nashville and Memphis lead Tennessee's touchless coverage; Knoxville and Chattanooga have smaller but growing brushless networks.",
  },
  TX: {
    hook: "Texas is large enough that a single touchless wash plan covers more driving conditions than most entire states experience — from oil-field dust in West Texas to love-bug splatter on the Gulf coast. Brushless handles all of it.",
    close: "The Dallas-Fort Worth, Houston, and Austin-San Antonio corridors dominate Texas touchless inventory; the Panhandle and Rio Grande Valley have sparser coverage.",
  },
  UT: {
    hook: "Utah's Wasatch Front winter inversion traps road-salt-laden moisture in the valley air, which deposits onto vehicles as a hard-to-remove film. High-pressure touchless rinses lift that film better than any brush system can.",
    close: "Salt Lake City and the Wasatch Front hold most of Utah's touchless coverage; St. George and the southern red-rock communities have a small independent touchless footprint.",
  },
  VT: {
    hook: "Vermont mud season, maple country back roads, and heavy winter de-icer all make a case for touchless washes specifically — brushes just spread the mud, and salt residue bakes onto paint if left. Touchless handles both cleanly.",
    close: "Burlington is the center of Vermont's touchless coverage; outlying towns rely on a limited independent-operator base.",
  },
  VA: {
    hook: "Northern Virginia commuter density plus Chesapeake salt plus Blue Ridge pollen make a year-round case for touchless — different threats each season, same paint-safe solution.",
    close: "Northern Virginia (near DC) and Richmond anchor Virginia's touchless inventory; Hampton Roads and the Shenandoah Valley are growing secondary markets.",
  },
  WA: {
    hook: "Pacific Northwest rain keeps Washington vehicles perpetually wet, but constant moisture plus Cascade pass mag-chloride de-icer means paint takes real chemical abuse. Touchless rinses handle it without brushes introducing swirl patterns.",
    close: "Seattle and Tacoma hold the densest touchless coverage in Washington; Spokane is a strong eastside market with its own separate chain ecosystem.",
  },
  WV: {
    hook: "West Virginia's mountain hollers, coal country back roads, and steep winter driving mean a particular combination of mud, dust, and salt that brushes just spread around. Touchless sidesteps that.",
    close: "Charleston and Morgantown hold most of West Virginia's touchless coverage; the state's rural character keeps independent bays relevant.",
  },
  WI: {
    hook: "Wisconsin Great Lakes lake-effect snow pairs with some of the densest Kwik Trip touch-free bay coverage in the country — which means Wisconsin drivers have more walk-in brushless options per capita than almost any other state.",
    close: "Milwaukee and Madison anchor metro touchless coverage; Kwik Trip's statewide Touch-Free program means rural Wisconsin has better brushless access than most rural markets elsewhere.",
  },
  WY: {
    hook: "Wyoming's big-sky distances and brutal winter wind mean both long-haul dust accumulation and heavy road-salt exposure. Touchless bays are the workable automatic option — brushes just make the problem worse under those conditions.",
    close: "Cheyenne, Casper, and Laramie hold most of Wyoming's touchless inventory; outlying communities rely on truck-stop touch-free bays along the I-80 and I-25 corridors.",
  },
};

// Count sentence templates — varied structure so they don't all read the same
const COUNT_TEMPLATES = [
  "Our directory currently tracks {{TOTAL_LISTINGS}} verified touchless locations across {{UNIQUE_CITIES}} cities here, with {{TOP_CITY}} leading at {{TOP_CITY_COUNT}} bays alone.",
  "As of right now, {{TOTAL_LISTINGS}} brushless locations are verified in our database, spread across {{UNIQUE_CITIES}} cities — {{TOP_CITY}} accounts for {{TOP_CITY_COUNT}} of them.",
  "The current tally: {{TOTAL_LISTINGS}} verified touchless locations in {{UNIQUE_CITIES}} cities, concentrated most heavily in {{TOP_CITY}} ({{TOP_CITY_COUNT}} locations).",
  "Today that footprint covers {{TOTAL_LISTINGS}} verified touchless bays in {{UNIQUE_CITIES}} cities, with the largest single cluster — {{TOP_CITY_COUNT}} locations — in {{TOP_CITY}}.",
  "We currently verify {{TOTAL_LISTINGS}} touchless locations across {{UNIQUE_CITIES}} separate cities, and {{TOP_CITY}} sits at the top of that list with {{TOP_CITY_COUNT}} bays.",
];

// Hash state code to pick a deterministic template index (so the same state
// always gets the same variant — stable URLs, no surprise changes)
function pickTemplate(stateCode) {
  let h = 0;
  for (const ch of stateCode) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return COUNT_TEMPLATES[Math.abs(h) % COUNT_TEMPLATES.length];
}

function buildDescription(stateCode) {
  const meta = STATE_CONTENT[stateCode];
  if (!meta) return null;
  const countSentence = pickTemplate(stateCode);
  return `${meta.hook} ${countSentence} ${meta.close}`;
}

async function main() {
  const stateCodes = Object.keys(STATE_CONTENT).filter(k => STATE_CONTENT[k]);
  console.log(`Regenerating descriptions for ${stateCodes.length} states as templates with placeholders...\n`);

  let done = 0;
  let failed = 0;
  for (const sc of stateCodes) {
    const desc = buildDescription(sc);
    if (!desc) { failed++; continue; }
    const { error } = await sb.from('state_descriptions').upsert({
      state: sc,
      description: desc,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'state' });
    if (error) {
      console.log(`  ❌ ${sc}: ${error.message}`);
      failed++;
    } else {
      done++;
      console.log(`  ✅ ${sc} (${desc.length} chars)`);
    }
  }
  console.log(`\nDone: ${done} updated, ${failed} failed`);

  // Show one sample rendered with real counts
  if (done > 0) {
    const sampleCode = 'MT';
    const template = buildDescription(sampleCode);
    const { count: total } = await sb.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_touchless', true).eq('is_approved', true).eq('state', sampleCode);
    const { data: cities } = await sb.rpc('cities_in_state_with_counts', { p_state: sampleCode });
    const rendered = template
      .replace(/\{\{TOTAL_LISTINGS\}\}/g, String(total))
      .replace(/\{\{UNIQUE_CITIES\}\}/g, String(cities?.length || 0))
      .replace(/\{\{TOP_CITY\}\}/g, cities?.[0]?.city || '')
      .replace(/\{\{TOP_CITY_COUNT\}\}/g, String(cities?.[0]?.count || 0));
    console.log(`\nSample rendered (Montana):\n${rendered}`);
  }
}

main();
