'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Building2, Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import HeroScorePromo from '@/components/HeroScorePromo';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify, US_STATES } from '@/lib/constants';
import { METRO_AREAS } from '@/lib/metro-areas';
import { CHAINS } from '@/lib/chains';

const DEFAULT_PLACEHOLDER = 'Search by city, ZIP, or car wash name';

interface GeoLocation {
  city: string;
  state: string;
  zip?: string;
}

interface ListingResult {
  // For a group of listings sharing the same name, id is null and count > 1
  id: string | null;
  name: string;
  slug: string;
  city: string;
  state: string;
  count: number; // 1 for singleton, >1 for a grouped name
}

interface MetroResult {
  name: string;
  displayName: string;
  slug: string;
}

interface ChainResult {
  name: string;
  slug: string;
  count: number;
}

interface GooglePlaceResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface AutocompleteResults {
  chains: ChainResult[];
  metros: MetroResult[];
  locations: GooglePlaceResult[];
  listings: ListingResult[];
  totalListings: number; // Total matching listings (for "See all N" footer)
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

/** Normalize a wash name for grouping: strip punctuation, lowercase, collapse whitespace.
 *  "Mr Sparkle Car Wash" and "Mr. Sparkle Car Wash" normalize to the same key. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'`"!?@#$%^*()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a multi-word query into a (namePart, locationPart) tuple.
 *  Returns null for locationPart if no location component detected. */
function parseQuery(term: string): { namePart: string; locationPart: string | null; zipPart: string | null } {
  const trimmed = term.trim();
  // ZIP code at end: "sparkle 02118"
  const zipMatch = trimmed.match(/^(.+?)\s+(\d{5})$/);
  if (zipMatch) return { namePart: zipMatch[1].trim(), locationPart: null, zipPart: zipMatch[2] };

  // Full query is just a ZIP
  if (/^\d{5}$/.test(trimmed)) return { namePart: '', locationPart: null, zipPart: trimmed };

  const words = trimmed.split(/\s+/);
  if (words.length < 2) return { namePart: trimmed, locationPart: null, zipPart: null };

  // Build set of known locations: state names, state codes, city names from metros
  const locationTokens = new Set<string>();
  for (const s of US_STATES) {
    locationTokens.add(s.code.toLowerCase());
    locationTokens.add(s.name.toLowerCase());
  }
  for (const m of METRO_AREAS) {
    locationTokens.add(m.name.toLowerCase());
    // Also allow individual words in multi-word metros ("San Francisco" → "san francisco")
  }

  // Try progressively longer trailing slices (last 1, 2, 3 words) as location
  for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
    const trailing = words.slice(-take).join(' ').toLowerCase();
    if (locationTokens.has(trailing)) {
      return {
        namePart: words.slice(0, words.length - take).join(' '),
        locationPart: trailing,
        zipPart: null,
      };
    }
  }

  // No location part detected — treat whole query as name
  return { namePart: trimmed, locationPart: null, zipPart: null };
}

/** Fetch listing name matches, group by name, and return a mix of grouped and
 *  singleton results. Groups (e.g., "Mr Sparkle Car Wash") link to the search
 *  page; singletons link directly to the listing.
 *
 *  Ranking: prefix matches first (name starts with query), then substring
 *  matches. Within each tier, groups ranked by group size, singletons by
 *  review_count.
 */
