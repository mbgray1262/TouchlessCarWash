'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, ExternalLink,
  RefreshCw, AlertTriangle, Car, Hand, Zap, ChevronDown, ChevronUp,
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

type Action = 'reclassify' | 'mark_not_touchless' | 'mark_self_service';
type RowStatus = 'idle' | 'loading' | 'done' | 'error';

interface RowState {
  status: RowStatus;
  result?: string;
  error?: string;
}

const STRONG_TOUCHLESS_KEYWORDS = [
  'laser wash', 'laserwash', 'laser car wash',
  'touchless automatic', 'automatic touchless',
  'touchless tunnel', 'touchless wash',
  'touch-free automatic', 'automatic touch-free',
  'touchless in-bay', 'in-bay touchless',
  'no-touch automatic', 'automatic no-touch',
  'brushless automatic', 'automatic brushless',
  'contactless automatic',
  '24/7 touchless', 'touchless tech',
  'touchless wash club', 'touchless car wash',
];

function hasStrongTouchlessEvidence(evidence: string | null): boolean {
  if (!evidence) return false;
  const lower = evidence.toLowerCase();
  return STRONG_TOUCHLESS_KEYWORDS.some(kw => lower.includes(kw));
}

export default function SelfServiceAuditPage() {
  const [allListings, setAllListings] = useState<SuspectListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoFixing, setAutoFixing] = useState(false);
  const [autoFixResult, setAutoFixResult] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('id, name, city, state, website, amenities, touchless_evidence, is_touchless, is_self_service, slug')
      .eq('is_touchless', true)
      .eq('is_self_service', true)
      .order('state')
      .order('name');

    if (!error && data) {
      const ambiguous = (data as SuspectListing[]).filter(
        l => !hasStrongTouchlessEvidence(l.touchless_evidence)
      );
      setAllListings(ambiguous);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

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
        setRowState(listing.id, { status: 'done', result: `Re-classified → ${label}` });
        setAllListings(prev => prev.filter(l => l.id !== listing.id));
      } else if (action === 'mark_not_touchless') {
        await supabase.from('listings').update({
          is_touchless: false,
          is_self_service: true,
          touchless_confidence: 'high',
          classification_confidence: 100,
        }).eq('id', listing.id);
        setRowState(listing.id, { status: 'done', result: 'Marked: not touchless / self-service only' });
        setAllListings(prev => prev.filter(l => l.id !== listing.id));
      } else if (action === 'mark_self_service') {
        await supabase.from('listings').update({ is_self_service: true }).eq('id', listing.id);
        setRowState(listing.id, { status: 'done', result: 'Confirmed hybrid (touchless + self-service)' });
        setAllListings(prev => prev.filter(l => l.id !== listing.id));
      }
    } catch (e) {
      setRowState(listing.id, { status: 'error', error: (e as Error).message });
    }
  }

  async function handleAutoFixAll() {
    setAutoFixing(true);
    setAutoFixResult(null);

    const { error, count } = await supabase
      .from('listings')
      .update({
        is_touchless: false,
        touchless_confidence: 'high',
        classification_confidence: 100,
      })
      .eq('is_touchless', true)
      .eq('is_self_service', true)
      .in('id', allListings.map(l => l.id));

    if (error) {
      setAutoFixResult(`Error: ${error.message}`);
    } else {
      setAutoFixResult(`Done — ${allListings.length} listings marked not touchless.`);
      setAllListings([]);
    }
    setAutoFixing(false);
  }

  const pagedListings = allListings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(allListings.length / PAGE_SIZE);
  const resolvedCount = Object.values(rowStates).filter(s => s.status === 'done').length;

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
            onClick={fetchListings}
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
            These listings are tagged <strong>touchless = yes</strong> and <strong>self-service = yes</strong>,
            but their evidence does not contain strong independent touchless keywords (e.g. laser wash,
            touchless automatic, touch-free). They may be self-service only, mislabeled by an older AI prompt
            that called wand washes "touchless by definition."
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-[#0F2744]">{allListings.length.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-0.5">Ambiguous listings</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-amber-600">{pagedListings.filter(l => !rowStates[l.id]).length}</p>
            <p className="text-sm text-gray-500 mt-0.5">This page unresolved</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-emerald-600">{resolvedCount}</p>
            <p className="text-sm text-gray-500 mt-0.5">Resolved this session</p>
          </div>
        </div>

        {allListings.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Zap className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-800 mb-1">AI Auto-Fix All ({allListings.length.toLocaleString()} listings)</p>
              <p className="text-sm text-rose-700 mb-3">
                None of these listings have strong automated-touchless evidence. Click below to mark all of them
                as <strong>not touchless</strong> in one shot. They will remain tagged as self-service.
                This is the same logic that was just used to fix 901 listings automatically.
              </p>
              {autoFixResult ? (
                <p className={`text-sm font-medium ${autoFixResult.startsWith('Error') ? 'text-red-600' : 'text-emerald-700'}`}>
                  {autoFixResult.startsWith('Error') ? <XCircle className="w-3.5 h-3.5 inline mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
                  {autoFixResult}
                </p>
              ) : (
                <Button
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={handleAutoFixAll}
                  disabled={autoFixing}
                >
                  {autoFixing ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Fixing...</>
                  ) : (
                    <><Zap className="w-3.5 h-3.5 mr-1.5" /> Mark all {allListings.length.toLocaleString()} as not touchless</>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Manual review options (per listing)</p>
            <ul className="space-y-1 list-disc list-inside text-amber-700">
              <li><strong>Re-classify</strong> — re-runs AI on the website with the corrected prompt</li>
              <li><strong>Not touchless</strong> — self-service only, no automated touchless tunnel</li>
              <li><strong>Confirm hybrid</strong> — genuinely offers both; keeps touchless = yes and removes from this list</li>
            </ul>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : allListings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-700 mb-1">All clear!</p>
            <p className="text-sm text-gray-400">No ambiguous listings remaining. All self-service washes are correctly classified.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allListings.length)} of {allListings.length.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              {pagedListings.map(listing => {
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
                          <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">weak touchless evidence</Badge>
                        </div>
                        {listing.website && (
                          <a
                            href={listing.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
                          >
                            {listing.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
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
                            >
                              <Car className="w-3 h-3" /> Not touchless
                            </button>
                            <button
                              onClick={() => handleAction(listing, 'mark_self_service')}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-medium transition-colors"
                            >
                              <Hand className="w-3 h-3" /> Confirm hybrid
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

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-500">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page + 1 >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
