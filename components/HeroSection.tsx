'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Building2, Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS } from '@/lib/metro-areas';

const DEFAULT_PLACEHOLDER = 'Search by city, ZIP, or car wash name';

interface GeoLocation {
  city: string;
  state: string;
  zip?: string;
}

interface ListingResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
}

interface MetroResult {
  name: string;
  displayName: string;
  slug: string;
}

interface GooglePlaceResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AutocompleteResults {
  metros: MetroResult[];
  locations: GooglePlaceResult[];
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

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=1`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetch listing name matches from Supabase (for non-ZIP queries only). */
async function fetchListingMatches(term: string): Promise<ListingResult[]> {
  // Build alternate patterns to handle "&" variations:
  // "K&D" should also match "K & D", "K and D", etc.
  const patterns: string[] = [`%${term}%`];
  if (term.includes('&')) {
    patterns.push(`%${term.replace(/&/g, ' & ')}%`); // "K&D" → "K & D"
    patterns.push(`%${term.replace(/&/g, ' and ')}%`); // "K&D" → "K and D"
  } else if (term.includes(' & ')) {
    patterns.push(`%${term.replace(/ & /g, '&')}%`); // "K & D" → "K&D"
  }

  const filter = patterns.map(p => `name.ilike.${p}`).join(',');
  const { data } = await supabase
    .from('listings')
    .select('id, name, slug, city, state')
    .or(filter)
    .eq('is_touchless', true)
    .order('rating', { ascending: false })
    .limit(5);
  return (data ?? []) as ListingResult[];
}

/** Match metro areas from the local METRO_AREAS array. */
function matchMetros(term: string): MetroResult[] {
  const termLower = term.toLowerCase();
  return METRO_AREAS
    .filter((m) => m.name.toLowerCase().includes(termLower) || m.displayName.toLowerCase().includes(termLower))
    .slice(0, 3)
    .map((m) => ({ name: m.name, displayName: m.displayName, slug: m.slug }));
}

export default function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [results, setResults] = useState<AutocompleteResults>({ metros: [], locations: [], listings: [] });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Google Places refs
  const placesService = useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const mapsLoadRequested = useRef(false);

  // ── Load Google Maps on demand (only when user interacts with search) ──
  function loadGoogleMaps() {
    if (mapsLoadRequested.current || typeof window === 'undefined') return;
    if (window.google?.maps?.places) {
      initPlaces();
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    mapsLoadRequested.current = true;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }

  function initPlaces() {
    if (typeof window !== 'undefined' && window.google?.maps?.places) {
      if (!placesService.current) {
        placesService.current = new google.maps.places.AutocompleteService();
        sessionToken.current = new google.maps.places.AutocompleteSessionToken();
        geocoder.current = new google.maps.Geocoder();
      }
      return true;
    }
    return false;
  }

  // ── Init Google Places (poll only after script load is requested) ────
  useEffect(() => {
    if (initPlaces()) return;
    // Only poll if we've actually requested the Maps script
    if (!mapsLoadRequested.current) return;
    const interval = setInterval(() => {
      if (initPlaces()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  });

  // ── Geolocation for placeholder ─────────────────────────────────────
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

  // ── Click outside to close ──────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Fetch Google Places predictions ─────────────────────────────────
  function fetchGooglePlaces(term: string): Promise<GooglePlaceResult[]> {
    return new Promise((resolve) => {
      if (!placesService.current) {
        resolve([]);
        return;
      }
      placesService.current.getPlacePredictions(
        {
          input: term,
          componentRestrictions: { country: 'us' },
          types: ['(regions)'],
          sessionToken: sessionToken.current ?? undefined,
        },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            resolve([]);
            return;
          }
          resolve(
            predictions.slice(0, 5).map((p) => ({
              placeId: p.place_id,
              description: p.description,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text,
            }))
          );
        }
      );
    });
  }

  // ── Geocode a Google Place ID to lat/lng ─────────────────────────────
  function geocodePlaceId(placeId: string): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!geocoder.current) {
        resolve(null);
        return;
      }
      geocoder.current.geocode({ placeId }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      });
    });
  }

  // ── Handle query change with debounced autocomplete ─────────────────
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(-1);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.trim().length < 2) {
      setResults({ metros: [], locations: [], listings: [] });
      setOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const term = value.trim();
      const isZipLike = /^\d{3,5}$/.test(term);

      // Run queries in parallel
      const [googlePlaces, listings] = await Promise.all([
        fetchGooglePlaces(term),
        isZipLike ? Promise.resolve([] as ListingResult[]) : fetchListingMatches(term),
      ]);

      // Match metros locally (skip for ZIP-like queries)
      const metros = isZipLike ? [] : matchMetros(term);

      setResults({ metros, locations: googlePlaces, listings });
      setOpen(metros.length > 0 || googlePlaces.length > 0 || listings.length > 0);
    }, 200);
  }, []);

  // ── Build flat list of all items for keyboard nav ───────────────────
  const allItems = [
    ...results.metros.map((m) => ({ type: 'metro' as const, data: m })),
    ...results.locations.map((l) => ({ type: 'location' as const, data: l })),
    ...results.listings.map((l) => ({ type: 'listing' as const, data: l })),
  ];

  // ── Navigate to selected item ───────────────────────────────────────
  const navigateToItem = useCallback(async (item: typeof allItems[number]) => {
    setOpen(false);
    setQuery('');

    if (item.type === 'metro') {
      const m = item.data as MetroResult;
      router.push(`/best/${m.slug}`);
    } else if (item.type === 'location') {
      const loc = item.data as GooglePlaceResult;
      setIsSubmitting(true);
      try {
        const coords = await geocodePlaceId(loc.placeId);
        // Rotate session token after completed session
        if (sessionToken.current) {
          sessionToken.current = new google.maps.places.AutocompleteSessionToken();
        }
        if (coords) {
          router.push(`/search?q=${encodeURIComponent(loc.description)}&lat=${coords.lat}&lng=${coords.lng}`);
        } else {
          // Fallback: text search
          router.push(`/search?q=${encodeURIComponent(loc.description)}`);
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const l = item.data as ListingResult;
      router.push(`/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`);
    }
  }, [router]);

  // ── Keyboard navigation ─────────────────────────────────────────────
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

  // ── Form submit (Enter without selecting autocomplete) ──────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (activeIndex >= 0 && open) {
      navigateToItem(allItems[activeIndex]);
      return;
    }

    const q = query.trim();
    if (!q) return;

    setOpen(false);
    setIsSubmitting(true);

    try {
      // Check for direct listing name match first
      // Handle "&" variations: "K&D" should match "K & D", etc.
      const namePatterns: string[] = [`name.ilike.%${q}%`];
      if (q.includes('&')) {
        namePatterns.push(`name.ilike.%${q.replace(/&/g, ' & ')}%`);
        namePatterns.push(`name.ilike.%${q.replace(/&/g, ' and ')}%`);
      } else if (q.includes(' & ')) {
        namePatterns.push(`name.ilike.%${q.replace(/ & /g, '&')}%`);
      }
      const { data: nameMatch } = await supabase
        .from('listings')
        .select('id, name, slug, city, state')
        .or(namePatterns.join(','))
        .eq('is_touchless', true)
        .order('rating', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (nameMatch) {
        router.push(`/state/${getStateSlug(nameMatch.state)}/${slugify(nameMatch.city)}/${nameMatch.slug}`);
        return;
      }

      // Try to geocode the query for proximity search
      const coords = await forwardGeocode(q);
      if (coords) {
        router.push(`/search?q=${encodeURIComponent(q)}&lat=${coords.lat}&lng=${coords.lng}`);
        return;
      }

      // Fallback: text-only search
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const placeholder = geoResolved && geoLocation
    ? `e.g. ${geoLocation.city}, ${geoLocation.state}${geoLocation.zip ? ' ' + geoLocation.zip : ''}`
    : DEFAULT_PLACEHOLDER;

  const headingLocation = geoResolved && geoLocation
    ? `Near\u00a0${geoLocation.city},\u00a0${geoLocation.state}`
    : 'Near\u00a0You';

  const noResults = open && results.metros.length === 0 && results.locations.length === 0 && results.listings.length === 0 && query.trim().length >= 2;

  let itemIndex = -1;

  return (
    <section
      id="search"
      className="relative min-h-[70vh] md:min-h-[80vh] flex items-center overflow-hidden"
    >
      {/* <picture> with AVIF/WebP responsive srcset — serves 19-70 KB instead of 180 KB */}
      <picture>
        <source
          type="image/avif"
          srcSet="https://res.cloudinary.com/dret3qhyu/image/upload/f_avif,q_auto:low,w_640/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 640w, https://res.cloudinary.com/dret3qhyu/image/upload/f_avif,q_auto:low,w_1024/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 1024w, https://res.cloudinary.com/dret3qhyu/image/upload/f_avif,q_auto:low,w_1600/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 1600w"
          sizes="100vw"
        />
        <source
          type="image/webp"
          srcSet="https://res.cloudinary.com/dret3qhyu/image/upload/f_webp,q_auto:low,w_640/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 640w, https://res.cloudinary.com/dret3qhyu/image/upload/f_webp,q_auto:low,w_1024/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 1024w, https://res.cloudinary.com/dret3qhyu/image/upload/f_webp,q_auto:low,w_1600/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png 1600w"
          sizes="100vw"
        />
        <img
          src="https://res.cloudinary.com/dret3qhyu/image/upload/f_auto,q_auto:low,w_1600/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>
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
            Find Touchless &amp; Brushless Car&nbsp;Washes {headingLocation}
          </h1>

          <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
            The only directory dedicated exclusively to touchless, touch-free, no-touch, and brushless car washes. Find contactless, automatic car washes with no brushes — just a clean car.
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
                    loadGoogleMaps();
                    if (results.metros.length > 0 || results.locations.length > 0 || results.listings.length > 0) setOpen(true);
                  }}
                  autoComplete="off"
                  className="pl-12 h-14 text-base bg-white text-gray-900 rounded-l-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {(open || noResults) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                    {noResults ? (
                      <div className="px-4 py-5 text-sm text-gray-500 text-center">
                        {/^\d{3,5}$/.test(query.trim())
                          ? 'No touchless car washes at that ZIP — try a nearby city'
                          : 'No results — try a different search'}
                      </div>
                    ) : (
                      <>
                        {results.metros.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <Trophy className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Best Of</span>
                            </div>
                            {results.metros.map((metro) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              return (
                                <button
                                  key={metro.slug}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'metro', data: metro })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900">
                                    Best in {metro.displayName}
                                  </span>
                                  <span className="text-xs text-amber-600 ml-4 shrink-0 font-medium">
                                    Top rated
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {results.locations.length > 0 && (
                          <div className={results.metros.length > 0 ? 'border-t border-gray-100' : ''}>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Locations</span>
                            </div>
                            {results.locations.map((loc) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              return (
                                <button
                                  key={loc.placeId}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'location', data: loc })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900">
                                    {loc.mainText}{' '}
                                    <span className="text-gray-500">{loc.secondaryText}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {results.listings.length > 0 && (
                          <div className={(results.metros.length > 0 || results.locations.length > 0) ? 'border-t border-gray-100' : ''}>
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
                disabled={isSubmitting}
                className="h-14 px-10 bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold text-base rounded-r-lg disabled:opacity-70"
              >
                {isSubmitting ? 'Searching...' : 'Search'}
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