async function fetchListingMatches(term: string): Promise<{ results: ListingResult[]; total: number }> {
  // Parse query — split into (namePart, locationPart) for "sparkle boston" style queries
  const parsed = parseQuery(term);
  // What we use to filter on name (falls back to full term if parsing found no location)
  const nameTerm = parsed.namePart || term;

  const patterns: string[] = [`%${nameTerm}%`];
  if (nameTerm.includes('&')) {
    patterns.push(`%${nameTerm.replace(/&/g, ' & ')}%`);
    patterns.push(`%${nameTerm.replace(/&/g, ' and ')}%`);
  } else if (nameTerm.includes(' & ')) {
    patterns.push(`%${nameTerm.replace(/ & /g, '&')}%`);
  } else if (nameTerm.toLowerCase().includes(' and ')) {
    patterns.push(`%${nameTerm.replace(/ and /gi, '&')}%`);
    patterns.push(`%${nameTerm.replace(/ and /gi, ' & ')}%`);
  }

  let query = supabase
    .from('listings')
    .select('id, name, slug, city, state, review_count, rating', { count: 'exact' });

  // Apply name filter only if there's a name component
  if (nameTerm) {
    const nameFilter = patterns.map((p) => `name.ilike.${p}`).join(',');
    query = query.or(nameFilter);
  }

  // Apply location filter if parsed (city or state matching)
  if (parsed.locationPart) {
    const loc = parsed.locationPart;
    // Match state code exactly (2-char), state name, or city name
    const locFilter = loc.length === 2
      ? `state.ilike.${loc},city.ilike.%${loc}%`
      : `city.ilike.%${loc}%,state.ilike.%${loc}%`;
    query = query.or(locFilter);
  } else if (parsed.zipPart) {
    query = query.eq('zip', parsed.zipPart);
  }

  const { data, count } = await query
    .eq('is_touchless', true)
    .order('review_count', { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = (data ?? []) as Array<{
    id: string; name: string; slug: string; city: string; state: string;
    review_count: number | null; rating: number | null;
  }>;
  const total = count ?? rows.length;

  // Group by normalized name
  type Group = { name: string; members: typeof rows; normalized: string };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const norm = normalizeName(r.name);
    let g = groups.get(norm);
    if (!g) {
      g = { name: r.name, members: [], normalized: norm };
      groups.set(norm, g);
    }
    g.members.push(r);
  }

  // Rank groups by a relevance score that balances several signals.
  //
  // Users searching "sparkle" expect to see Mr. Sparkle (13 locations) as
  // prominently as Sparkle Self Service (2 locations) — both are clearly
  // relevant. Previously a strict prefix-only sort buried Mr. Sparkle
  // behind 10 one-off prefix matches.
  //
  // New formula — higher score wins:
  //   +log10(member_count) × 20   → more locations = more relevant
  //   +log10(top_review_count) × 3 → more reviews = more established
  //   +5 bonus if normalized name STARTS with query term (slight prefix tiebreaker)
  const rankTerm = (nameTerm || term).toLowerCase();
  function score(g: Group): number {
    const members = g.members.length;
    const topReviews = Math.max(0, g.members[0].review_count ?? 0);
    const prefixBonus = g.normalized.startsWith(rankTerm) ? 5 : 0;
    return Math.log10(members + 1) * 20
      + Math.log10(topReviews + 1) * 3
      + prefixBonus;
  }
  const ranked = Array.from(groups.values()).sort((a, b) => score(b) - score(a));

  // Convert to results — up to 10 entries, blending groups and singletons
  const results: ListingResult[] = ranked.slice(0, 10).map((g) => {
    if (g.members.length === 1) {
      const m = g.members[0];
      return { id: m.id, name: m.name, slug: m.slug, city: m.city, state: m.state, count: 1 };
    }
    // Group — use the most-reviewed member's slug as a representative
    const top = g.members[0];
    return { id: null, name: g.name, slug: top.slug, city: '', state: '', count: g.members.length };
  });

  return { results, total };
}

/** Match metro areas from the local METRO_AREAS array. */
function matchMetros(term: string): MetroResult[] {
  const termLower = term.toLowerCase();
  return METRO_AREAS
    .filter((m) => m.name.toLowerCase().includes(termLower) || m.displayName.toLowerCase().includes(termLower))
    .slice(0, 3)
    .map((m) => ({ name: m.name, displayName: m.displayName, slug: m.slug }));
}

/** Match chains by name. If term matches a chain, return it so users see
 *  "Browse all N Kwik Trip locations" instead of 5 specific Kwik Trips. */
async function matchChains(term: string): Promise<ChainResult[]> {
  const termLower = term.toLowerCase();
  const matching = CHAINS.filter(
    (c) =>
      c.name.toLowerCase().includes(termLower) ||
      c.slug.toLowerCase().includes(termLower.replace(/\s+/g, '-'))
  ).slice(0, 3);
  if (matching.length === 0) return [];
  // Get touchless counts for each match
  const results = await Promise.all(
    matching.map(async (c) => {
      const { count } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('parent_chain', c.name)
        .eq('is_touchless', true);
      return { name: c.name, slug: c.slug, count: count ?? 0 };
    })
  );
  return results.filter((r) => r.count >= 2); // Only show chains with 2+ locations
}

export default function HeroSection({ totalCount }: { totalCount?: number }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [results, setResults] = useState<AutocompleteResults>({ chains: [], metros: [], locations: [], listings: [], totalListings: 0 });
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
          // Filter out fuzzy matches: Google sometimes returns "Shrub Oak" for "scrub"
          // because of phonetic-like fuzzy matching. Only keep predictions whose main
          // text starts with (or clearly contains as a word-boundary) the query.
          const termLower = term.toLowerCase();
          const filtered = predictions
            .map((p) => ({
              placeId: p.place_id,
              description: p.description,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text,
            }))
            .filter((p) => {
              const main = p.mainText.toLowerCase();
              // Accept if main text starts with the query, OR contains it as a whole word,
              // OR the description contains it as a whole word (catches "Hwy 101 Auburn" for "auburn")
              if (main.startsWith(termLower)) return true;
              const wordRe = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
              return wordRe.test(p.mainText) || wordRe.test(p.description);
            })
            .slice(0, 5);
          resolve(filtered);
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
      setResults({ chains: [], metros: [], locations: [], listings: [], totalListings: 0 });
      setOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const term = value.trim();
      const isZipLike = /^\d{3,5}$/.test(term);

      // Each promise is wrapped so a single failure can't take down the whole dropdown.
      const googlePromise = fetchGooglePlaces(term).catch((err) => {
        console.error('[search] fetchGooglePlaces failed:', err);
        return [] as GooglePlaceResult[];
      });
      const listingsPromise = isZipLike
        ? Promise.resolve({ results: [] as ListingResult[], total: 0 })
        : fetchListingMatches(term).catch((err) => {
            console.error('[search] fetchListingMatches failed:', err);
            return { results: [] as ListingResult[], total: 0 };
          });
      const chainsPromise = isZipLike
        ? Promise.resolve([] as ChainResult[])
        : matchChains(term).catch((err) => {
            console.error('[search] matchChains failed:', err);
            return [] as ChainResult[];
          });

      const [googlePlaces, listingsResult, chains] = await Promise.all([
        googlePromise,
        listingsPromise,
        chainsPromise,
      ]);

      const metros = isZipLike ? [] : matchMetros(term);

      // Diagnostic so we can see in the browser console what came back
      if (typeof window !== 'undefined') {
        console.log('[search]', term, {
          chains: chains.length,
          metros: metros.length,
          googlePlaces: googlePlaces.length,
          listings: listingsResult.results.length,
          totalListings: listingsResult.total,
        });
      }

      setResults({
        chains,
        metros,
        locations: googlePlaces,
        listings: listingsResult.results,
        totalListings: listingsResult.total,
      });
      setOpen(chains.length > 0 || metros.length > 0 || googlePlaces.length > 0 || listingsResult.results.length > 0);
    }, 200);
  }, []);

  // ── Build flat list of all items for keyboard nav ───────────────────
  const allItems = [
    ...results.chains.map((c) => ({ type: 'chain' as const, data: c })),
    ...results.metros.map((m) => ({ type: 'metro' as const, data: m })),
    ...results.locations.map((l) => ({ type: 'location' as const, data: l })),
    ...results.listings.map((l) => ({ type: 'listing' as const, data: l })),
  ];

  // ── Navigate to selected item ───────────────────────────────────────
  const navigateToItem = useCallback(async (item: typeof allItems[number]) => {
    setOpen(false);
    setQuery('');

    if (item.type === 'chain') {
      const c = item.data as ChainResult;
      router.push(`/chain/${c.slug}`);
    } else if (item.type === 'metro') {
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
      if (l.count > 1 || !l.id) {
        // Grouped result — go to the full search page with the group name as query
        router.push(`/search?q=${encodeURIComponent(l.name)}`);
      } else {
        router.push(`/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`);
      }
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
      // Parse for multi-word "name location" pattern (e.g., "sparkle boston")
      const parsed = parseQuery(q);

      // If parsed a location qualifier, go straight to /search with geocoded location +
      // the NAME part as the text query. This gives "Sparkle in Boston" behavior.
      if (parsed.locationPart) {
        const locCoords = await forwardGeocode(parsed.locationPart);
        const searchQ = parsed.namePart || q;
        if (locCoords) {
          router.push(`/search?q=${encodeURIComponent(searchQ)}&lat=${locCoords.lat}&lng=${locCoords.lng}`);
          return;
        }
        router.push(`/search?q=${encodeURIComponent(q)}`);
        return;
      }

      // Single-name query: check for direct listing match first
      const nameTerm = parsed.namePart || q;
      const namePatterns: string[] = [`name.ilike.%${nameTerm}%`];
      if (nameTerm.includes('&')) {
        namePatterns.push(`name.ilike.%${nameTerm.replace(/&/g, ' & ')}%`);
        namePatterns.push(`name.ilike.%${nameTerm.replace(/&/g, ' and ')}%`);
      } else if (nameTerm.includes(' & ')) {
        namePatterns.push(`name.ilike.%${nameTerm.replace(/ & /g, '&')}%`);
      }
      // How many listings match? If exactly 1, jump to it. If >1, go to search page.
      const { data: matches, count: matchCount } = await supabase
        .from('listings')
        .select('id, name, slug, city, state', { count: 'exact' })
        .or(namePatterns.join(','))
        .eq('is_touchless', true)
        .order('review_count', { ascending: false, nullsFirst: false })
        .limit(2);

      if (matchCount === 1 && matches && matches.length > 0) {
        const m = matches[0];
        router.push(`/state/${getStateSlug(m.state)}/${slugify(m.city)}/${m.slug}`);
        return;
      }
      if (matchCount && matchCount > 1) {
        router.push(`/search?q=${encodeURIComponent(q)}`);
        return;
      }

      // No name matches — try geocoding as a pure location query
      const coords = await forwardGeocode(q);
      if (coords) {
        router.push(`/search?q=${encodeURIComponent(q)}&lat=${coords.lat}&lng=${coords.lng}`);
        return;
      }
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

  const noResults = open && results.chains.length === 0 && results.metros.length === 0 && results.locations.length === 0 && results.listings.length === 0 && query.trim().length >= 2;

  let itemIndex = -1;

  return (
    <section
      id="search"
      className="relative min-h-[70vh] md:min-h-[80vh] flex items-center"
    >
      {/* Background image wrapper — keeps overflow-hidden on the IMAGE only so the
          autocomplete dropdown can escape the hero section. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
      </div>

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Search className="w-4 h-4" />
            100% Touchless Only
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Find Automatic Touchless &amp; Brushless Car&nbsp;Washes {headingLocation}
          </h1>

          <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
            Search {totalCount ? `${(Math.floor(totalCount / 100) * 100).toLocaleString()}+` : '4,000+'} verified automatic touchless car wash locations across all 50 states. Ratings, hours, photos, and directions.
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
                    if (results.chains.length > 0 || results.metros.length > 0 || results.locations.length > 0 || results.listings.length > 0) setOpen(true);
                  }}
                  autoComplete="off"
                  className="pl-12 h-14 text-base bg-white text-gray-900 rounded-l-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {(open || noResults) && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-y-auto max-h-[70vh] z-50">
                    {noResults ? (
                      <div className="px-4 py-5 text-sm text-gray-500 text-center">
                        {/^\d{3,5}$/.test(query.trim())
                          ? 'No touchless car washes at that ZIP — try a nearby city'
                          : 'No results — try a different search'}
                      </div>
                    ) : (
                      <>
                        {results.chains.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <Building2 className="w-3.5 h-3.5 text-green-600" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Chains</span>
                            </div>
                            {results.chains.map((chain) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              return (
                                <button
                                  key={chain.slug}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'chain', data: chain })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900">
                                    Browse all {chain.count.toLocaleString()} {chain.name} locations
                                  </span>
                                  <span className="text-xs text-green-600 ml-4 shrink-0 font-medium">
                                    Chain
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {results.metros.length > 0 && (
                          <div className={results.chains.length > 0 ? 'border-t border-gray-100' : ''}>
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
                          <div className={(results.chains.length > 0 || results.metros.length > 0) ? 'border-t border-gray-100' : ''}>
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
                          <div className={(results.chains.length > 0 || results.metros.length > 0 || results.locations.length > 0) ? 'border-t border-gray-100' : ''}>
                            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Car Washes</span>
                            </div>
                            {results.listings.map((listing, i) => {
                              itemIndex += 1;
                              const idx = itemIndex;
                              const isGroup = listing.count > 1;
                              return (
                                <button
                                  key={listing.id ?? `group-${listing.name}-${i}`}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => navigateToItem({ type: 'listing', data: listing })}
                                  onMouseEnter={() => setActiveIndex(idx)}
                                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span className="text-sm font-medium text-gray-900 truncate pr-2">{listing.name}</span>
                                  <span className="text-xs text-gray-400 shrink-0">
                                    {isGroup ? `${listing.count} locations` : `${listing.city}, ${listing.state}`}
                                  </span>
                                </button>
                              );
                            })}
                            {results.totalListings > results.listings.length && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setOpen(false);
                                  const q = query.trim();
                                  setQuery('');
                                  router.push(`/search?q=${encodeURIComponent(q)}`);
                                }}
                                className="w-full px-4 py-2.5 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition-colors"
                              >
                                See all {results.totalListings} matches →
                              </button>
                            )}
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

          {/* Touchless Satisfaction Score — the flagship "why us" hook */}
          <HeroScorePromo />
        </div>
      </div>
    </section>
  );
}
