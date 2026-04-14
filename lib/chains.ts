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
    description: 'Flagstop Car Wash is Virginia\'s premier touchless car wash chain, with {count} locations throughout the Richmond and Henrico metro areas. Every Flagstop site averages 4.8–4.9 stars with thousands of reviews, offering automatic touchless bays, unlimited membership, and free vacuums.',
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
