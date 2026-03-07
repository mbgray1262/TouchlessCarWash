'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, MapPin, Loader2, CheckCircle2, XCircle,
  ChevronRight, Globe, Star, ExternalLink, Download, Map,
  AlertTriangle, ShieldCheck, ShieldQuestion, ShieldX, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// US state abbreviation to name mapping
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

interface DiscoveredPlace {
  google_id: string;
  name: string;
  address: string;
  location: { latitude: number; longitude: number } | null;
  rating: number;
  review_count: number;
  business_status: string;
  google_maps_url: string | null;
  website: string | null;
  types: string[];
  is_existing: boolean;
  existing_listing: { name: string; city: string; state: string; slug: string } | null;
  touchless_confidence: 'high' | 'medium' | 'low';
}

interface SearchResult {
  query: string;
  total: number;
  new_count: number;
  existing_count: number;
  results: DiscoveredPlace[];
}

interface CoverageData {
  states: Array<{ state: string; count: number }>;
  underserved_cities: Array<{ city: string; count: number }>;
}

interface ImportResult {
  google_id: string;
  status: 'success' | 'error' | 'skipped';
  name?: string;
  error?: string;
}

async function callEdgeFunction(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/discover-touchless`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errData.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function DiscoverPage() {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(true);
  const [customQuery, setCustomQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 7000);
  }, []);

  // Load coverage stats on mount
  useEffect(() => {
    async function loadCoverage() {
      try {
        const data = await callEdgeFunction('coverage');
        setCoverage(data);
      } catch (err) {
        console.error('Failed to load coverage:', err);
        showToast('error', 'Failed to load coverage data');
      } finally {
        setLoadingCoverage(false);
      }
    }
    loadCoverage();
  }, [showToast]);

  async function handleSearch(query: string) {
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    setSelectedPlaces(new Set());
    setImportResults([]);

    try {
      const data = await callEdgeFunction('search', { query });
      setSearchResults(data);
      // Auto-select new places that are likely touchless (high or medium confidence)
      const newIds = new Set<string>(
        data.results
          .filter((r: DiscoveredPlace) => !r.is_existing && r.business_status === 'OPERATIONAL' && r.touchless_confidence !== 'low')
          .map((r: DiscoveredPlace) => r.google_id),
      );
      setSelectedPlaces(newIds);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function togglePlace(googleId: string) {
    setSelectedPlaces((prev) => {
      const next = new Set(prev);
      if (next.has(googleId)) next.delete(googleId);
      else next.add(googleId);
      return next;
    });
  }

  function selectAllNew() {
    if (!searchResults) return;
    const newIds = searchResults.results
      .filter((r) => !r.is_existing && r.business_status === 'OPERATIONAL' && r.touchless_confidence !== 'low')
      .map((r) => r.google_id);
    setSelectedPlaces(new Set(newIds));
  }

  function deselectAll() {
    setSelectedPlaces(new Set());
  }

  async function handleImportSelected() {
    if (selectedPlaces.size === 0) return;
    setImporting(true);
    setImportResults([]);

    try {
      const data = await callEdgeFunction('import_batch', {
        google_ids: Array.from(selectedPlaces),
      });

      const results: ImportResult[] = [];
      for (const imp of data.imported || []) {
        results.push({
          google_id: '',
          status: 'success',
          name: `${imp.name} (${imp.city}, ${imp.state})`,
        });
      }
      for (const err of data.errors || []) {
        results.push({ google_id: '', status: 'error', error: err });
      }
      setImportResults(results);

      const parts: string[] = [`Imported ${data.imported_count} listing${data.imported_count !== 1 ? 's' : ''}.`];
      if (data.skipped_count > 0) parts.push(`${data.skipped_count} already in directory.`);
      if (data.skipped_closed_count > 0) parts.push(`${data.skipped_closed_count} closed.`);
      if (data.error_count > 0) parts.push(`${data.error_count} error${data.error_count !== 1 ? 's' : ''}.`);
      showToast(
        data.imported_count > 0 ? 'success' : 'error',
        parts.join(' '),
      );

      // Mark imported places as existing in results
      if (searchResults) {
        const importedNames = new Set((data.imported || []).map((i: { name: string }) => i.name));
        setSearchResults({
          ...searchResults,
          results: searchResults.results.map((r) => {
            if (selectedPlaces.has(r.google_id) && importedNames.has(r.name)) {
              return { ...r, is_existing: true };
            }
            return r;
          }),
        });
      }
      setSelectedPlaces(new Set());
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function rejectPlace(googleId: string, name: string) {
    // Optimistic UI: immediately remove from results
    if (searchResults) {
      setSearchResults({
        ...searchResults,
        results: searchResults.results.filter((r) => r.google_id !== googleId),
      });
    }
    // Also deselect if selected
    setSelectedPlaces((prev) => {
      const next = new Set(prev);
      next.delete(googleId);
      return next;
    });
    try {
      await callEdgeFunction('reject', { google_id: googleId, name });
    } catch (err) {
      console.error('Failed to reject place:', err);
      showToast('error', 'Failed to dismiss place');
    }
  }

  const underservedStates = coverage?.states?.filter((s) => s.count < 20) || [];
  const underservedCities = coverage?.underserved_cities || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : toast.type === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 max-w-6xl py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/import">
                <ArrowLeft className="w-4 h-4 mr-1" /> Import
              </Link>
            </Button>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-[#0F2744]">Discover Touchless Car Washes</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#0F2744] mb-2">
            Discover Touchless Car Washes
          </h1>
          <p className="text-gray-500">
            Search Google Places to find touchless car washes in underserved areas.
            Results are cross-referenced with your existing directory to avoid duplicates.
          </p>
        </div>

        {/* Custom Search */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h3 className="font-semibold text-[#0F2744] mb-3 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Search Any Area
            </h3>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9 text-sm"
                  placeholder="e.g. Boston, MA or Hawaii or San Francisco"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !searching && customQuery.trim() && handleSearch(customQuery.trim())}
                  disabled={searching}
                />
              </div>
              <Button
                onClick={() => handleSearch(customQuery.trim())}
                disabled={searching || !customQuery.trim()}
                className="bg-[#0F2744] hover:bg-[#1E3A8A] text-white px-6 shrink-0"
              >
                {searching ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" /> Search</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Error */}
        {searchError && (
          <Card className="border-red-200 bg-red-50 mb-6">
            <CardContent className="p-5 flex gap-3 items-start">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700 mb-1">Search Failed</p>
                <p className="text-sm text-red-600">{searchError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Results */}
        {searchResults && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-[#0F2744]">
                  Results for &ldquo;{searchResults.query}&rdquo;
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Found {searchResults.total} places &mdash;{' '}
                  <span className="text-green-600 font-medium">{searchResults.new_count} new</span>,{' '}
                  <span className="text-gray-500">{searchResults.existing_count} already in directory</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllNew} disabled={importing}>
                  Select all new
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll} disabled={importing}>
                  Deselect all
                </Button>
                <Button
                  onClick={handleImportSelected}
                  disabled={selectedPlaces.size === 0 || importing}
                  className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
                >
                  {importing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" /> Import {selectedPlaces.size} Selected</>
                  )}
                </Button>
              </div>
            </div>

            {/* Import Results */}
            {importResults.length > 0 && (
              <Card className="border-green-200 bg-green-50 mb-4">
                <CardContent className="p-4">
                  <p className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Import Complete
                  </p>
                  <div className="space-y-1 text-sm">
                    {importResults.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {r.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className={r.status === 'success' ? 'text-green-700' : 'text-red-600'}>
                          {r.name || r.error}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results List — new places first, then existing (greyed out) */}
            <div className="space-y-2">
              {[...searchResults.results].sort((a, b) => Number(a.is_existing) - Number(b.is_existing)).map((place) => (
                <div
                  key={place.google_id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                    place.is_existing
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : place.touchless_confidence === 'low'
                        ? 'bg-red-50/30 border-gray-200 opacity-50'
                        : selectedPlaces.has(place.google_id)
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Checkbox */}
                  {!place.is_existing && (
                    <input
                      type="checkbox"
                      checked={selectedPlaces.has(place.google_id)}
                      onChange={() => togglePlace(place.google_id)}
                      disabled={importing}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
                    />
                  )}
                  {place.is_existing && (
                    <CheckCircle2 className="w-4 h-4 text-gray-400 shrink-0" />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-[#0F2744] text-sm truncate">
                        {place.name}
                      </p>
                      {place.business_status !== 'OPERATIONAL' && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {place.business_status.toLowerCase().replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {place.is_existing && (
                        <Badge className="bg-gray-100 text-gray-500 border-gray-300 text-xs">
                          Already in directory
                        </Badge>
                      )}
                      {place.touchless_confidence === 'high' && (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          Likely touchless
                        </Badge>
                      )}
                      {place.touchless_confidence === 'low' && (
                        <Badge className="bg-red-100 text-red-600 border-red-300 text-xs">
                          <ShieldX className="w-3 h-3 mr-1" />
                          Probably not touchless
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{place.address}</p>
                  </div>

                  {/* Rating */}
                  {place.rating > 0 && (
                    <div className="flex items-center gap-1 text-sm shrink-0">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{place.rating.toFixed(1)}</span>
                      {place.review_count > 0 && (
                        <span className="text-gray-400 text-xs">({place.review_count})</span>
                      )}
                    </div>
                  )}

                  {/* Website link (prefer website, fall back to Google Maps) */}
                  {(place.website || place.google_maps_url) && (
                    <a
                      href={place.website || place.google_maps_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                      title={place.website ? 'Visit website' : 'View on Google Maps'}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {/* Reject / Not touchless */}
                  <button
                    onClick={() => rejectPlace(place.google_id, place.name)}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    title="Not touchless — dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Underserved States */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <Map className="w-4 h-4" />
                Underserved States (fewer than 20 listings)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCoverage ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : underservedStates.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  All states have 20+ listings!
                </p>
              ) : (
                <div className="space-y-1.5">
                  {underservedStates.map((s) => (
                    <button
                      key={s.state}
                      onClick={() => {
                        const stateName = STATE_NAMES[s.state] || s.state;
                        setCustomQuery(stateName);
                        handleSearch(stateName);
                      }}
                      disabled={searching}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#22C55E] transition-colors" />
                        <span className="text-sm font-medium text-[#0F2744]">
                          {STATE_NAMES[s.state] || s.state}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            s.count < 5
                              ? 'text-red-600 border-red-200 bg-red-50'
                              : s.count < 10
                                ? 'text-amber-600 border-amber-200 bg-amber-50'
                                : 'text-gray-600 border-gray-200'
                          }`}
                        >
                          {s.count} listings
                        </Badge>
                        <Search className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#22C55E] transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Underserved Cities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Underserved Major Cities (fewer than 5 listings)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCoverage ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : underservedCities.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  All major cities have 5+ listings!
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                  {underservedCities.map((c) => (
                    <button
                      key={c.city}
                      onClick={() => {
                        setCustomQuery(c.city);
                        handleSearch(c.city);
                      }}
                      disabled={searching}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#22C55E] transition-colors" />
                        <span className="text-sm font-medium text-[#0F2744]">{c.city}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            c.count === 0
                              ? 'text-red-600 border-red-200 bg-red-50'
                              : 'text-amber-600 border-amber-200 bg-amber-50'
                          }`}
                        >
                          {c.count === 0 ? 'No listings' : `${c.count} listings`}
                        </Badge>
                        <Search className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#22C55E] transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* How it works */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0F2744]">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium text-[#0F2744]">Pick an area</p>
                  <p className="text-gray-500">Click an underserved state or city, or type your own search.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium text-[#0F2744]">Review results</p>
                  <p className="text-gray-500">
                    Google Places results are cross-referenced with your existing directory.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium text-[#0F2744]">Import new listings</p>
                  <p className="text-gray-500">
                    Select the places you want and click Import. Basic details are pulled from Google.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#0F2744] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  4
                </div>
                <div>
                  <p className="font-medium text-[#0F2744]">Enrich later</p>
                  <p className="text-gray-500">
                    Run Photo Enrichment and Amenity Backfill to fill in photos, amenities, and more.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
