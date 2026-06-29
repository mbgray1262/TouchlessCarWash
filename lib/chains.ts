/**
 * Touchless car wash chain definitions.
 *
 * Keys match the `parent_chain` field on listings.
 * Used by /chains hub and /chain/[slug] pages.
 *
 * Descriptions support a {count} placeholder that's replaced at render time
 * with the live touchless location count. Use renderChainDescription() below.
 */

export interface Chain {
  name: string;       // exact match to parent_chain in DB
  slug: string;       // URL slug
  description: string; // SEO description — supports {count} placeholder
}

export const CHAINS: Chain[] = [
  {
    name: 'Power Market',
    slug: 'power-market',
    description: 'Power Market operates {count} touchless car wash locations at gas stations across California, Oregon, and Nevada. Part of the H&S Energy Group, all Power Market car washes use Istobal touchless equipment for a safe, scratch-free wash.',
  },
  {
    name: 'Circle K',
    slug: 'circle-k',
    description: 'Circle K is one of the largest convenience store chains in the world, with Touch Free touchless car washes at {count} verified locations across 13 states — from Arizona and California to Florida, Illinois, Texas, and the upper Midwest. Circle K car wash kiosks offer a "Touch Free" option for a high-pressure, brushless, scratch-free automatic wash.',
  },
  {
    name: 'Holiday Stationstores',
    slug: 'holiday-stationstores',
    description: 'Holiday Stationstores, now part of the Circle K family, offers Touch Free car washes at {count} locations across the upper Midwest. Their touchless bays provide a convenient, brushless wash alongside fuel and convenience store services.',
  },
  {
    name: 'Extra Mile',
    slug: 'extra-mile',
    description: 'Extra Mile is Chevron\'s convenience store brand, with {count} locations offering touchless car washes operated by H&S Energy Group. Found primarily in California, these locations feature Istobal touchless equipment.',
  },
  {
    name: 'Pinnacle 365',
    slug: 'pinnacle-365',
    description: 'Pinnacle 365 is an H&S Energy Group convenience store brand with {count} touchless car wash locations in California and Oregon. Like their sister brand Power Market, all Pinnacle 365 car washes use Istobal touchless technology.',
  },
  {
    name: 'Kwik Trip',
    slug: 'kwik-trip',
    description: 'Kwik Trip is a Midwest convenience store chain offering touchless car washes at {count} locations across Wisconsin and Minnesota. Known for their clean facilities and competitive pricing, Kwik Trip touchless washes are a popular choice for local drivers.',
  },
  {
    name: 'BP',
    slug: 'bp',
    description: 'Select BP gas stations offer touchless car washes at {count} locations nationwide, providing a quick and convenient brushless wash alongside fuel.',
  },
  {
    name: 'Elephant Car Wash',
    slug: 'elephant-car-wash',
    description: 'Elephant Car Wash is a well-known car wash chain with {count} touchless locations in the Pacific Northwest and Arizona. Many of their locations offer touchless automatic bays alongside self-serve options, with several sites operating 24 hours a day.',
  },
  {
    name: 'Brown Bear',
    slug: 'brown-bear',
    description: 'Brown Bear Car Wash is a Washington state institution, operating {count} touchless car wash locations across the Puget Sound area and Spokane. Their touchless bays offer a safe, scratch-free clean with self-serve vacuum stations.',
  },
  {
    name: 'Gorilla Wash',
    slug: 'gorilla-wash',
    description: 'Gorilla Wash operates {count} touchless car wash locations across Iowa, Nebraska, Missouri, and Texas. Their touch-less automatic bays provide a gentle, brushless clean, with many locations tied in with Kum & Go convenience stores.',
  },
  {
    name: 'Sheetz',
    slug: 'sheetz',
    description: 'Sheetz is a major convenience store chain in the Mid-Atlantic and Midwest, with touchless car washes at {count} locations across Pennsylvania, Ohio, North Carolina, Maryland, Virginia, and West Virginia. Their automated touchless bays offer a quick, scratch-free wash alongside fuel and made-to-order food.',
  },
  {
    name: 'Autowash',
    slug: 'autowash',
    description: 'Autowash operates {count} automatic touchless car wash locations across Colorado — from Fort Collins and Loveland up north to Denver, Littleton, and Highlands Ranch in the south metro. Every Autowash location features high-pressure touchless automatic bays with no brushes or cloth, keeping your paint scratch-free. Many locations include free self-serve vacuums and detailing bays.',
  },
  {
    name: 'Super Wash',
    slug: 'super-wash',
    description: 'Super Wash is the largest chain of touchless and self-serve car washes in the United States, with {count} locations across 18 states from Arizona to New York. Every Super Wash location features touchless automatic bays that use high-pressure water and soap — no brushes or cloth — for a safe, scratch-free clean. Many sites are open 24 hours.',
  },
  {
    name: 'Splash Car Wash',
    slug: 'splash-car-wash',
    description: 'Splash Car Wash operates {count} touchless and touch-free car wash locations across Connecticut, New York, and Vermont. Known for consistently high ratings (many locations above 4.8 stars), Splash offers automatic touchless bays with free vacuums, unlimited membership plans, and oil change services at select sites.',
  },
  {
    name: 'Delta Sonic',
    slug: 'delta-sonic',
    description: 'Delta Sonic is a major car wash and fuel chain with {count} locations across Illinois, New York, and Pennsylvania. Every Delta Sonic location offers automatic touchless car wash service, free self-serve vacuums, detailing bays, and unlimited wash membership plans. Many sites include oil change and full-service fuel.',
  },
  {
    name: 'Drive & Shine',
    slug: 'drive-and-shine',
    description: 'Drive & Shine operates {count} highly-rated touchless car wash and oil change centers across Indiana and Michigan. Consistently averaging 4.9 stars with thousands of reviews per location, Drive & Shine is known for their exterior touchless automatic bays, full-service detailing, oil changes, and unlimited membership plans.',
  },
  {
    name: 'Prestige Car Wash',
    slug: 'prestige-car-wash',
    description: 'Prestige Car Wash operates {count} high-end touchless car wash locations across eastern Massachusetts, including Boston, Somerville, Watertown, Quincy, Peabody, Salem, and Cape Cod. Every Prestige location offers automatic touchless bays and consistently earns 4.5+ star ratings with thousands of reviews per site.',
  },
  {
    name: 'Flagstop Car Wash',
    slug: 'flagstop-car-wash',
    description: 'Flagstop Car Wash is a Virginia chain with 10 locations throughout the Richmond metro area. Most Flagstop sites are express tunnel washes, but their North Chesterfield location (6479 Iron Bridge Rd) offers a dedicated touchless automatic bay — the only one of its kind in the chain. Open 24/7 with free vacuums and unlimited wash membership.',
  },
  {
    name: 'Mr. Magic Car Wash',
    slug: 'mr-magic-car-wash',
    description: 'Mr. Magic Car Wash operates {count} touchless car wash locations across the Pittsburgh metro area and West Virginia. Known for their touchless automatic bays, free vacuums, and consistent 4+ star ratings, Mr. Magic is a staple for car owners throughout western Pennsylvania.',
  },
  {
    name: "Zappy's Auto Washes",
    slug: 'zappys-auto-washes',
    description: "Zappy's Auto Washes operates {count} touchless car wash locations across northeast Ohio — from Cleveland\'s eastern suburbs through Lake and Geauga counties. Every Zappy's location offers automatic touchless bays with free self-serve vacuums.",
  },
  {
    name: 'Rocky Mountain Car Wash',
    slug: 'rocky-mountain-car-wash',
    description: 'Rocky Mountain Car Wash operates {count} touchless car wash locations across Montana and Wyoming — from Helena and Belgrade in Montana to Casper, Laramie, Powell, and Riverton in Wyoming. Every location features touchless automatic bays built to handle tough western weather.',
  },
  {
    name: 'Foam & Wash',
    slug: 'foam-and-wash',
    description: 'Foam & Wash operates {count} touchless car wash locations throughout New York\'s Hudson Valley, including Fishkill, Newburgh, Poughkeepsie, Hyde Park, and Vails Gate. Every Foam & Wash site offers automatic touchless bays with free vacuums and unlimited wash plans.',
  },
  {
    name: 'Blue Tide Car Wash',
    slug: 'blue-tide-car-wash',
    description: 'Blue Tide Car Wash operates {count} touchless car wash locations across Sioux Falls, South Dakota. Every Blue Tide site features automatic touchless bays for a safe, scratch-free wash, along with free self-serve vacuums.',
  },
  {
    name: 'Salty Dog Car Wash',
    slug: 'salty-dog-car-wash',
    description: 'Salty Dog Car Wash operates {count} touchless car wash locations along Florida\'s east coast, including Daytona Beach, New Smyrna Beach, DeLand, DeBary, Edgewater, and Holly Hill. Every location offers automatic touchless bays alongside flex-service detailing.',
  },
  {
    name: 'Auto Spa Speedy Wash',
    slug: 'auto-spa-speedy-wash',
    description: 'Auto Spa Speedy Wash operates {count} touchless car wash locations across the greater St. Louis, Missouri metro area — including St. Peters, St. Charles, Wentzville, Troy, Park Hills, and Farmington. Every site features automatic touchless bays and free vacuums.',
  },
  {
    name: 'Hy-Vee',
    slug: 'hy-vee',
    description: 'Hy-Vee grocery and fuel stations offer touchless car washes at {count} locations across Iowa, Illinois, Minnesota, Missouri, and Nebraska. Every Hy-Vee car wash features automatic touchless bays for a safe, scratch-free wash.',
  },
  {
    name: "Terrible's",
    slug: 'terribles',
    description: "Terrible's (Terrible Herbst) operates {count} touchless car wash locations across Nevada, California, and Arizona. Best known in the Las Vegas area, Terrible's offers automatic touchless bays alongside full-service fuel and convenience stores.",
  },
  {
    name: 'Dirtbuster Car Wash',
    slug: 'dirtbuster-car-wash',
    description: 'Dirtbuster Car Wash operates {count} touchless car wash locations across southern Illinois and Indiana — including Mt. Vernon, Paris, Charleston, Linton, Frankfort, Washington, and Sullivan. Every Dirtbuster site offers automatic touchless bays.',
  },
  {
    name: 'ProClean Auto Wash',
    slug: 'proclean-auto-wash',
    description: 'ProClean Auto Wash operates {count} touchless car wash locations across the Denver metro area in Colorado — including Aurora, Thornton, Arvada, Edgewater, and Federal Heights. Every ProClean site features automatic touchless bays for a safe, brushless wash.',
  },
  {
    name: 'Power Wash USA',
    slug: 'power-wash-usa',
    description: 'Power Wash USA operates {count} touchless car wash locations across Iowa and Nebraska — including Sioux City, South Sioux City, Blair, Denison, and Sergeant Bluff. Every Power Wash USA site offers automatic touchless bays and self-serve detailing.',
  },
  {
    name: 'IQ Car Wash',
    slug: 'iq-car-wash',
    description: 'IQ Car Wash operates {count} touchless car wash locations across Oklahoma, Texas, Kansas, and Georgia. Every IQ location features automatic touchless bays with high-pressure water jets for a safe, scratch-free wash.',
  },
  {
    name: 'Royal Rinse Car Wash',
    slug: 'royal-rinse-car-wash',
    description: 'Royal Rinse Car Wash operates {count} touchless car wash locations across North Carolina, South Carolina, and Virginia — from Goldsboro and Kannapolis up to Williamsburg and Harrisonburg. Every Royal Rinse site features automatic touchless bays.',
  },
  {
    name: "Splash'n Shine",
    slug: 'splash-n-shine',
    description: "Splash'n Shine Car Wash operates {count} automatic touchless car wash locations across the Phoenix metro area in Arizona — including Gilbert, Chandler, Phoenix, and Gold Canyon. Every location features touchless automatic bays alongside self-serve bays and free vacuums, with 24/7 access.",
  },
  {
    name: 'Wooly Wash',
    slug: 'wooly-wash',
    description: 'Wooly Wash operates {count} touchless car wash locations across southern Illinois — including Carbondale, Marion, Mt. Vernon, Benton, Harrisburg, Carterville, West Frankfort, Carmi, and Du Quoin. Every Wooly Wash site offers automatic touchless bays for a safe, scratch-free wash.',
  },
  {
    name: 'Jurassic Car Wash',
    slug: 'jurassic-car-wash',
    description: 'Jurassic Car Wash operates {count} automatic touchless car wash locations in Texas — with sites in Austin, Cedar Park, and San Antonio. Open 24/7, every Jurassic location features touchless automatic bays, oversized self-serve bays, and free vacuums.',
  },
  {
    name: 'Cascade Car Wash',
    slug: 'cascade-car-wash',
    description: 'Cascade Car Wash operates {count} automatic touchless car wash locations across the Dayton and Cincinnati, Ohio metro areas — including Kettering, Englewood, Springboro, Monroe, and Fairfield. Every Cascade location features touchless automatic bays where only water and cleaning agents touch your vehicle, with hours typically 5:30 AM to 11:00 PM daily.',
  },
  {
    name: 'ScrubaDub',
    slug: 'scrubadub',
    description: 'ScrubaDub is a New England car wash chain with {count} locations that offer dedicated touchless (laser wash) bays across Massachusetts, New Hampshire, and Rhode Island. While most ScrubaDub locations are tunnel washes, select sites also operate touchless in-bay automatic systems — those are what we list here.',
  },
  {
    name: "Johnny's Markets",
    slug: 'johnnys-markets',
    description: "Johnny's Markets is a Michigan convenience-store and fuel chain with {count} touchless car wash locations across the state — from Grand Rapids, Kalamazoo, and Kentwood to Battle Creek, Niles, and Big Rapids. Each location features an automatic touch-free (brushless) wash bay, and several sites also offer self-serve bays alongside fuel and convenience services.",
  },
  {
    name: 'Wash Me!',
    slug: 'wash-me',
    description: 'Wash Me! Car Wash is a northern-Colorado chain with {count} automatic touchless (touch-free) car wash locations across Loveland, Longmont, Greeley, and Evans. Their brushless, scratch-free bays consistently earn high Touchless Satisfaction Scores from local drivers.',
  },
  {
    name: "Kelley's Market",
    slug: 'kelleys-market',
    description: "Kelley's Market is a Midwest convenience-store and fuel chain with {count} touchless car wash locations across Illinois and Wisconsin. Each site offers a brushless, touch-free automatic wash alongside fuel and convenience services.",
  },
  {
    name: 'BellStores',
    slug: 'bellstores',
    description: 'BellStores is an Ohio convenience-store chain offering Touch Free automatic car washes at {count} locations across the state. Their touchless bays deliver a brushless, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'Super Suds Auto Spa',
    slug: 'super-suds-auto-spa',
    description: 'Super Suds Auto Spa operates {count} touchless car wash locations across Ohio, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Precision Wash',
    slug: 'precision-wash',
    description: 'Precision Wash is a New York car wash chain with {count} touchless automatic locations, offering brushless, touch-free washing across the state.',
  },
  {
    name: 'Hoffman Car Wash',
    slug: 'hoffman-car-wash',
    description: "Hoffman Car Wash is a long-running New York Capital Region car wash chain with {count} locations offering touchless automatic bays. Best known for its full-service and express tunnels, Hoffman also operates touch-free brushless washing at these sites.",
  },
  {
    name: 'Mr Sparkle Car Wash',
    slug: 'mr-sparkle-car-wash',
    description: 'Mr Sparkle Car Wash is a Connecticut chain with {count} touchless automatic car wash locations, offering brushless, touch-free washing across the state.',
  },
  {
    name: 'Spritz Car Wash',
    slug: 'spritz-car-wash',
    description: 'Spritz Car Wash operates {count} touchless car wash locations in New York, featuring automatic touch-free (brushless) bays for a scratch-free clean.',
  },
  {
    name: "CC's Touchless Car Wash",
    slug: 'ccs-touchless-car-wash',
    description: "CC's Touchless Car Wash is a touch-free car wash brand with {count} automatic touchless locations across New Jersey and Pennsylvania — touchless washing is right in the name.",
  },
  {
    name: 'Executive Laser Wash',
    slug: 'executive-laser-wash',
    description: 'Executive Laser Wash operates {count} touchless laser-wash locations across Iowa, using automatic touch-free (brushless) LaserWash systems for a scratch-free clean.',
  },
  {
    name: 'Clean Getaway',
    slug: 'clean-getaway',
    description: 'Clean Getaway Car Wash is a Tennessee-based chain with {count} touchless automatic car wash locations, offering brushless, touch-free washing primarily across Middle Tennessee.',
  },
  {
    name: 'Chevron',
    slug: 'chevron',
    description: 'Select Chevron gas stations offer touchless car washes at {count} locations, concentrated in California and Florida with additional sites in Oregon, Nevada, and Washington. These touch-free automatic bays provide a quick brushless wash alongside fuel.',
  },
  {
    name: 'Shell',
    slug: 'shell',
    description: 'Select Shell gas stations operate touchless car washes at {count} locations nationwide — from California and the Midwest to the Southeast — offering a brushless, touch-free automatic wash alongside fuel.',
  },
  {
    name: 'Mobil',
    slug: 'mobil',
    description: 'Select Mobil gas stations offer touchless car washes at {count} locations across the country, including California, the Northeast, and Florida. These touch-free automatic bays provide a quick brushless wash.',
  },
  {
    name: 'Marathon',
    slug: 'marathon',
    description: 'Select Marathon gas stations offer touchless car washes at {count} locations nationwide, led by Florida. Their touch-free automatic bays deliver a brushless, scratch-free wash alongside fuel.',
  },
  {
    name: 'Castle Wash',
    slug: 'castle-wash',
    description: 'Castle Wash operates {count} touchless car wash locations across Tennessee, pairing automatic touch-free (brushless) bays with express tunnel and self-service options for a safe, scratch-free wash.',
  },
  {
    name: 'Coastal Carolina Car Wash',
    slug: 'coastal-carolina-car-wash',
    description: 'Coastal Carolina Car Wash operates {count} touchless car wash locations in the Carolinas, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'United Auto Wash',
    slug: 'united-auto-wash',
    description: 'United Auto Wash operates {count} touchless car wash locations across Ohio, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Blue Falls Car Wash',
    slug: 'blue-falls-car-wash',
    description: 'Blue Falls Car Wash operates {count} touchless car wash locations with automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Soaps N Suds',
    slug: 'soaps-n-suds',
    description: 'Soaps N Suds operates {count} touchless car wash locations across Virginia, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Gorilla Car Wash',
    slug: 'gorilla-car-wash',
    description: 'Gorilla Car Wash operates {count} touchless car wash locations in Texas, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Super Klean Car Wash',
    slug: 'super-klean-car-wash',
    description: 'Super Klean Car Wash operates {count} touchless car wash locations with automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Village Car Wash',
    slug: 'village-car-wash',
    description: 'Village Car Wash operates {count} touchless car wash locations across Kansas and Missouri, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Posh Wash',
    slug: 'posh-wash',
    description: 'Posh Wash operates {count} touchless car wash locations across Massachusetts and Rhode Island, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Soft Touch Auto Wash',
    slug: 'soft-touch-auto-wash',
    description: 'Soft Touch Auto Wash operates {count} touchless car wash locations in Massachusetts, featuring automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Hometown Car Wash',
    slug: 'hometown-car-wash',
    description: 'Hometown Car Wash operates {count} touchless car wash locations with automatic touch-free (brushless) bays for a safe, scratch-free wash.',
  },
  {
    name: 'Exxon',
    slug: 'exxon',
    description: 'Exxon-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'Sunoco',
    slug: 'sunoco',
    description: 'Sunoco-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: '76',
    slug: '76',
    description: '76-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'Speedway',
    slug: 'speedway',
    description: 'Speedway offers Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'Phillips 66',
    slug: 'phillips-66',
    description: 'Phillips 66-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'Valero',
    slug: 'valero',
    description: 'Valero-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: 'ARCO',
    slug: 'arco',
    description: 'ARCO-branded fuel stations offer Touch Free touchless car washes at {count} locations, with brushless automatic bays for a safe, scratch-free wash alongside fuel and convenience services.',
  },
  {
    name: "Haffner's",
    slug: 'haffners',
    description: "Haffner's operates {count} touchless car wash locations across Massachusetts, New Hampshire, and Maine, with automatic touch-free (brushless) bays for a safe, scratch-free wash alongside fuel and convenience services.",
  },
  {
    name: 'Clean2o',
    slug: 'clean2o',
    description: "Clean2o operates {count} touch-free automatic car wash locations across New York's Capital Region, with brushless bays and unlimited wash-club plans for a safe, scratch-free wash.",
  },
  {
    name: 'Delta Sonic',
    slug: 'delta-sonic',
    description: 'Delta Sonic operates {count} car wash locations across New York, Illinois, and Pennsylvania that offer a Basic Touch-Less automatic wash — brush-free and paint-safe — alongside their soft-cloth tunnel and full-service options, with unlimited wash-club plans.',
  },
];

const bySlug = new Map(CHAINS.map(c => [c.slug, c]));
const byName = new Map(CHAINS.map(c => [c.name, c]));

export function getChainBySlug(slug: string): Chain | undefined {
  return bySlug.get(slug);
}

export function getChainByName(name: string): Chain | undefined {
  return byName.get(name);
}

/**
 * Renders a chain description, replacing {count} with the actual touchless
 * location count. If count is 0 or undefined, falls back to a neutral phrase.
 */
export function renderChainDescription(description: string, count: number): string {
  if (!count || count <= 0) {
    return description.replace(/\{count\}/g, 'multiple');
  }
  return description.replace(/\{count\}/g, String(count));
}
