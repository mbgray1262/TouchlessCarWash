'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, ExternalLink,
  RefreshCw, AlertTriangle, Car, Hand, HelpCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const SUPABASE_FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface SuspectListing {
  id: string;
  name: string;
  city: string;
  state: string;
  website: string | null;
  amenities: string[] | null;
  touchless_evidence: string | null;
  is_touchless: boolean | null;
  is_self_service: boolean | null;
  slug: string;
}

type Action = 'reclassify' | 'mark_not_touchless' | 'mark_self_service' | 'keep';
type RowStatus = 'idle' | 'loading' | 'done' | 'error';

interface RowState {
  status: RowStatus;
  result?: string;
  error?: string;
}

export default function SelfServiceAuditPage() {
  const [listings, setListings] = useState<SuspectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const fetchListings = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error } = await supabase
      .from('listings')
      .select('id, name, city, state, website, amenities, touchless_evidence, is_touchless, is_self_service, slug', { count: 'exact' })
      .eq('is_touchless', true)
      .eq('is_self_service', true)
      .order('state')
      .order('name')
      .range(from, to);

    if (!error && data) {
      setListings(data as SuspectListing[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchListings(page);
  }, [fetchListings, page]);

  const setRowState = (id: string, state: RowState) =>
    setRowStates(prev => ({ ...prev, [id]: state }));

  async function handleAction(listing: SuspectListing, action: Action) {
    setRowState(listing.id, { status: 'loading' });

    try {
      if (action === 'reclassify') {
        if (!listing.website) {
          setRowState(listing.id, { status: 'error', error: 'No website — cannot reclassify' });
          return;
        }
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/classify-one`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_id: listing.id, force: true }),
        });
        const data = await res.json();
        const label = data.is_touchless === true ? 'Touchless' : data.is_touchless === false ? 'Not touchless' : 'Unknown';
        setRowState(listing.id, { status: 'done', result: `Reclassified → ${label}` });
        if (data.is_touchless !== true) {
          setListings(prev => prev.filter(l => l.id !== listing.id));
        }
      } else if (action === 'mark_not_touchless') {
        await supabase.from('listings').update({
          is_touchless: false,
          is_self_service: true,
          touchless_confidence: 'high',
          classification_confidence: 100,
        }).eq('id', listing.id);
        setRowState(listing.id, { status: 'done', result: 'Marked not touchless + self-service' });
        setListings(prev => prev.filter(l => l.id !== listing.id));
      } else if (action === 'mark_self_service') {
        await supabase.from('listings').update({ is_self_service: true }).eq('id', listing.id);
        setRowState(listing.id, { status: 'done', result: 'Tagged as self-service (kept touchless)' });
      } else if (action === 'keep') {
        await supabase.from('listings').update({ is_self_service: false }).eq('id', listing.id);
        setRowState(listing.id, { status: 'done', result: 'Confirmed touchless — not self-service only' });
        setListings(prev => prev.filter(l => l.id !== listing.id));
      }
    } catch (e) {
      setRowState(listing.id, { status: 'error', error: (e as Error).message });
    }
  }

  async function handleBulkReclassify() {
    const withWebsite = listings.filter(l => l.website && !rowStates[l.id]);
    for (const listing of withWebsite) {
      await handleAction(listing, 'reclassify');
    }
  }

  const pendingCount = listings.filter(l => !rowStates[l.id] || rowStates[l.id].status === 'idle').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 max-w-6xl py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/import">
                <ArrowLeft className="w-4 h-4 mr-1" /> Import
              </Link>
            </Button>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-[#0F2744]">Self-Service Audit</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchListings(page)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0F2744] mb-1">Self-Service Audit</h1>
          <p className="text-gray-500 text-sm">
            These listings are marked <strong>touchless = yes</strong> AND <strong>self-service = yes</strong> — meaning
            the AI found evidence of both. These are <em>hybrid washes</em> that may offer automated touchless
            service alongside self-serve bays, but each one needs a human check. Listings with self-service evidence
            and <em>no</em> touchless keywords were already automatically corrected.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-[#0F2744]">{totalCount.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-0.5">Suspect listings</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-sm text-gray-500 mt-0.5">This page pending</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-emerald-600">
              {Object.values(rowStates).filter(s => s.status === 'done').length}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Resolved this session</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">How to review each listing</p>
            <ul className="space-y-1 list-disc list-inside text-amber-700">
              <li><strong>Re-classify</strong> — re-runs AI on the website with the corrected prompt (best option when in doubt)</li>
              <li><strong>Not touchless</strong> — the wash is self-service only with no automated touchless tunnel</li>
              <li><strong>Tag self-service</strong> — genuinely offers both automated touchless AND self-serve bays; keeps touchless = yes</li>
              <li><strong>Confirm touchless</strong> — the self-service mention is incidental (e.g. free vacuums); it is a genuine automated touchless wash</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkReclassify}
            disabled={loading || pendingCount === 0}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Re-classify all on page ({pendingCount})
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-700 mb-1">All clear!</p>
            <p className="text-sm text-gray-400">No suspect listings remaining on this page.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {listings.map(listing => {
              const rowState = rowStates[listing.id];
              const isExpanded = expandedId === listing.id;

              return (
                <div
                  key={listing.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{listing.name}</span>
                        <span className="text-sm text-gray-400">{listing.city}, {listing.state}</span>
                        {listing.is_self_service && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">self-service tagged</Badge>
                        )}
                      </div>
                      {listing.website && (
                        <a
                          href={listing.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
                        >
                          {listing.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : listing.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 shrink-0"
                    >
                      Evidence
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {rowState?.status === 'loading' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                      {rowState?.status === 'done' && (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {rowState.result}
                        </span>
                      )}
                      {rowState?.status === 'error' && (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> {rowState.error}
                        </span>
                      )}
                      {(!rowState || rowState.status === 'idle') && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleAction(listing, 'reclassify')}
                            disabled={!listing.website}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title={listing.website ? 'Re-run AI classification' : 'No website'}
                          >
                            <RefreshCw className="w-3 h-3" /> Re-classify
                          </button>
                          <button
                            onClick={() => handleAction(listing, 'mark_not_touchless')}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-medium transition-colors"
                            title="Mark as not touchless + self-service"
                          >
                            <Car className="w-3 h-3" /> Not touchless
                          </button>
                          <button
                            onClick={() => handleAction(listing, 'mark_self_service')}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-medium transition-colors"
                            title="Tag as self-service but keep touchless = yes (hybrid wash)"
                          >
                            <Hand className="w-3 h-3" /> Tag self-service
                          </button>
                          <button
                            onClick={() => handleAction(listing, 'keep')}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-medium transition-colors"
                            title="Confirm this is a genuine automated touchless wash"
                          >
                            <HelpCircle className="w-3 h-3" /> Confirm touchless
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                      {listing.touchless_evidence && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">AI Evidence</p>
                          <p className="text-sm text-gray-600 italic">"{listing.touchless_evidence}"</p>
                        </div>
                      )}
                      {listing.amenities && listing.amenities.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Amenities</p>
                          <div className="flex flex-wrap gap-1">
                            {listing.amenities.map(a => (
                              <span
                                key={a}
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  a.toLowerCase().includes('self') || a.toLowerCase().includes('wand')
                                    ? 'bg-amber-100 text-amber-700 border-amber-200 font-medium'
                                    : 'bg-white text-gray-500 border-gray-200'
                                }`}
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <a
                          href={`/state/${listing.state.toLowerCase()}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                        >
                          View public listing <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
