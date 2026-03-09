/**
 * Metro-specific content for Expert Guide sections on Best Of hub pages.
 * Each entry provides structured climate, environmental, and local data
 * that gets assembled into a unique ~200-word editorial intro.
 */

export interface MetroContent {
  /** Climate classification */
  climateZone: string;
  /** Top environmental concerns for vehicles in this metro */
  primaryConcerns: string[];
  /** 1-2 sentences about how the local climate specifically affects vehicles */
  seasonalNote: string;
  /** 1-2 sentences explaining why touchless is better here specifically */
  touchlessBenefit: string;
  /** 1-2 sentences about local driving context (population, commutes, traffic) */
  localContext: string;
  /** Common road contaminants specific to this metro */
  roadFactors: string[];
}

export const METRO_CONTENT: Record<string, MetroContent> = {
  houston: {
    climateZone: 'humid subtropical',
    primaryConcerns: ['humidity', 'pollen', 'industrial fallout', 'Gulf Coast salt air'],
    seasonalNote:
      "Houston's intense Gulf Coast humidity accelerates pollen buildup, mold growth, and oxidation on vehicle surfaces year-round. Spring brings some of the highest pollen counts in the country, coating cars in a thick yellow-green film within hours of washing.",
    touchlessBenefit:
      'Traditional brush washes can grind this ever-present pollen and fine particulate into your clear coat, creating micro-scratches that compound over time. A touchless wash uses only high-pressure water and specialized detergents to lift and flush contaminants away without any physical contact, preserving your finish in a climate that demands frequent washing.',
    localContext:
      "With nearly 7 million residents in the greater Houston metro and some of the longest average commute times in Texas, vehicles here accumulate road film, brake dust, and airborne pollutants faster than in most U.S. cities.",
    roadFactors: ['refinery and petrochemical soot', 'construction dust from rapid urban development', 'standing water residue after tropical storms', 'industrial fallout from the Ship Channel corridor'],
  },

  phoenix: {
    climateZone: 'desert arid',
    primaryConcerns: ['desert dust', 'caliche', 'UV damage', 'monsoon mud'],
    seasonalNote:
      "Phoenix's extreme desert heat and dust storms — known locally as haboobs — can coat a vehicle in fine abrasive particles in minutes. With over 300 sunny days per year, intense UV radiation also accelerates paint oxidation and clear coat degradation if contaminants aren't removed promptly.",
    touchlessBenefit:
      "In the Sonoran Desert, fine caliche dust acts like sandpaper when brushes push it across your paint. Touchless washes lift and flush this grit away with high-pressure water jets, protecting your finish from the scratching that makes desert-driven vehicles look prematurely aged.",
    localContext:
      "The Phoenix metro is home to over 5 million residents spread across a sprawling urban footprint. Long commutes through dusty corridors and construction zones mean vehicles need washing more frequently here than in most other metros.",
    roadFactors: ['caliche and calcium carbonate dust', 'red desert clay after monsoon rains', 'UV-baked insect residue', 'road salt from occasional winter freeze events on elevated highways'],
  },

  'san-diego': {
    climateZone: 'Mediterranean coastal',
    primaryConcerns: ['coastal salt air', 'marine layer moisture', 'UV exposure', 'coastal fog residue'],
    seasonalNote:
      "San Diego's proximity to the Pacific Ocean means vehicles are constantly exposed to salt-laden marine air, especially within a few miles of the coast. The daily marine layer deposits a fine mist of saltwater on vehicle surfaces that accelerates corrosion and dulls paint if left unchecked.",
    touchlessBenefit:
      "Coastal salt creates a corrosive film that brush-style washes can actually push deeper into panel seams and trim gaps. Touchless washes use high-pressure water to blast salt residue out of every contour of your vehicle, followed by spot-free rinse agents that prevent mineral deposits from the region's hard water.",
    localContext:
      "San Diego's 3.3 million metro residents enjoy year-round mild weather, but that same climate means salt air exposure never lets up. Whether you park near the beach or commute along the I-5 and I-8 corridors, regular touchless washing is the best defense against coastal paint damage.",
    roadFactors: ['ocean salt spray and marine aerosol', 'coastal fog mineral deposits', 'bird droppings from coastal wildlife', 'pollen from year-round blooming vegetation'],
  },

  'dallas-fort-worth': {
    climateZone: 'humid subtropical with continental influence',
    primaryConcerns: ['extreme temperature swings', 'spring hailstorms', 'construction dust', 'wind-blown debris'],
    seasonalNote:
      "North Texas is known for dramatic weather swings — temperatures can shift 40 degrees in a single day, and severe spring storms bring hail that can damage vehicles already weakened by poor paint care. The region's persistent wind carries fine red clay and construction particulate that settles on every surface.",
    touchlessBenefit:
      "When wind-blown grit and red clay dust accumulate on your vehicle, running it through a brush wash grinds those abrasive particles across the paint. Touchless systems dissolve and rinse away these contaminants without contact, which is especially important in a metro where frequent severe weather means you need to wash often.",
    localContext:
      "The Dallas\u2013Fort Worth metroplex is the fourth-largest metro in the U.S. with over 8 million residents. Massive ongoing highway construction and suburban development create a near-constant cloud of airborne dust and debris that settles on parked and moving vehicles alike.",
    roadFactors: ['red clay and prairie dust', 'construction debris from highway expansion projects', 'tree pollen from spring cedar and oak seasons', 'insect residue from warm-season highway driving'],
  },

  denver: {
    climateZone: 'semi-arid high altitude',
    primaryConcerns: ['road salt and magnesium chloride', 'intense UV at altitude', 'freeze-thaw cycling', 'mountain dust'],
    seasonalNote:
      "At over 5,000 feet elevation, Denver's thin atmosphere means UV radiation is roughly 25% more intense than at sea level, accelerating paint oxidation. Winters bring heavy applications of magnesium chloride (mag) on highways, which is more corrosive than traditional road salt and clings stubbornly to undercarriages and wheel wells.",
    touchlessBenefit:
      'Mag chloride is notorious for bonding to metal and paint surfaces. Brush washes can spread this corrosive chemical across your entire vehicle instead of removing it. Touchless washes use targeted high-pressure jets to blast mag residue from undercarriages, wheel wells, and panel gaps where it does the most damage.',
    localContext:
      "Denver's 3 million metro residents face a unique combination of harsh winters and over 300 days of sunshine. The constant freeze-thaw cycle means road treatment chemicals are applied heavily from October through April, making regular underbody washing essential.",
    roadFactors: ['magnesium chloride road treatment', 'mountain gravel and sand from I-70 corridor', 'wildfire ash during summer fire season', 'high-altitude UV-accelerated oxidation'],
  },

  'salt-lake-city': {
    climateZone: 'semi-arid continental',
    primaryConcerns: ['heavy road salt', 'lake-effect snow residue', 'winter inversion smog', 'mineral-rich dust'],
    seasonalNote:
      "Salt Lake City's winters bring both heavy snowfall and aggressive road salt applications. The city's notorious winter temperature inversions trap a layer of smog and particulate matter close to the ground for weeks at a time, depositing a film of pollutants on every vehicle surface.",
    touchlessBenefit:
      'Road salt combined with inversion-trapped particulate creates an especially abrasive and corrosive mixture on vehicle paint. Brushes drag this gritty slurry across your finish, causing swirl marks and accelerating corrosion. Touchless washes rinse it all away without contact, which is critical during the long Wasatch Front winter season.',
    localContext:
      "The Salt Lake City metro area is home to 1.2 million residents who depend on their vehicles for commutes along the I-15 corridor and trips into the Wasatch Mountains. The region's mineral-rich Great Salt Lake dust adds another layer of corrosive exposure unique to this metro.",
    roadFactors: ['heavy road salt from November through March', 'Great Salt Lake mineral dust', 'inversion-layer smog deposits', 'mountain canyon gravel and sand'],
  },

  'los-angeles': {
    climateZone: 'Mediterranean',
    primaryConcerns: ['smog and particulate matter', 'wildfire ash', 'brake dust from heavy traffic', 'coastal salt'],
    seasonalNote:
      "Los Angeles air carries a persistent load of fine particulate matter from vehicle exhaust, industrial emissions, and seasonal wildfire smoke. During fire season (typically June through November), ash can blanket vehicles across the entire basin, and this alkaline residue can etch paint if not removed quickly.",
    touchlessBenefit:
      'Wildfire ash is alkaline and chemite — it bonds with moisture to create a mildly caustic paste that brush washes can grind into your clear coat. Touchless systems use chemical pre-soaks to neutralize and dissolve ash before high-pressure rinsing, protecting your paint from both mechanical and chemical damage.',
    localContext:
      "Greater Los Angeles is home to over 13 million residents and has some of the worst traffic congestion in the nation. Stop-and-go freeway driving generates enormous amounts of brake dust that settles on nearby vehicles, adding to the already heavy particulate load from the basin's infamous smog.",
    roadFactors: ['smog and exhaust particulate', 'wildfire ash and soot during fire season', 'brake dust from heavy freeway traffic', 'coastal salt spray in beach communities'],
  },

  seattle: {
    climateZone: 'oceanic',
    primaryConcerns: ['constant rain residue', 'tree sap and pollen', 'moss and mildew growth', 'road grime'],
    seasonalNote:
      "Seattle averages around 150 rainy days per year, and while individual rainfall amounts are light, the near-constant moisture creates ideal conditions for mildew, moss, and algae to grow on vehicle surfaces — especially in shaded parking areas. The region's dense tree canopy also drops sap, pollen, and organic debris year-round.",
    touchlessBenefit:
      "Pacific Northwest road grime is a mix of wet organic matter, decomposing leaves, and mineral-laden rain runoff that clings to paint. Brush washes can smear this organic slurry and embed fine particles into your clear coat. Touchless systems use high-pressure water and surfactants to dissolve and rinse away this stubborn buildup without scratching.",
    localContext:
      "The Seattle metro area is home to over 4 million residents who navigate rain-slicked roads for much of the year. The combination of constant moisture, dense evergreen canopy, and mild temperatures creates conditions where vehicles accumulate grime faster than in drier climates, making frequent touchless washing essential for paint preservation.",
    roadFactors: ['rain-mixed road film and mineral deposits', 'evergreen tree sap and conifer pollen', 'decomposing leaf matter on wet roads', 'moss and algae growth in shaded parking areas'],
  },
};

/**
 * Build a ~200-word expert guide paragraph from structured metro content.
 * Returns an array of paragraphs (strings) for rendering.
 */
export function buildExpertGuide(
  metroName: string,
  content: MetroContent,
  listingCount: number,
): string[] {
  const paragraphs: string[] = [];

  // Paragraph 1: Climate + local context
  paragraphs.push(
    `${content.seasonalNote} ${content.localContext}`
  );

  // Paragraph 2: Why touchless + road factors
  const factorsList = content.roadFactors.slice(0, 3).join(', ');
  paragraphs.push(
    `Common road contaminants in the ${metroName} area include ${factorsList}. ${content.touchlessBenefit}`
  );

  // Paragraph 3: Call to action with listing count
  paragraphs.push(
    `We've identified and ranked the top ${Math.min(listingCount, 10)} touchless car washes in the ${metroName} metro area below, scored by Google ratings, verified customer reviews, and confirmed touchless technology.`
  );

  return paragraphs;
}
