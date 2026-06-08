import { CHAINS } from '@/lib/chains';

// Single source of truth for "does this listing qualify for the unlimited /
// 24-hour state hub pages". Imported by BOTH the page components
// (app/unlimited-touchless-car-wash/[state], app/24-hour-touchless-car-wash/[state])
// AND the sitemap generator, so the per-page notFound() threshold and the
// sitemap's emitted URLs can never drift out of lockstep.

export const UNLIMITED_CHAIN_SLUGS = new Set([
  'sheetz', 'delta-sonic', 'drive-and-shine', 'kwik-trip', 'splash-car-wash',
  'prestige-car-wash', 'flagstop-car-wash', 'foam-and-wash', 'mr-magic-car-wash',
  'autowash', 'super-wash', 'brown-bear', 'holiday-stationstores', 'salty-dog-car-wash',
  'power-market', 'extra-mile', 'pinnacle-365',
]);

const UNLIMITED_CHAIN_NAMES = new Set(
  CHAINS.filter((c) => UNLIMITED_CHAIN_SLUGS.has(c.slug)).map((c) => c.name),
);

const SUB_AMENITY_TERMS = ['subscription', 'membership', 'unlimited', 'monthly'];

/** True if a listing offers an unlimited/subscription wash plan. */
export function hasSubscription(listing: {
  parent_chain?: string | null;
  amenities?: string[] | null;
}): boolean {
  if (listing.parent_chain && UNLIMITED_CHAIN_NAMES.has(listing.parent_chain)) return true;
  const ams = (listing.amenities ?? []).join(' ').toLowerCase();
  return SUB_AMENITY_TERMS.some((t) => ams.includes(t));
}

/** True if a listing is open 24 hours every day it lists hours for. */
export function is24h(hours: Record<string, unknown> | null | undefined): boolean {
  if (!hours) return false;
  const vals = Object.values(hours);
  const nonEmpty = vals.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return nonEmpty.length > 0 && nonEmpty.every((v) => v.toLowerCase().includes('open 24 hours'));
}
