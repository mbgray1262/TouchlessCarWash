import { cache } from 'react';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { US_STATES, slugify } from '@/lib/constants';

// Shared slug→state / slug→city / in-city-listings resolvers used by BOTH the
// city page (app/state/[state]/[city]) and the per-city feature pages
// (app/state/[state]/[city]/feature/[feature]). Keeping them in one place
// guarantees the feature-filter chips a city page renders stay in lockstep with
// the 200/404 decision the feature page makes — otherwise the city page links to
// feature pages that 404 (the slug→code bug that produced soft-404s in GSC).

/** Resolve a state URL slug (e.g. "ohio") to its 2-letter code ("OH"). */
export function getStateCodeFromSlug(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

/**
 * Resolve a URL slug back to the actual city name stored in the database.
 * slugify() is lossy (e.g. "St. Petersburg" → "st-petersburg"), so we can't
 * reverse it by capitalizing — we candidate-match via a case-insensitive ilike
 * on the first slug token, then slug-compare each candidate server-side.
 * Intentionally does NOT filter on is_touchless so cities whose only listings
 * were reverted still resolve.
 */
export const resolveCityName = cache(
  async (stateCode: string, citySlug: string): Promise<string | null> => {
    const firstToken = citySlug.split('-')[0];
    const { data } = await supabase
      .from('listings')
      .select('city')
      .eq('state', stateCode)
      .ilike('city', `${firstToken}%`)
      .limit(1000);
    if (!data) return null;

    const seen = new Set<string>();
    for (const row of data) {
      if (seen.has(row.city)) continue;
      seen.add(row.city);
      if (slugify(row.city) === citySlug) return row.city;
    }
    return null;
  },
);

/**
 * All touchless listings in a city (in-city only, no nearby augmentation),
 * fetched with the same filters the city page uses so feature-chip counts and
 * feature-page gate counts match exactly. latitude/longitude are included to
 * match the city page's select shape.
 */
export const getCityTouchlessListings = cache(
  async (stateCode: string, cityName: string): Promise<Listing[]> => {
    const { data, error } = await supabase
      .from('listings')
      .select(`${LISTING_CARD_COLUMNS}, latitude, longitude`)
      .eq('is_touchless', true)
      .eq('state', stateCode)
      .ilike('city', cityName)
      .order('rating', { ascending: false });
    if (error || !data) return [];
    return data as Listing[];
  },
);
