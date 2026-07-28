import { revalidateTag, revalidatePath } from 'next/cache';
import { US_STATES, slugify } from '@/lib/constants';

/**
 * Cache-invalidation for a single listing after a VISIBILITY edit
 * (is_touchless / is_approved / is_self_service). This is the fix for the
 * "reverted listing keeps serving a stale live 200" bug.
 *
 * Root cause it addresses: getListing() in the listing detail route reads the
 * `listings` row via a Next-tagged fetch (see app/.../listing-data.ts). Next
 * caches that fetch in its Data Cache for the route's 1h ISR window. On ISR
 * regeneration the page re-reads the CACHED is_touchless=true and re-renders a
 * 200 "Touchless Verified" page — even after an admin reverted the row in the
 * DB. revalidatePath() alone busts the rendered route cache but NOT the fetch
 * Data Cache on Netlify, so the regen keeps reading stale. revalidateTag() on
 * the per-listing tag is what actually evicts that Data Cache entry.
 *
 * getListing tags its read `listing:<slug>`; call revalidateListing() (or the
 * lower-level helpers) from any route handler / server action that changes a
 * listing's visibility so the public page flips to a 308 within seconds.
 */

export function listingTag(slug: string): string {
  return `listing:${slug}`;
}

export function listingPath(row: { slug: string; city: string; state: string }): string {
  const stateSlug = slugify(US_STATES.find((s) => s.code === row.state)?.name ?? row.state);
  return `/state/${stateSlug}/${slugify(row.city)}/${row.slug}`;
}

/**
 * Bust the Next Data Cache entry + rendered route cache for ONE listing.
 * Does NOT purge the Netlify CDN — call purgeNetlifyCdn() once after a batch
 * (purgeCache clears the whole site edge cache, so one call covers everything).
 * Returns the canonical listing path.
 */
export function revalidateListingCaches(row: { slug: string; city: string; state: string }): string {
  const path = listingPath(row);
  // revalidateTag is the load-bearing call: it evicts the tagged getListing
  // fetch from the Data Cache so the next regeneration reads fresh flags.
  try { revalidateTag(listingTag(row.slug)); } catch { /* not in a request scope */ }
  try { revalidatePath(path); } catch { /* not in a request scope */ }
  return path;
}

/** Purge the Netlify durable CDN edge cache (whole site). Best-effort. */
export async function purgeNetlifyCdn(): Promise<boolean> {
  try {
    const { purgeCache } = await import('@netlify/functions');
    await purgeCache();
    return true;
  } catch {
    // Not on Netlify (local dev) or purge failed — Data Cache + route cache
    // invalidation above still applies.
    return false;
  }
}

/**
 * Full single-listing invalidation: Data Cache tag + route cache + Netlify CDN.
 * Use from admin route handlers that revert/restore one listing.
 */
export async function revalidateListing(row: { slug: string; city: string; state: string }): Promise<string> {
  const path = revalidateListingCaches(row);
  await purgeNetlifyCdn();
  return path;
}
