'use client';

import { useState, useEffect } from 'react';
import { Link2, Loader2, CheckCircle2, AlertCircle, ExternalLink, Search, Play, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/AdminNav';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface ChainWithParentUrls {
  id: number;
  canonical_name: string;
  domain: string;
  parent_url_count: number;
}

interface MatchResult {
  listing_id: string;
  listing_name: string;
  city: string;
  state: string;
  old_url: string | null;
  new_url: string;
  matched_by: string;
}

interface BackfillResult {
  vendor_name: string;
  domain: string;
  total_listings: number;
  listings_needing_urls: number;
  location_links_found: number;
  matched: number;
  unmatched_count: number;
  dry_run: boolean;
  results: MatchResult[];
  unmatched: Array<{ id: string; name: string; city: string; state: string }>;
}

type RunState = 'idle' | 'running' | 'done' | 'error';

interface VendorRun {
  vendorId: number;
  vendorName: string;
  locationsUrl: string;
  state: RunState;
  result: BackfillResult | null;
  error: string | null;
  showDetails: boolean;
}

export default function ChainUrlBackfillPage() {
  const { toast } = useToast();
  const [chains, setChains] = useState<ChainWithParentUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [runs, setRuns] = useState<Record<number, VendorRun>>({});
  const [locationsUrls, setLocationsUrls] = useState<Record<number, string>>({});
  const [minScore, setMinScore] = useState(75);
  const [globalRunning, setGlobalRunning] = useState(false);

  useEffect(() => {
    fetchChains();
  }, []);

  const fetchChains = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_chains_with_parent_urls');
      if (error) throw error;
      setChains((data as ChainWithParentUrls[]) || []);
    } catch {
      const { data } = await supabase
        .from('vendors')
        .select('id, canonical_name, domain')
        .eq('is_chain', true)
        .not('domain', 'is', null)
        .order('canonical_name');
      setChains((data || []).map((v: { id: number; canonical_name: string; domain: string }) => ({ ...v, parent_url_count: 0 })));
    } finally {
      setLoading(false);
    }
  };

  const guessLocationsUrl = (domain: string): string => {
    return `https://www.${domain}/locations`;
  };

  const getLocationsUrl = (vendor: ChainWithParentUrls): string => {
    return locationsUrls[vendor.id] ?? guessLocationsUrl(vendor.domain);
  };

  const runBackfill = async (vendor: ChainWithParentUrls, dryRun: boolean) => {
    const locationsUrl = getLocationsUrl(vendor);
    if (!locationsUrl.trim()) {
      toast({ title: 'Error', description: 'Please enter a locations page URL', variant: 'destructive' });
      return;
    }

    setRuns(prev => ({
      ...prev,
      [vendor.id]: {
        vendorId: vendor.id,
        vendorName: vendor.canonical_name,
        locationsUrl,
        state: 'running',
        result: null,
        error: null,
        showDetails: true,
      },
    }));

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/chain-url-backfill`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vendor_id: vendor.id,
          locations_url: locationsUrl,
          dry_run: dryRun,
          min_score: minScore,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Request failed');

      setRuns(prev => ({
        ...prev,
        [vendor.id]: {
          ...prev[vendor.id],
          state: 'done',
          result: data as BackfillResult,
        },
      }));

      if (!dryRun) {
        fetchChains();
      }
    } catch (err) {
      setRuns(prev => ({
        ...prev,
        [vendor.id]: {
          ...prev[vendor.id],
          state: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      }));
    }
  };

  const toggleDetails = (vendorId: number) => {
    setRuns(prev => ({
      ...prev,
      [vendorId]: { ...prev[vendorId], showDetails: !prev[vendorId].showDetails },
    }));
  };

  const filteredChains = chains.filter(c =>
    !searchQuery ||
    c.canonical_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalParentUrls = chains.reduce((sum, c) => sum + (c.parent_url_count || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Link2 className="w-6 h-6 text-[#0F2744]" />
            <h1 className="text-2xl font-bold text-[#0F2744]">Chain URL Backfill</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            For chain car washes where listings point to the parent company URL, scrape the chain&apos;s locations page to find and assign individual location URLs.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-[#0F2744]">{chains.length}</div>
              <div className="text-sm text-gray-500">Chains with Parent URLs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-amber-600">{totalParentUrls.toLocaleString()}</div>
              <div className="text-sm text-gray-500">Listings Needing Individual URLs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(runs).filter(r => r.state === 'done' && r.result && !r.result.dry_run).reduce((sum, r) => sum + (r.result?.matched || 0), 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">URLs Updated This Session</div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-5">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Search Chains</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Filter by name or domain..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-40">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Min Match Score</label>
                <Input
                  type="number"
                  min={50}
                  max={100}
                  value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredChains.map(vendor => {
              const run = runs[vendor.id];
              const locUrl = getLocationsUrl(vendor);

              return (
                <Card key={vendor.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[#0F2744]">{vendor.canonical_name}</span>
                            {vendor.parent_url_count > 0 && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">
                                {vendor.parent_url_count} parent URLs
                              </Badge>
                            )}
                            {run?.state === 'done' && run.result && !run.result.dry_run && (
                              <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                {run.result.matched} updated
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mb-3">
                            <span className="text-xs text-gray-400">{vendor.domain}</span>
                            <a
                              href={`https://www.${vendor.domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-600"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              placeholder={`https://www.${vendor.domain}/locations`}
                              value={locationsUrls[vendor.id] ?? ''}
                              onChange={e => setLocationsUrls(prev => ({ ...prev, [vendor.id]: e.target.value }))}
                              className="text-sm h-8"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0"
                              onClick={() => runBackfill(vendor, true)}
                              disabled={run?.state === 'running'}
                            >
                              {run?.state === 'running' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Search className="w-3.5 h-3.5" />
                              )}
                              <span className="ml-1.5">Preview</span>
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 shrink-0 bg-[#0F2744] hover:bg-[#1e3a8a]"
                              onClick={() => runBackfill(vendor, false)}
                              disabled={run?.state === 'running'}
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span className="ml-1.5">Apply</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {run && (
                        <div className="mt-4">
                          {run.state === 'running' && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Scraping locations page and matching listings...
                            </div>
                          )}

                          {run.state === 'error' && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              {run.error}
                            </div>
                          )}

                          {run.state === 'done' && run.result && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex gap-4 text-sm">
                                  <span className="text-gray-500">
                                    <span className="font-medium text-gray-800">{run.result.location_links_found}</span> location links found
                                  </span>
                                  <span className="text-green-600">
                                    <span className="font-medium">{run.result.matched}</span> matched
                                  </span>
                                  {run.result.unmatched_count > 0 && (
                                    <span className="text-amber-600">
                                      <span className="font-medium">{run.result.unmatched_count}</span> unmatched
                                    </span>
                                  )}
                                  {run.result.dry_run && (
                                    <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-xs">Preview only</Badge>
                                  )}
                                </div>
                                {run.result.results.length > 0 && (
                                  <button
                                    onClick={() => toggleDetails(vendor.id)}
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                  >
                                    {run.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    {run.showDetails ? 'Hide' : 'Show'} matches
                                  </button>
                                )}
                              </div>

                              {run.showDetails && run.result.results.length > 0 && (
                                <div className="border border-gray-100 rounded-lg overflow-hidden mt-2">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                      <tr>
                                        <th className="text-left px-3 py-2 font-medium text-gray-500">Location</th>
                                        <th className="text-left px-3 py-2 font-medium text-gray-500">New URL</th>
                                        <th className="text-left px-3 py-2 font-medium text-gray-500">Match</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {run.result.results.map(r => (
                                        <tr key={r.listing_id} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-gray-700">
                                            {r.listing_name} — {r.city}, {r.state}
                                          </td>
                                          <td className="px-3 py-2">
                                            <a
                                              href={r.new_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                              <span className="truncate max-w-[280px] block">{r.new_url}</span>
                                              <ExternalLink className="w-3 h-3 shrink-0" />
                                            </a>
                                          </td>
                                          <td className="px-3 py-2 text-gray-400">{r.matched_by}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {run.showDetails && run.result.unmatched.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs text-amber-700 font-medium mb-1">Could not match ({run.result.unmatched.length}):</p>
                                  <div className="flex flex-wrap gap-1">
                                    {run.result.unmatched.map(u => (
                                      <span key={u.id} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5">
                                        {u.city}, {u.state}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
