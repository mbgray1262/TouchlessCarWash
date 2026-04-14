/**
 * Touchless car wash chain definitions.
 *
 * Keys match the `parent_chain` field on listings.
 * Used by /chains hub and /chain/[slug] pages.
 */

export interface Chain {
  name: string;       // exact match to parent_chain in DB
  slug: string;       // URL slug
  description: string; // SEO description for the chain page
}

export const CHAINS: Chain[] = [
  {
    name: 'Power Market',
    slug: 'power-market',
    description: 'Power Market operates touchless car washes at gas station locations across California, Oregon, and Nevada. Part of the H&S Energy Group, all Power Market car washes use Istobal touchless equipment for a safe, scratch-free wash.',
  },
  {
    name: 'Holiday Stationstores',
    slug: 'holiday-stationstores',
    description: 'Holiday Stationstores, now part of the Circle K family, offers Touch Free car washes at select gas station locations across the upper Midwest. Their touchless bays provide a convenient, brushless wash alongside fuel and convenience store services.',
  },
  {
    name: 'Extra Mile',
    slug: 'extra-mile',
    description: 'Extra Mile is Chevron\'s convenience store brand, with select locations offering touchless car washes operated by H&S Energy Group. Found primarily in California, these locations feature Istobal touchless equipment.',
  },
  {
    name: 'Pinnacle 365',
    slug: 'pinnacle-365',
    description: 'Pinnacle 365 is an H&S Energy Group convenience store brand with touchless car washes in California and Oregon. Like their sister brand Power Market, all Pinnacle 365 car washes use Istobal touchless technology.',
  },
  {
    name: 'Kwik Trip',
    slug: 'kwik-trip',
    description: 'Kwik Trip is a Midwest convenience store chain offering touchless car washes at select Wisconsin locations. Known for their clean facilities and competitive pricing, Kwik Trip touchless washes are a popular choice for local drivers.',
  },
  {
    name: 'BP',
    slug: 'bp',
    description: 'Select BP gas station locations offer touchless car washes, providing a quick and convenient brushless wash alongside fuel. BP touchless car washes can be found across multiple states.',
  },
  {
    name: 'Elephant Car Wash',
    slug: 'elephant-car-wash',
    description: 'Elephant Car Wash is a well-known car wash chain in the Pacific Northwest and Arizona. Many of their locations offer touchless automatic bays alongside self-serve options, with several sites operating 24 hours a day.',
  },
  {
    name: 'Brown Bear',
    slug: 'brown-bear',
    description: 'Brown Bear Car Wash is a Washington state institution, operating touchless car wash locations across the Puget Sound area and Spokane. Their touchless bays offer a safe, scratch-free clean with self-serve vacuum stations.',
  },
  {
    name: 'Gorilla Wash',
    slug: 'gorilla-wash',
    description: 'Gorilla Wash operates touchless car wash locations across Iowa, Nebraska, Missouri, and Texas. Their touch-less automatic bays provide a gentle, brushless clean, with many locations tied in with Kum & Go convenience stores.',
  },
  {
    name: 'Sheetz',
    slug: 'sheetz',
    description: 'Sheetz is a major convenience store chain in the Mid-Atlantic and Midwest, with touchless car washes at many of their locations across Pennsylvania, Ohio, North Carolina, Maryland, Virginia, and West Virginia. Their automated touchless bays offer a quick, scratch-free wash alongside fuel and made-to-order food.',
  },
  {
    name: 'Autowash',
    slug: 'autowash',
    description: 'Autowash operates 25 automatic touchless car wash locations across Colorado — from Fort Collins and Loveland up north to Denver, Littleton, and Highlands Ranch in the south metro. Every Autowash location features high-pressure touchless automatic bays with no brushes or cloth, keeping your paint scratch-free. Many locations include free self-serve vacuums and detailing bays.',
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
