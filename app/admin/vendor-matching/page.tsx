'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Filter, Loader2 } from 'lucide-react';
import { domainToVendorName } from './utils';
import { StatsBar } from './StatsBar';
import { ReadyToLinkSection } from './ReadyToLinkSection';
import { NewVendorsSection } from './NewVendorsSection';
import { MatchStats, ReadyToLink, NewVendorRow, SessionSummary } from './types';
import { CleanVendorNamesButton } from '@/components/CleanVendorNamesButton';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function VendorMatchingPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<MatchStats>({ totalUnmatched: 0, readyToLink: 0, newDomains: 0, newChains: 0, newStandalone: 0 });
  const [readyRows, setReadyRows] = useState<ReadyToLink[]>([]);
  const [newRows, setNewRows] = useState<NewVendorRow[]>([]);
  const [filter, setFilter] = useState('');
  const [chainsOnly, setChainsOnly] = useState(false);
  const [session, setSession] = useState<SessionSummary>({ vendorsLinked: 0, vendorsCreated: 0, listingsUpdated: 0 });
  const [hasActivity, setHasActivity] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-domain-analysis`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const rows: {
        domain: string;
        listing_count: number;
        listing_ids: string[];
        sample_names: string[];
        vendor_id: number | null;
        vendor_name: string | null;
      }[] = await res.json();

      if (!rows || rows.length === 0) {
        setStats({ totalUnmatched: 0, readyToLink: 0, newDomains: 0, newChains: 0, newStandalone: 0 });
        setReadyRows([]);
        setNewRows([]);
        setLoading(false);
        return;
      }

      const ready: ReadyToLink[] = [];
      const newVendors: NewVendorRow[] = [];
      let totalUnmatched = 0;

      for (const row of rows) {
        totalUnmatched += row.listing_count;
        if (row.vendor_id !== null && row.vendor_name !== null) {
          ready.push({
            domain: row.domain,
            vendorId: row.vendor_id,
            vendorName: row.vendor_name,
            listingCount: row.listing_count,
            listingIds: row.listing_ids,
          });
        } else {
          const isChain = row.listing_count >= 3;
          newVendors.push({
            domain: row.domain,
            listingCount: row.listing_count,
            listingIds: row.listing_ids,
            sampleNames: row.sample_names ?? [],
            isChain,
            editedName: domainToVendorName(row.domain),
          });
        }
      }

      const newChains = newVendors.filter(r => r.isChain).length;

      setStats({
        totalUnmatched,
        readyToLink: ready.length,
        newDomains: newVendors.length,
        newChains,
        newStandalone: newVendors.length - newChains,
      });
      setReadyRows(ready);
      setNewRows(newVendors);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleLinked(listingIds: string[], _vendorId: number, count: number) {
    setSession(prev => ({
      ...prev,
      vendorsLinked: prev.vendorsLinked + 1,
      listingsUpdated: prev.listingsUpdated + count,
    }));
    setStats(prev => ({
      ...prev,
      totalUnmatched: Math.max(0, prev.totalUnmatched - listingIds.length),
      readyToLink: Math.max(0, prev.readyToLink - 1),
    }));
    setHasActivity(true);
  }

  function handleCreated(domain: string, listingIds: string[], _vendorId: number) {
    setSession(prev => ({
      ...prev,
      vendorsCreated: prev.vendorsCreated + 1,
      listingsUpdated: prev.listingsUpdated + listingIds.length,
    }));
    setStats(prev => ({
      ...prev,
      totalUnmatched: Math.max(0, prev.totalUnmatched - listingIds.length),
      newDomains: Math.max(0, prev.newDomains - 1),
    }));
    setHasActivity(true);
  }

  function handleNameChange(domain: string, name: string) {
    setNewRows(prev => prev.map(r => r.domain === domain ? { ...r, editedName: name } : r));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 max-w-7xl py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Matching</h1>
            <p className="text-sm text-gray-500 mt-1">
              Auto-match listings to vendors by website domain. Only shows listings with a website but no vendor assigned.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Re-run Analysis
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Running domain analysis…</p>
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-8 text-center">
            <p className="text-red-700 font-medium">Analysis failed</p>
            <p className="text-red-600 text-sm mt-1">{loadError}</p>
            <button
              onClick={load}
              className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <StatsBar stats={stats} />

            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by domain…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                onClick={() => setChainsOnly(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  chainsOnly
                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                Chains Only
              </button>
            </div>

            <CleanVendorNamesButton onComplete={load} />

            <ReadyToLinkSection
              rows={readyRows}
              filter={filter}
              onLinked={handleLinked}
            />

            <NewVendorsSection
              rows={newRows}
              filter={filter}
              chainsOnly={chainsOnly}
              onCreated={handleCreated}
              onNameChange={handleNameChange}
            />

            {stats.totalUnmatched === 0 && !loading && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-8 text-center">
                <p className="text-emerald-700 font-medium">All listings are matched to vendors.</p>
              </div>
            )}

            {readyRows.length === 0 && newRows.length === 0 && stats.totalUnmatched > 0 && !loading && (
              <div className="bg-gray-100 border border-gray-200 rounded-xl px-6 py-8 text-center">
                <p className="text-gray-500 text-sm">No listings with websites found that are missing a vendor.</p>
              </div>
            )}

            {hasActivity && (
              <div className="bg-white border border-gray-200 rounded-xl px-6 py-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Session Summary</p>
                <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                  <span><span className="font-bold text-gray-900">{session.vendorsLinked}</span> vendors linked</span>
                  <span><span className="font-bold text-gray-900">{session.vendorsCreated}</span> new vendors created</span>
                  <span><span className="font-bold text-gray-900">{session.listingsUpdated}</span> listings updated</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
