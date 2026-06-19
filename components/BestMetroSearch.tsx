'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { MapPin, ChevronRight, Search } from 'lucide-react';
import type { MetroWithCount } from '@/lib/metro-queries';
import type { MetroRegion } from '@/lib/metro-areas';

/**
 * Client-side metro finder for the /best index. With ~191 qualifying metros, a
 * static region-grouped list is hard to scan — this adds an instant filter.
 * Empty query → the full region-grouped view (unchanged); typing → a flat grid
 * of name/displayName matches.
 */
export function BestMetroSearch({
  metros,
  regionOrder,
}: {
  metros: MetroWithCount[];
  regionOrder: readonly MetroRegion[];
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return null;
    return metros.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.displayName.toLowerCase().includes(query),
    );
  }, [metros, query]);

  const byRegion = useMemo(() => {
    const map = new Map<MetroRegion, MetroWithCount[]>();
    for (const m of metros) {
      if (!map.has(m.region)) map.set(m.region, []);
      map.get(m.region)!.push(m);
    }
    return map;
  }, [metros]);

  const renderCard = (metro: MetroWithCount) => (
    <Link
      key={metro.slug}
      href={`/best/${metro.slug}`}
      className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-[#22C55E] hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
            {metro.name}
          </h3>
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <MapPin className="w-3.5 h-3.5" />
            <span>{metro.displayName}</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#22C55E] transition-colors shrink-0" />
      </div>
      <div className="mt-3 text-sm">
        <span className="font-semibold text-[#0F2744]">{metro.listingCount}</span>
        <span className="text-gray-500"> touchless car washes</span>
      </div>
    </Link>
  );

  return (
    <div>
      <div className="relative mb-8 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search metro areas — e.g. Denver, Bay Area, Tampa…"
          aria-label="Search metro areas"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:border-[#22C55E] focus:ring-1 focus:ring-[#22C55E] outline-none text-sm"
        />
      </div>

      {filtered ? (
        filtered.length > 0 ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {filtered.length} metro{filtered.length !== 1 ? 's' : ''} matching “{q}”
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(renderCard)}
            </div>
          </>
        ) : (
          <p className="text-gray-500 py-10 text-center">
            No metro areas match “{q}”. Try a nearby major city, or{' '}
            <Link href="/states" className="text-[#22C55E] font-medium hover:underline">
              browse by state
            </Link>
            .
          </p>
        )
      ) : (
        regionOrder.map((region) => {
          const regionMetros = byRegion.get(region) ?? [];
          if (regionMetros.length === 0) return null;
          return (
            <div key={region} className="mb-12 last:mb-0">
              <h2 className="text-2xl font-bold text-[#0F2744] mb-6 pb-2 border-b border-gray-200">
                {region}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {regionMetros.map(renderCard)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
