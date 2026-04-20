/**
 * Helpers for soft-404 redirects: when a requested listing or city has no
 * approved touchless listings left, find the geographically closest city
 * that does and redirect users there instead of 404ing. Preserves PageRank
 * and keeps searchers inside the directory instead of bouncing back to SERPs.
 */
import { supabase } from './supabase';
import { slugify, getStateSlug } from './constants';
import { haversineDistance } from './metro-areas';

type Coord = { lat: number; lng: number };

/**
 * Find any one listing in a given city (regardless of is_touchless /
 * is_approved) and return its coordinates. Used when the requested URL's
 * city is empty of approved listings but we still want a geographic anchor
 * to find the nearest live alternative.
 */
export async function getAnyCityCoords(stateCode: string, citySlug: string): Promise<Coord | null> {
  // Slug → probable city name. "bay-city" → "bay city". Case-insensitive ilike match.
  const cityGuess = citySlug.replace(/-/g, ' ');
  const { data } = await supabase
    .from('listings')
    .select('latitude, longitude, city')
    .eq('state', stateCode)
    .ilike('city', cityGuess)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(1);
  if (data && data[0] && data[0].latitude != null && data[0].longitude != null) {
    return { lat: Number(data[0].latitude), lng: Number(data[0].longitude) };
  }
  return null;
}

/**
 * Given a coordinate, return the URL path for the city page containing the
 * geographically closest approved+touchless listing. Prefers same state
 * (keeps the search local), then allows cross-state. Returns null if no
 * approved touchless listing has coordinates anywhere — the caller should
 * fall back to the state/home page.
 */
export async function findNearestTouchlessCityPath(
  origin: Coord,
  preferState: string | null,
): Promise<string | null> {
  // Pull a bounded set of approved touchless listings with coords, preferring
  // same-state first. A broad state-level query is cheap; a nationwide one
  // would be too wide to return in-memory, so we accept two round-trips.
  const columns = 'latitude, longitude, city, state';

  const runQuery = async (stateFilter: string | null) => {
    let q = supabase
      .from('listings')
      .select(columns)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    if (stateFilter) q = q.eq('state', stateFilter);
    // Cap the candidate set — nearest-neighbour is O(N), not worth pulling >2k rows
    const { data } = await q.limit(2000);
    return data ?? [];
  };

  let candidates = preferState ? await runQuery(preferState) : [];
  if (candidates.length === 0) candidates = await runQuery(null);
  if (candidates.length === 0) return null;

  let best: { city: string; state: string; dist: number } | null = null;
  for (const c of candidates) {
    if (c.latitude == null || c.longitude == null) continue;
    const d = haversineDistance(origin.lat, origin.lng, Number(c.latitude), Number(c.longitude));
    if (!best || d < best.dist) best = { city: c.city, state: c.state, dist: d };
  }
  if (!best) return null;
  return `/state/${getStateSlug(best.state)}/${slugify(best.city)}`;
}
