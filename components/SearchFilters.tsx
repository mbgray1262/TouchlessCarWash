'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, Clock, Wind, RefreshCw, Hand, Truck, IdCard, Car } from 'lucide-react';

interface Filter {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
}

interface SearchFiltersProps {
  filters: Filter[];
  activeFilterSlugs: string[];
  currentQuery: string;
  lat?: number | null;
  lng?: number | null;
  /** When provided, builds filter URLs relative to this path (e.g. /state/massachusetts) instead of /search */
  baseHref?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  sparkles: Sparkles,
  clock: Clock,
  wind: Wind,
  'refresh-cw': RefreshCw,
  hand: Hand,
  truck: Truck,
  'id-card': IdCard,
  car: Car,
};

/** Wash-type filter slugs — rendered first, in this order */
const WASH_TYPE_SLUGS = ['touchless-automatic', 'self-serve-bays'];
const WASH_TYPE_SET = new Set(WASH_TYPE_SLUGS);

function buildFilterUrl(
  filterSlugs: string[],
  baseHref?: string,
  query?: string,
  lat?: number | null,
  lng?: number | null,
): string {
  if (baseHref) {
    // State/city page mode — just append filters param
    if (filterSlugs.length > 0) {
      return `${baseHref}?filters=${filterSlugs.join(',')}`;
    }
    return baseHref;
  }
  // Search page mode — include q, lat, lng
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  if (filterSlugs.length > 0) params.set('filters', filterSlugs.join(','));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export function SearchFilters({ filters, activeFilterSlugs, currentQuery, lat, lng, baseHref }: SearchFiltersProps) {
  const router = useRouter();
  const activeSet = new Set(activeFilterSlugs);

  function toggleFilter(slug: string) {
    const next = new Set(activeSet);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    router.push(buildFilterUrl(Array.from(next), baseHref, currentQuery, lat, lng), { scroll: false });
  }

  function clearFilters() {
    router.push(buildFilterUrl([], baseHref, currentQuery, lat, lng), { scroll: false });
  }

  if (filters.length === 0) return null;

  // Split into wash types (ordered) and amenities (original order)
  const washTypes = WASH_TYPE_SLUGS
    .map(slug => filters.find(f => f.slug === slug))
    .filter((f): f is Filter => f != null);
  const amenities = filters.filter(f => !WASH_TYPE_SET.has(f.slug));

  function renderChip(f: Filter) {
    const Icon = ICON_MAP[f.icon ?? ''] ?? Sparkles;
    const active = activeSet.has(f.slug);
    const isWashType = WASH_TYPE_SET.has(f.slug);
    return (
      <button
        key={f.id}
        onClick={() => toggleFilter(f.slug)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
          active
            ? 'bg-[#0F2744] border-[#0F2744] text-white'
            : isWashType
              ? 'bg-blue-50 border-blue-200 text-[#0F2744] hover:border-[#0F2744] hover:bg-blue-100'
              : 'bg-white border-gray-200 text-gray-700 hover:border-[#0F2744] hover:text-[#0F2744]'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {f.name}
      </button>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        {washTypes.map(renderChip)}
        {washTypes.length > 0 && amenities.length > 0 && (
          <div className="w-px h-6 bg-gray-200 mx-1" />
        )}
        {amenities.map(renderChip)}
      </div>
      {activeSet.size > 0 && (
        <button
          onClick={clearFilters}
          className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
