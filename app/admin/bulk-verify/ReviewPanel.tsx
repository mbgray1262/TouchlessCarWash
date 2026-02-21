'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Filter, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, inferClassificationFromListing } from './utils';
import { ReviewCard } from './ReviewCard';
import type { PipelineListing, ClassificationLabel } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PAGE_SIZE = 20;

type FilterSource = 'all' | 'chain' | 'standalone';

interface Props {
  refreshTrigger: number;
  filterClassification: ClassificationLabel | 'all';
  onFilterChange: (f: ClassificationLabel | 'all') => void;
}

const CLASSIFICATION_TABS: { key: ClassificationLabel | 'all'; label: string; inactiveClass: string; activeClass: string }[] = [
  { key: 'all', label: 'All', inactiveClass: 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100', activeClass: 'bg-[#0F2744] border-[#0F2744] text-white' },
  { key: 'uncertain', label: 'Uncertain', inactiveClass: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100', activeClass: 'bg-amber-500 border-amber-500 text-white' },
  { key: 'likely_touchless', label: 'Likely Touchless', inactiveClass: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100', activeClass: 'bg-teal-600 border-teal-600 text-white' },
  { key: 'confirmed_touchless', label: 'Confirmed', inactiveClass: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100', activeClass: 'bg-green-600 border-green-600 text-white' },
  { key: 'not_touchless', label: 'Not Touchless', inactiveClass: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', activeClass: 'bg-red-500 border-red-500 text-white' },
];

export function ReviewPanel({ refreshTrigger, filterClassification, onFilterChange }: Props) {
  const [listings, setListings] = useState<PipelineListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterState, setFilterState] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({
    all: 0, uncertain: 0, likely_touchless: 0, confirmed_touchless: 0, not_touchless: 0,
  });

  const fetchCountsForTabs = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('is_touchless,touchless_confidence')
      .eq('verification_status', 'auto_classified');
    if (!data) return;
    const counts: Record<string, number> = { all: data.length, uncertain: 0, likely_touchless: 0, confirmed_touchless: 0, not_touchless: 0 };
    for (const row of data) {
      const cls = inferClassificationFromListing(row as PipelineListing);
      if (cls && cls in counts) counts[cls]++;
    }
    setClassCounts(counts);
  }, []);

  const fetchListings = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      let countQuery = supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'auto_classified');
      let dataQuery = supabase
        .from('listings')
        .select('id,name,address,city,state,website,parent_chain,verification_status,crawl_status,crawl_notes,is_touchless,touchless_confidence,classification_confidence,classification_source,touchless_evidence,hero_image,logo_url,photos,blocked_photos,amenities,is_approved,last_crawled_at')
        .eq('verification_status', 'auto_classified')
        .order('classification_confidence', { ascending: true, nullsFirst: true })
        .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterState) {
        const st = filterState.toUpperCase();
        countQuery = countQuery.eq('state', st);
        dataQuery = dataQuery.eq('state', st);
      }
      if (filterSource === 'chain') {
        countQuery = countQuery.not('parent_chain', 'is', null);
        dataQuery = dataQuery.not('parent_chain', 'is', null);
      } else if (filterSource === 'standalone') {
        countQuery = countQuery.is('parent_chain', null);
        dataQuery = dataQuery.is('parent_chain', null);
      }

      const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery]);

      if (!error && data) {
        if (filterClassification === 'all') {
          setListings(data as PipelineListing[]);
          setTotalCount(count ?? 0);
        } else {
          const filtered = (data as PipelineListing[]).filter(
            l => inferClassificationFromListing(l) === filterClassification
          );
          setListings(filtered);
          setTotalCount(classCounts[filterClassification] ?? filtered.length);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [filterClassification, filterSource, filterState, classCounts]);

  useEffect(() => {
    setPage(0);
    setListings([]);
    fetchCountsForTabs();
    fetchListings(0);
  }, [filterClassification, filterSource, filterState, refreshTrigger]);

  useEffect(() => {
    if (page > 0) fetchListings(page);
  }, [page]);

  function handleUpdate(id: string, updates: Partial<PipelineListing>) {
    setListings(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }

  async function approveAllConfirmed() {
    setApprovingAll(true);
    const confirmed = listings.filter(l => inferClassificationFromListing(l) === 'confirmed_touchless');
    for (const listing of confirmed) {
      await supabase.from('listings').update({
        is_approved: true, is_touchless: true, verification_status: 'approved',
      }).eq('id', listing.id);
      handleUpdate(listing.id, { is_approved: true, is_touchless: true, verification_status: 'approved' });
    }
    setApprovingAll(false);
    fetchCountsForTabs();
  }

  async function approveAllOnPage() {
    setApprovingAll(true);
    const visible = listings.filter(l => l.verification_status === 'auto_classified');
    for (const listing of visible) {
      await supabase.from('listings').update({
        is_approved: true, verification_status: 'approved',
      }).eq('id', listing.id);
      handleUpdate(listing.id, { is_approved: true, verification_status: 'approved' });
    }
    setApprovingAll(false);
    fetchCountsForTabs();
  }

  const visibleListings = listings.filter(l => l.verification_status === 'auto_classified');
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const confirmedCount = classCounts.confirmed_touchless ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Step 3: Human Review
              {classCounts.all > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {classCounts.all.toLocaleString()} waiting
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Review auto-classified listings and approve or reject each one.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={approveAllConfirmed}
              disabled={approvingAll || confirmedCount === 0}
              className="text-green-700 border-green-200 hover:bg-green-50 text-xs"
            >
              {approvingAll
                ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Approve All Confirmed ({confirmedCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={approveAllOnPage}
              disabled={approvingAll || visibleListings.length === 0}
              className="text-xs"
            >
              Approve This Page ({visibleListings.length})
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-4">
          {CLASSIFICATION_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                filterClassification === tab.key ? tab.activeClass : tab.inactiveClass
              }`}
            >
              {tab.label}
              {classCounts[tab.key] !== undefined && classCounts[tab.key] > 0 && (
                <span className={`rounded-full px-1.5 py-px text-xs font-bold tabular-nums leading-none ${
                  filterClassification === tab.key
                    ? 'bg-white text-gray-700'
                    : 'bg-current/10'
                }`}>
                  {(classCounts[tab.key] ?? 0).toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap bg-gray-50/50">
        <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value as FilterSource)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        >
          <option value="all">All sources</option>
          <option value="chain">Chains only</option>
          <option value="standalone">Standalone only</option>
        </select>
        <input
          type="text"
          placeholder="State (e.g. CA)"
          value={filterState}
          onChange={e => setFilterState(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        />
        {totalCount > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {totalCount.toLocaleString()} total · page {page + 1} of {totalPages}
          </span>
        )}
      </div>

      <div className="px-6 py-4">
        {loading && listings.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : classCounts.all === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Review queue is empty</p>
            <p className="text-xs text-gray-400 mt-1">Run Steps 0–2 above to populate the review queue.</p>
          </div>
        ) : visibleListings.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No listings match the current filters.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleListings.map(listing => (
                <ReviewCard key={listing.id} listing={listing} onUpdate={handleUpdate} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0 }); }}
                  disabled={page === 0 || loading}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <span className="text-xs text-gray-500">
                  Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} listings
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0 }); }}
                  disabled={page >= totalPages - 1 || loading}
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
