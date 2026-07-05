import { cache } from 'react';
import { publicListings } from '@/lib/public-listings';

export type LaserwashLocation = {
  name: string;
  city: string;
  state: string;
  slug: string;
  touchless_satisfaction_score: number | null;
};

/**
 * "LaserWash locations" = PDQ-branded (PDQ's touchless product line IS LaserWash)
 * AND touchless-verified. We deliberately ignore equipment_model (360 / 360 Plus /
 * 4000): that field isn't reliably assigned and carries no consumer-search value —
 * drivers search "laserwash", not "laserwash 360 plus". PDQ's friction systems
 * (ProTouch/Tandem) are excluded automatically because they aren't is_touchless.
 *
 * Shared source of truth for the /laser-car-wash hub (and any future per-state
 * laser pages / sitemap entries) — keep page and sitemap in lockstep off this.
 */
export const getLaserwashLocations = cache(async (): Promise<LaserwashLocation[]> => {
  const all: LaserwashLocation[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await publicListings('name, city, state, slug, touchless_satisfaction_score')
      .eq('equipment_brand', 'pdq')
      .order('id')
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    all.push(...(data as LaserwashLocation[]));
    if (data.length < 1000) break;
  }
  // Guard against any null slug (would produce a broken internal link).
  return all.filter((l) => !!l.slug && !!l.city && !!l.state);
});
