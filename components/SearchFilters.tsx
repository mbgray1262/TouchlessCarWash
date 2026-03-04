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

function buildSearchUrl(query: string, filterSlugs: string[]): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (filterSlugs.length > 0) params.set('filters', filterSlugs.join(','));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ''}`;
}

export function SearchFilters({ filters, activeFilterSlugs, currentQuery }: SearchFiltersProps) {
  const router = useRouter();
  const activeSet = new Set(activeFilterSlugs);

  function toggleFilter(slug: string) {
    const next = new Set(activeSet);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    router.push(buildSearchUrl(currentQuery, Array.from(next)), { scroll: false });
  }

  function clearFilters() {
    router.push(buildSearchUrl(currentQuery, []), { scroll: false });
  }

  if (filters.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex flex-wrap gap-2">
        {filters.map(f => {
          const Icon = ICON_MAP[f.icon ?? ''] ?? Sparkles;
          const active = activeSet.has(f.slug);
          return (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.slug)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                active
                  ? 'bg-[#0F2744] border-[#0F2744] text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-[#0F2744] hover:text-[#0F2744]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.name}
            </button>
          );
        })}
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
