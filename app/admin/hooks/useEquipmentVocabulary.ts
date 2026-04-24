'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EQUIPMENT_BRANDS, EQUIPMENT_MODELS } from '../hero-review/types';

/**
 * Discovers custom equipment brands and models that admins have typed via the
 * "Other…" / free-text path, so they appear as canonical options in every
 * equipment dropdown across the admin UI (photo-audit, fast curation, hero
 * review). Merges the hardcoded vocabulary in `hero-review/types.ts` with
 * whatever distinct values currently live in the `listings` table.
 *
 * Paginates past Supabase's default 1000-row `.select()` cap — the listings
 * table has ~3.3k equipment-tagged rows, so a single un-paginated query would
 * silently drop most custom entries.
 */
export function useEquipmentVocabulary() {
  const [customBrands, setCustomBrands] = useState<{ value: string; label: string }[]>([]);
  const [customModels, setCustomModels] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const all: { equipment_brand: string | null; equipment_model: string | null }[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('listings')
        .select('equipment_brand, equipment_model')
        .not('equipment_brand', 'is', null)
        .neq('equipment_brand', '__other__')
        .range(offset, offset + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    // Brand-level dedupe: case-insensitive slug matching. "PDQ" in the DB
    // should collapse onto the canonical "pdq" slug, not show as a duplicate.
    const knownBrandLowers = new Set<string>(EQUIPMENT_BRANDS.map(b => b.value.toLowerCase()));
    const seenBrandLowers = new Set<string>();
    const novelBrands: { value: string; label: string }[] = [];
    for (const row of all) {
      const b = row.equipment_brand;
      if (!b) continue;
      const bl = b.toLowerCase();
      if (knownBrandLowers.has(bl) || seenBrandLowers.has(bl)) continue;
      seenBrandLowers.add(bl);
      const label = b.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      novelBrands.push({ value: b, label });
    }
    novelBrands.sort((a, b) => a.label.localeCompare(b.label));

    // Model-level dedupe: case-insensitive so "laserwash 360" in raw DB data
    // collapses onto the canonical "LaserWash 360" instead of both appearing
    // as separate dropdown options. Also dedupe case-variants within the
    // novel list itself (e.g. two listings that typed "Double Barrel" and
    // "double barrel" shouldn't produce two "Other" dropdown rows).
    const byBrand: Record<string, Map<string, string>> = {};
    for (const row of all) {
      const b = row.equipment_brand;
      const m = row.equipment_model;
      if (!b || !m || m === '__other__') continue;
      if (!byBrand[b]) byBrand[b] = new Map();
      const key = m.toLowerCase();
      if (!byBrand[b].has(key)) byBrand[b].set(key, m);
    }
    const extras: Record<string, string[]> = {};
    for (const [brand, modelMap] of Object.entries(byBrand)) {
      const hardcodedLowers = new Set((EQUIPMENT_MODELS[brand] ?? []).map(m => m.toLowerCase()));
      const novel = Array.from(modelMap.entries())
        .filter(([key]) => !hardcodedLowers.has(key))
        .map(([, label]) => label)
        .sort();
      if (novel.length > 0) extras[brand] = novel;
    }

    setCustomBrands(novelBrands);
    setCustomModels(extras);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Merged model list for a brand: hardcoded defaults + custom DB entries. */
  const getModelsForBrand = useCallback((brand: string): string[] => {
    const hardcoded = EQUIPMENT_MODELS[brand] ?? [];
    const custom = customModels[brand] ?? [];
    return [...hardcoded, ...custom];
  }, [customModels]);

  return { customBrands, customModels, getModelsForBrand, reload: load };
}
