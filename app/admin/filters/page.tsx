'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Clock, Wind, RefreshCw, Hand, Truck, IdCard, Car, ChevronRight, RefreshCcw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AdminNav } from '@/components/AdminNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FilterCount {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
  sort_order: number;
  count: number;
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


function FilterRow({ filter, total }: { filter: FilterCount; total: number }) {
  const Icon = ICON_MAP[filter.icon ?? ''] ?? Sparkles;
  const pct = total > 0 ? Math.round((filter.count / total) * 100) : 0;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors last:border-0">
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gray-100 rounded-lg">
            <Icon className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <p className="font-medium text-[#0F2744] text-sm">{filter.name}</p>
            <p className="text-xs text-gray-400 font-mono">{filter.slug}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-[120px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#0F2744] h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums text-[#0F2744] w-16 text-right">
            {filter.count.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">
            {pct}%
          </span>
        </div>
      </td>
    </tr>
  );
}

export default function FiltersPage() {
  const [filters, setFilters] = useState<FilterCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFilters = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const { data: filterRows } = await supabase
        .from('filters')
        .select('id, name, slug, category, icon, sort_order')
        .order('sort_order');

      if (!filterRows) return;

      const counts = await Promise.all(
        filterRows.map(async f => {
          const { count } = await supabase
            .from('listing_filters')
            .select('listing_id, listings!inner(is_touchless)', { count: 'exact', head: true })
            .eq('filter_id', f.id)
            .eq('listings.is_touchless', true);
          return { ...f, count: count ?? 0 };
        })
      );

      setFilters(counts);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadFilters(false); }, [loadFilters]);

  const total = filters.reduce((sum, f) => sum + f.count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="container mx-auto px-4 max-w-7xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Filters</span>
        </div>

        <div className="flex items-start justify-between mt-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#0F2744] mb-1">Search Filters</h1>
            <p className="text-gray-500">Filter definitions and listing counts for the public search UI.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadFilters(false)}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Refreshing</>
              : <><RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Refresh Counts</>
            }
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-2">
              {filters.map(f => {
                const Icon = ICON_MAP[f.icon ?? ''] ?? Sparkles;
                return (
                  <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-gray-500" />
                      <p className="text-xs font-medium text-gray-600 truncate">{f.name}</p>
                    </div>
                    <p className="text-2xl font-bold text-[#0F2744] tabular-nums">{f.count.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-0.5">listings</p>
                  </div>
                );
              })}
            </div>

            {filters.length > 0 && (
              <Card>
                <CardHeader className="pb-2 border-b border-gray-100">
                  <CardTitle className="text-sm font-semibold text-[#0F2744]">Filters</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Filter</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Listings (touchless only)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filters.map(f => (
                        <FilterRow key={f.id} filter={f} total={total} />
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            <Card className="border-gray-200">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  <span className="font-semibold text-gray-700">How filters are populated:</span>{' '}
                  <span className="font-medium">Open 24 Hours</span> is derived from the hours JSON.{' '}
                  <span className="font-medium">Free Vacuum</span> and <span className="font-medium">Unlimited Wash Club</span> come from Google About data.{' '}
                  <span className="font-medium">Membership</span> and <span className="font-medium">Undercarriage Cleaning</span> are matched from the amenities array (case-insensitive).{' '}
                  <span className="font-medium">Self-Serve Bays</span> and <span className="font-medium">RV / Oversized</span> will be populated as the Firecrawl pipeline runs.{' '}
                  All counts reflect touchless-only listings (<code className="bg-gray-100 px-1 rounded">is_touchless = true</code>).
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
