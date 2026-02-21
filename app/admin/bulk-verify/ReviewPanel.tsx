'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Filter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, inferClassificationFromListing } from './utils';
import { ReviewCard } from './ReviewCard';
import type { PipelineListing, ClassificationLabel } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PAGE_SIZE = 20;

type FilterClassification = ClassificationLabel | 'all';
type FilterSource = 'all' | 'chain' | 'standalone';

interface Props {
  refreshTrigger: number;
}

export function ReviewPanel({ refreshTrigger }: Props) {
  const [listings, setListings] = useState<PipelineListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterClass, setFilterClass] = useState<FilterClassification>('all');
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterState, setFilterState] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);

  const classificationCounts = {
    confirmed_touchless: listings.filter(l => inferClassificationFromListing(l) === 'confirmed_touchless').length,
    likely_touchless: listings.filter(l => inferClassificationFromListing(l) === 'likely_touchless').length,
    not_touchless: listings.filter(l => inferClassificationFromListing(l) === 'not_touchless').length,
    uncertain: listings.filter(l => inferClassificationFromListing(l) === 'uncertain').length,
  };

  const fetchListings = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from('listings')
        .select('id,name,address,city,state,website,parent_chain,verification_status,crawl_status,crawl_notes,is_touchless,touchless_confidence,classification_confidence,classification_source,touchless_evidence,hero_image,logo_url,photos,blocked_photos,amenities,is_approved,last_crawled_at')
        .eq('verification_status', 'auto_classified')
        .order('classification_confidence', { ascending: true, nullsFirst: true })
        .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterState) query = query.eq('state', filterState.toUpperCase());
      if (filterSource === 'chain') query = query.not('parent_chain', 'is', null);
      if (filterSource === 'standalone') query = query.is('parent_chain', null);

      const { data, error } = await query;
      if (error || !data) return;

      const filtered = filterClass === 'all'
        ? data
        : data.filter(l => inferClassificationFromListing(l as PipelineListing) === filterClass);

      setListings(prev => reset ? filtered as PipelineListing[] : [...prev, ...filtered as PipelineListing[]]);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterSource, filterState]);

  useEffect(() => {
    setPage(0);
    setListings([]);
    fetchListings(0, true);
  }, [filterClass, filterSource, filterState, refreshTrigger]);

  function handleUpdate(id: string, updates: Partial<PipelineListing>) {
    setListings(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }

  async function approveAllConfirmed() {
    setApprovingAll(true);
    const confirmed = listings.filter(l => inferClassificationFromListing(l) === 'confirmed_touchless');
    for (const listing of confirmed) {
      await supabase.from('listings').update({
        is_approved: true,
        is_touchless: true,
        verification_status: 'approved',
      }).eq('id', listing.id);
      handleUpdate(listing.id, { is_approved: true, is_touchless: true, verification_status: 'approved' });
    }
    setApprovingAll(false);
  }

  async function approveAllPage() {
    setApprovingAll(true);
    for (const listing of listings) {
      await supabase.from('listings').update({
        is_approved: true,
        verification_status: 'approved',
      }).eq('id', listing.id);
      handleUpdate(listing.id, { is_approved: true, verification_status: 'approved' });
    }
    setApprovingAll(false);
  }

  const visibleListings = listings.filter(l => l.verification_status === 'auto_classified');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Step 3: Human Review
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={approveAllConfirmed}
              disabled={approvingAll || classificationCounts.confirmed_touchless === 0}
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs"
            >
              {approvingAll ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Approve All Confirmed ({classificationCounts.confirmed_touchless})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={approveAllPage}
              disabled={approvingAll || visibleListings.length === 0}
              className="text-xs"
            >
              Approve All on Page ({visibleListings.length})
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { key: 'uncertain', label: 'Uncertain', color: 'bg-amber-50 border-amber-200 text-amber-800' },
            { key: 'likely_touchless', label: 'Likely Touchless', color: 'bg-teal-50 border-teal-200 text-teal-800' },
            { key: 'confirmed_touchless', label: 'Confirmed', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
            { key: 'not_touchless', label: 'Not Touchless', color: 'bg-red-50 border-red-200 text-red-800' },
          ] as const).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilterClass(filterClass === key ? 'all' : key)}
              className={`rounded-lg border p-2.5 text-center transition-all ${color} ${filterClass === key ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'}`}
            >
              <p className="text-lg font-bold tabular-nums">{classificationCounts[key]}</p>
              <p className="text-xs">{label}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
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
            placeholder="Filter by state (e.g. CA)"
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {loading && listings.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading listings...
          </div>
        ) : visibleListings.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No listings awaiting review with current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleListings.map(listing => (
              <ReviewCard key={listing.id} listing={listing} onUpdate={handleUpdate} />
            ))}

            {hasMore && (
              <div className="text-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { const next = page + 1; setPage(next); fetchListings(next); }}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
