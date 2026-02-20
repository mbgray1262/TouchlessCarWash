'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Filter, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { extractDomain, domainToVendorName } from './utils';
import { StatsBar } from './StatsBar';
import { ReadyToLinkSection } from './ReadyToLinkSection';
import { NewVendorsSection } from './NewVendorsSection';
import { MatchStats, ReadyToLink, NewVendorRow, SessionSummary } from './types';

export default function VendorMatchingPage() {
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState('');
  const [stats, setStats] = useState<MatchStats>({ totalUnmatched: 0, readyToLink: 0, newDomains: 0, newChains: 0, newStandalone: 0 });
  const [readyRows, setReadyRows] = useState<ReadyToLink[]>([]);
  const [newRows, setNewRows] = useState<NewVendorRow[]>([]);
  const [filter, setFilter] = useState('');
  const [chainsOnly, setChainsOnly] = useState(false);
  const [session, setSession] = useState<SessionSummary>({ vendorsLinked: 0, vendorsCreated: 0, listingsUpdated: 0 });
  const [hasActivity, setHasActivity] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const PAGE = 1000;
      let allListings: { id: string; name: string; website: string }[] = [];
      let from = 0;
      setLoadStatus('Loading listings…');
      while (true) {
        const { data, error } = await supabase
          .from('listings')
          .select('id, name, website')
          .is('vendor_id', null)
          .not('website', 'is', null)
          .range(from, from + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allListings = allListings.concat(data);
        setLoadStatus(`Loaded ${allListings.length.toLocaleString()} listings…`);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setLoadStatus('Analysing domains…');
      const listings = allListings;

      if (!listings || listings.length === 0) {
        setStats({ totalUnmatched: 0, readyToLink: 0, newDomains: 0, newChains: 0, newStandalone: 0 });
        setReadyRows([]);
        setNewRows([]);
        setLoading(false);
        return;
      }

      let allVendors: { id: number; canonical_name: string; domain: string | null }[] = [];
      let vFrom = 0;
      while (true) {
        const { data: vPage, error: vErr } = await supabase
          .from('vendors')
          .select('id, canonical_name, domain')
          .range(vFrom, vFrom + PAGE - 1);
        if (vErr || !vPage || vPage.length === 0) break;
        allVendors = allVendors.concat(vPage);
        if (vPage.length < PAGE) break;
        vFrom += PAGE;
      }

      const vendorMap = new Map<string, { id: number; name: string }>();
      for (const v of allVendors) {
        if (v.domain) vendorMap.set(v.domain.toLowerCase(), { id: v.id, name: v.canonical_name });
      }

      const domainMap = new Map<string, { ids: string[]; names: string[] }>();
      for (const l of listings) {
        if (!l.website) continue;
        const domain = extractDomain(l.website);
        if (!domain) continue;
        const existing = domainMap.get(domain) ?? { ids: [], names: [] };
        existing.ids.push(l.id);
        existing.names.push(l.name);
        domainMap.set(domain, existing);
      }

      const ready: ReadyToLink[] = [];
      const newVendors: NewVendorRow[] = [];

      for (const domain of Array.from(domainMap.keys())) {
        const { ids, names } = domainMap.get(domain)!;
        const vendor = vendorMap.get(domain);
        if (vendor) {
          ready.push({ domain, vendorId: vendor.id, vendorName: vendor.name, listingCount: ids.length, listingIds: ids });
        } else {
          const isChain = ids.length >= 3;
          newVendors.push({
            domain,
            listingCount: ids.length,
            listingIds: ids,
            sampleNames: names.slice(0, 5),
            isChain,
            editedName: domainToVendorName(domain),
          });
        }
      }

      newVendors.sort((a, b) => b.listingCount - a.listingCount);
      ready.sort((a, b) => b.listingCount - a.listingCount);

      const newChains = newVendors.filter(r => r.isChain).length;

      setStats({
        totalUnmatched: listings.length,
        readyToLink: ready.length,
        newDomains: newVendors.length,
        newChains,
        newStandalone: newVendors.length - newChains,
      });
      setReadyRows(ready);
      setNewRows(newVendors);
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
            <p className="text-sm">{loadStatus || 'Loading…'}</p>
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
