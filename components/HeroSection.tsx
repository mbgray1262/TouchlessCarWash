'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';

const DEFAULT_PLACEHOLDER = 'Search by city, ZIP, or car wash name';

interface GeoLocation {
  city: string;
  state: string;
  zip?: string;
}

interface CityResult {
  city: string;
  state: string;
  count: number;
}

interface ListingResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
}

interface AutocompleteResults {
  cities: CityResult[];
  listings: ListingResult[];
}

async function reverseGeocode(lat: number, lon: number): Promise<GeoLocation | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || null;
    const state = addr['ISO3166-2-lvl4']?.replace('US-', '') ?? addr.state_code ?? null;
    const zip = addr.postcode ?? undefined;
    if (!city || !state) return null;
    return { city, state, zip };
  } catch {
    return null;
  }
}

async function fetchAutocomplete(q: string): Promise<AutocompleteResults> {
  const term = q.trim();
  if (term.length < 2) return { cities: [], listings: [] };

  const [cityRows, listingRows] = await Promise.all([
    supabase
      .from('listings')
      .select('city, state')
      .ilike('city', `${term}%`)
      .eq('is_touchless', true)
      .limit(50),
    supabase
      .from('listings')
      .select('id, name, slug, city, state')
      .ilike('name', `%${term}%`)
      .eq('is_touchless', true)
      .order('rating', { ascending: false })
      .limit(5),
  ]);

  const cityMap = new Map<string, CityResult>();
  for (const row of cityRows.data ?? []) {
    const key = `${row.city}||${row.state}`;
    if (cityMap.has(key)) {
      cityMap.get(key)!.count += 1;
    } else {
      cityMap.set(key, { city: row.city, state: row.state, count: 1 });
    }
  }
  const cities = Array.from(cityMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    cities,
    listings: listingRows.data ?? [],
  };
}

export default function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [results, setResults] = useState<AutocompleteResults>({ cities: [], listings: [] });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoResolved(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLocation(result);
        setGeoResolved(true);
      },
      () => {
        setGeoResolved(true);
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(-1);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.trim().length < 2) {
      setResults({ cities: [], listings: [] });
      setOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const data = await fetchAutocomplete(value);
      setResults(data);
      setOpen(data.cities.length > 0 || data.listings.length > 0);
    }, 200);
  }, []);

  const allItems = [
    ...results.cities.map((c) => ({ type: 'city' as const, data: c })),
    ...results.listings.map((l) => ({ type: 'listing' as const, data: l })),
  ];

  const navigateToItem = useCallback((item: typeof allItems[number]) => {
    setOpen(false);
    setQuery('');
    if (item.type === 'city') {
      const c = item.data as CityResult;
      router.push(`/state/${getStateSlug(c.state)}/${slugify(c.city)}`);
    } else {
      const l = item.data as ListingResult;
      router.push(`/car-washes/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`);
    }
  }, [router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;

    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      navigateToItem(allItems[activeIndex]);
    }
  }, [open, allItems, activeIndex, navigateToItem]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (activeIndex >= 0 && open) {
      navigateToItem(allItems[activeIndex]);
      return;
    }

    const q = query.trim();
    if (!q) return;

    setOpen(false);

    const { data: nameMatch } = await supabase
      .from('listings')
      .select('id, name, slug, city, state')
      .ilike('name', `%${q}%`)
      .eq('is_touchless', true)
      .order('rating', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nameMatch) {
      router.push(`/car-washes/${getStateSlug(nameMatch.state)}/${slugify(nameMatch.city)}/${nameMatch.slug}`);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const placeholder = geoResolved && geoLocation
    ? `e.g. ${geoLocation.city}, ${geoLocation.state}${geoLocation.zip ? ' ' + geoLocation.zip : ''}`
    : DEFAULT_PLACEHOLDER;

  const headingLocation = geoResolved && geoLocation
    ? `Near\u00a0${geoLocation.city},\u00a0${geoLocation.state}`
    : 'Near\u00a0You';

  const noResults = open && results.cities.length === 0 && results.listings.length === 0 && query.trim().length >= 2;

  let itemIndex = -1;

  return (
    <section
      id="search"
      className="relative min-h-[70vh] md:min-h-[80vh] flex items-center"
      style={{
        backgroundImage: 'url(https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-r from-[#0a1628]/95 via-[#0a1628]/75 via-40% to-transparent"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Search className="w-4 h-4" />
            100% Touchless Only
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Find Touchless Car&nbsp;Washes {headingLocation}
          </h1>

          <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
            The only directory dedicated exclusively to touchless car washes. No brushes, no scratches — just clean.
          </p>

          <div className="mb-6" ref={containerRef}>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 z-10 pointer-events-none" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (results.cities.length > 0 || results.listings.length > 0) setOpen(true);
                  }}
                  autoComplete="off"
                  className="pl-12 h-14 text-base bg-white text-gray-900 rounded-l-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {(open || noResults) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                    {noResults ? (
                      <div className="px-4 py-5 text-sm text-gray-500 text-center">
                        No results — try a different search
                      </div>
                    ) : (
                      <>
                        {results.cities.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cities</span>
                            </div>
                            {results.cities.map((city) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              return (
                                <button
                                  key={`${city.city}-${city.state}`}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'city', data: city })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900">
                                    {city.city}, <span className="text-gray-500">{city.state}</span>
                                  </span>
                                  <span className="text-xs text-gray-400 ml-4 shrink-0">
                                    {city.count} location{city.count !== 1 ? 's' : ''}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {results.listings.length > 0 && (
                          <div className={results.cities.length > 0 ? 'border-t border-gray-100' : ''}>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Car Washes</span>
                            </div>
                            {results.listings.map((listing) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              return (
                                <button
                                  key={listing.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'listing', data: listing })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900 truncate pr-2">{listing.name}</span>
                                  <span className="text-xs text-gray-400 shrink-0">
                                    {listing.city}, {listing.state}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 px-10 bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold text-base rounded-r-lg"
              >
                Search
              </Button>
            </form>
          </div>

          <p className="text-sm text-white/70">
            Verified listings • Real reviews • Updated regularly
          </p>
        </div>
      </div>
    </section>
  );
}
