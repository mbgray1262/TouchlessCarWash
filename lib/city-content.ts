/**
 * City-specific editorial content for the "Local Guide" section on
 * /state/[state]/[city] pages. Hand-curated for high-demand cities whose
 * directory listing counts are thin — the unique, locally-grounded copy
 * gives these pages the content depth they need to climb out of the bottom
 * of page one, without resorting to mass-generated boilerplate.
 *
 * IMPORTANT: keep this text distinct from lib/metro-content.ts. Some slugs
 * (houston, san-diego) exist as BOTH a /best metro and a city page; reusing
 * the same prose would create a duplicate-content signal between the two.
 *
 * Keyed by `${stateSlug}/${citySlug}` (citySlug = slugify(cityName)).
 */

export interface CityContent {
  /** 1-2 sentences of unique local framing: geography, demand, who drives here. */
  intro: string;
  /** 1-2 sentences on local climate / road conditions that dirty or damage cars. */
  climateNote: string;
  /** 1-2 sentences on why touchless specifically suits this city's conditions. */
  whyTouchless: string;
  /** 1 practical, local tip: when to wash, which areas, what to check for. */
  localTip: string;
}

export const CITY_CONTENT: Record<string, CityContent> = {
  'illinois/chicago': {
    intro:
      "Chicago drivers put their vehicles through some of the harshest conditions in the country, and verified touchless car washes in the city proper are genuinely scarce — most automated bays here run brushes. That makes the handful of true touch-free locations especially worth seeking out.",
    climateNote:
      "Chicago winters mean months of heavy road salt and brine on the Kennedy, the Dan Ryan, and Lake Shore Drive. That salt slurry cakes into wheel wells, rocker panels, and the undercarriage, where it quietly accelerates rust through spring.",
    whyTouchless:
      "A touchless wash blasts that corrosive salt out of every seam and panel gap with high-pressure water instead of dragging a brush — loaded with the same road grit — back across your paint. Through a Midwest winter, that is the difference between a clean car and a scratched one.",
    localTip:
      "In the salt season, prioritize an underbody rinse and wash every week to ten days rather than waiting for a warm spell. If the in-city options are busy, the suburbs listed below often have shorter lines and more touch-free bays.",
  },

  'texas/houston': {
    intro:
      "Houston's sheer size and long commutes mean cars here collect grime fast, and drivers who care about their finish increasingly look for touch-free washes over the brush tunnels that dominate the metro.",
    climateNote:
      "The Gulf Coast humidity drives heavy pollen, mold spores, and a sticky film that settles on paint within a day of washing, while summer love-bug season and frequent downpours leave mineral-spotted residue behind.",
    whyTouchless:
      "Pushing that gritty pollen-and-pollutant film around with a brush is how clear coats pick up swirl marks. A touchless system lifts and flushes it with pressurized water and detergent only — no contact, no scratches — which matters in a climate that forces you to wash often.",
    localTip:
      "Wash within a day or two of heavy pollen or a love-bug swarm so the residue does not bake on. The locations below and in nearby suburbs are filtered to confirmed touch-free bays, not brush tunnels.",
  },

  'california/san-diego': {
    intro:
      "San Diego's coastal setting is hard on vehicle finishes in a way that is easy to underestimate, and a touchless wash is the smart default for anyone who parks within a few miles of the water.",
    climateNote:
      "The daily marine layer leaves a fine film of salt mist on cars from Pacific Beach to Chula Vista, and the region's hard water adds mineral spotting on top. Both dull paint and creep into trim and panel gaps over time.",
    whyTouchless:
      "Brushes tend to push corrosive coastal salt deeper into seams; high-pressure touchless jets flush it out instead, and a spot-free final rinse keeps San Diego's hard-water minerals from drying onto the surface.",
    localTip:
      "If you park near the coast, a wash every week or two does far more for your paint than an occasional deep clean. Several of the locations below pair touch-free washing with spot-free rinse for the best coastal result.",
  },

  'pennsylvania/pittsburgh': {
    intro:
      "Pittsburgh's hills, rivers, and tunnels make for short but grimy commutes, and the city's long winters put a premium on washes that clean without grinding road treatment into your paint.",
    climateNote:
      "Steep terrain means heavy salt and anti-skid cinder on roads from the Fort Pitt Bridge to the Parkways for much of the winter, and that gritty cinder is especially abrasive when it sits on a panel.",
    whyTouchless:
      "Dragging a brush across cinder-coated paint is a recipe for scratches; a touchless wash rinses the grit and salt away with water pressure alone, protecting the finish through the worst of the season.",
    localTip:
      "Through winter, focus on frequent underbody and lower-panel rinses where cinder and salt collect. When the river-valley locations fill up, the nearby boroughs listed below are good alternates.",
  },

  'kansas/wichita': {
    intro:
      "Wichita sits in the heart of the plains, where wind, dust, and sudden weather keep vehicles dirty year-round and make a dependable touch-free wash a genuinely practical choice.",
    climateNote:
      "Constant prairie wind carries fine grit and agricultural dust onto every surface, and winter ice storms bring both road salt and the sand crews spread for traction.",
    whyTouchless:
      "Wind-blown grit acts like sandpaper the moment a brush presses it against your clear coat. Touchless washing lifts that dust and salt off with high-pressure water and detergent, leaving the finish untouched.",
    localTip:
      "After a dust-heavy windy stretch or an ice storm, give the car a touch-free rinse before the grit has time to scratch. The locations below confirm true no-touch washing rather than soft-cloth tunnels.",
  },

  'florida/orlando': {
    intro:
      "Orlando's heat, humidity, and near-daily summer storms mean Central Florida cars rarely stay clean for long, and touch-free washing is the gentlest way to keep up with it.",
    climateNote:
      "Subtropical humidity fuels heavy pollen, love-bug season, and afternoon thunderstorms that leave mineral-spotted rain residue, all of which bond to paint quickly in the Florida sun.",
    whyTouchless:
      "Love-bug splatter and pollen are acidic and abrasive; a brush smears them across the finish, while a touchless pre-soak and high-pressure rinse dissolve and flush them away without contact.",
    localTip:
      "Wash within a day of a heavy storm or a love-bug swarm so the residue does not etch in the heat. The options below and in the surrounding cities are filtered to confirmed touchless bays.",
  },
};

/**
 * Assemble the curated CityContent into rendered paragraphs for the
 * "Local Guide" section. Returns an array of paragraph strings.
 */
export function buildCityGuide(content: CityContent): string[] {
  return [
    `${content.intro} ${content.climateNote}`,
    `${content.whyTouchless} ${content.localTip}`,
  ];
}

/** Look up curated content for a city page, or null if none exists. */
export function getCityContent(stateSlug: string, citySlug: string): CityContent | null {
  return CITY_CONTENT[`${stateSlug}/${citySlug}`] ?? null;
}
