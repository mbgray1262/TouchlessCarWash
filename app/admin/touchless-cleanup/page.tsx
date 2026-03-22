'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, ShieldCheck, ShieldX, ExternalLink, ChevronDown, ChevronUp,
  Loader2, RefreshCw, MapPin, Star, Trash2, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface CleanupListing {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
  google_place_id: string | null;
  is_touchless: boolean | null;
  touchless_confidence: string | null;
  classification_confidence: number | null;
  classification_source: string | null;
  touchless_verified: string | null;
  touchless_evidence: string | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  touchless_review_count: number;
  review_extract_status: string | null;
  verification_status: string;
  is_approved: boolean | null;
  flagReason?: string;
}

interface ReviewSnippet {
  id: string;
  listing_id: string;
  review_text: string;
  touchless_keywords: string[];
  is_touchless_evidence: boolean;
  sentiment: string | null;
  reviewer_name: string | null;
  rating: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOUCHLESS_NAME_RE = /touchless|brushless|laserwash|laser wash|touch free|touchfree|no.?touch|friction.?free/i;

const SELECT_COLS = 'id,name,city,state,slug,google_place_id,is_touchless,touchless_confidence,classification_confidence,classification_source,touchless_verified,touchless_evidence,equipment_brand,equipment_model,touchless_review_count,review_extract_status,verification_status,is_approved';

const NEGATIVE_TEXT_PATTERNS = [
  'not touchless',
  'isn\'t touchless',
  'is not touchless',
  'not a touchless',
  'isn\'t a touchless',
  'no touchless',
  'not touch free',
  'isn\'t touch free',
  'not brush free',
  'not brushless',
  'has brushes',
  'uses brushes',
  'brush wash',
  'friction wash',
  'soft touch wash',
];

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchTier1(): Promise<CleanupListing[]> {
  // Step 1: Find listings with negative touchless evidence in reviews
  const orFilters = [
    'sentiment.eq.negative',
    ...NEGATIVE_TEXT_PATTERNS.map(p => `review_text.ilike.%${p}%`),
  ].join(',');

  const { data: negReviews } = await supabase
    .from('review_snippets')
    .select('listing_id, review_text')
    .or(orFilters);

  if (!negReviews?.length) return [];

  // Group by listing_id and pick the most damning review text for the flag reason
  const reasonMap = new Map<string, string>();
  for (const r of negReviews) {
    if (!reasonMap.has(r.listing_id)) {
      const snippet = r.review_text.length > 120 ? r.review_text.slice(0, 120) + '…' : r.review_text;
      reasonMap.set(r.listing_id, snippet);
    }
  }
  const negIds = Array.from(reasonMap.keys());

  // Step 2: Filter listings — only those without strong positive signals
  const allListings: CleanupListing[] = [];
  for (let i = 0; i < negIds.length; i += 100) {
    const batch = negIds.slice(i, i + 100);
    const { data } = await supabase
      .from('listings')
      .select(SELECT_COLS)
      .in('id', batch)
      .neq('touchless_verified', 'admin')
      .is('equipment_brand', null)
      .neq('touchless_confidence', 'high')
      .or('is_touchless.is.null,is_touchless.eq.false');
    if (data) {
      for (const listing of data) {
        allListings.push({
          ...listing,
          flagReason: `Review: "${reasonMap.get(listing.id)}"`,
        });
      }
    }
  }
  return allListings;
}

async function fetchTier2(): Promise<CleanupListing[]> {
  const { data } = await supabase
    .from('listings')
    .select(SELECT_COLS)
    .is('touchless_verified', null)
    .is('equipment_brand', null)
    .eq('touchless_review_count', 0)
    .or('is_touchless.is.null,is_touchless.eq.false')
    .or('classification_confidence.is.null,classification_confidence.lt.50')
    .order('state')
    .order('city')
    .order('name');

  if (!data) return [];

  // Client-side: exclude names that contain touchless keywords
  return data
    .filter(l => !TOUCHLESS_NAME_RE.test(l.name))
    .map(l => ({
      ...l,
      flagReason: 'No touchless evidence: no name signals, no reviews, no equipment, no verification',
    }));
}

async function fetchSnippetsForListing(listingId: string): Promise<ReviewSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('id,listing_id,review_text,touchless_keywords,is_touchless_evidence,sentiment,reviewer_name,rating')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(20);
  return data ?? [];
}

// ── Highlight Keywords ───────────────────────────────────────────────────────

function highlightKeywords(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length) return text;
  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark> : part
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, count, color, icon: Icon, description }: {
  label: string; count: number; color: 'red' | 'amber' | 'green'; icon: React.ElementType; description: string;
}) {
  const colors = {
    red: 'border-red-300 bg-red-50',
    amber: 'border-amber-300 bg-amber-50',
    green: 'border-green-300 bg-green-50',
  };
  const textColors = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    green: 'text-green-700',
  };
  return (
    <div className={`rounded-xl border-2 ${colors[color]} p-5`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-5 h-5 ${textColors[color]}`} />
        <span className={`text-sm font-semibold ${textColors[color]} uppercase tracking-wide`}>{label}</span>
      </div>
      <div className={`text-3xl font-bold ${textColors[color]}`}>{count.toLocaleString()}</div>
      <div className="text-xs text-gray-500 mt-1">{description}</div>
    </div>
  );
}

function CleanupRow({ listing, snippetsCache, onExpand, expanded, onRemove, onKeep, removing, showKeep }: {
  listing: CleanupListing;
  snippetsCache: Record<string, ReviewSnippet[]>;
  onExpand: (id: string) => void;
  expanded: boolean;
  onRemove: (id: string) => void;
  onKeep?: (id: string) => void;
  removing: string | null;
  showKeep: boolean;
}) {
  const snippets = snippetsCache[listing.id];
  const stateSlug = listing.state?.toLowerCase();
  const citySlug = listing.city?.toLowerCase().replace(/\s+/g, '-');
  const listingUrl = `/state/${stateSlug}/${citySlug}/${listing.slug}`;
  const googleUrl = listing.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`
    : `https://www.google.com/maps/search/${encodeURIComponent(`${listing.name}, ${listing.city}, ${listing.state}`)}`;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
        onClick={() => onExpand(listing.id)}
      >
        <button className="text-gray-400 flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{listing.name}</span>
            {listing.classification_source && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">
                {listing.classification_source}
              </span>
            )}
            {listing.classification_confidence != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600">
                {listing.classification_confidence}%
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">{listing.city}, {listing.state}</div>
          {listing.flagReason && (
            <div className="text-xs text-red-600 mt-0.5 truncate">{listing.flagReason}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-200" title="Google Maps">
            <MapPin className="w-4 h-4 text-gray-500" />
          </a>
          <a href={listingUrl} target="_blank" className="p-1.5 rounded hover:bg-gray-200" title="View listing">
            <ExternalLink className="w-4 h-4 text-gray-500" />
          </a>
          {showKeep && onKeep && (
            <button
              onClick={() => onKeep(listing.id)}
              disabled={removing === listing.id}
              className="px-3 py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Keep
            </button>
          )}
          <button
            onClick={() => onRemove(listing.id)}
            disabled={removing === listing.id}
            className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium disabled:opacity-50"
          >
            {removing === listing.id
              ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" />
              : <XCircle className="w-3.5 h-3.5 inline mr-1" />
            }Remove
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t bg-gray-50 px-6 py-4 space-y-3">
          {/* Listing metadata */}
          <div className="flex gap-4 text-xs text-gray-600">
            {listing.equipment_brand && (
              <span>Equipment: <b>{listing.equipment_brand} {listing.equipment_model ?? ''}</b></span>
            )}
            {listing.touchless_verified && (
              <span>Verified: <b>{listing.touchless_verified}</b></span>
            )}
            <span>Reviews mentioning touchless: <b>{listing.touchless_review_count}</b></span>
            {listing.touchless_evidence && (
              <span>Evidence: <b className="text-gray-800">{String(listing.touchless_evidence).slice(0, 100)}</b></span>
            )}
          </div>

          {/* Review snippets */}
          {snippets === undefined ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reviews...
            </div>
          ) : snippets.length === 0 ? (
            <div className="text-sm text-gray-400 italic">No review snippets found for this listing</div>
          ) : (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">Review Snippets ({snippets.length})</h4>
              {snippets.map(s => (
                <div key={s.id} className="bg-white rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {s.reviewer_name && <span className="text-xs font-medium text-gray-700">{s.reviewer_name}</span>}
                    {s.rating != null && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600">
                        <Star className="w-3 h-3 fill-amber-400" />{s.rating}
                      </span>
                    )}
                    {s.sentiment && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        s.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                        s.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {s.sentiment}
                      </span>
                    )}
                    {s.is_touchless_evidence && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">evidence</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {highlightKeywords(
                      s.review_text.length > 300 ? s.review_text.slice(0, 300) + '…' : s.review_text,
                      [...(s.touchless_keywords ?? []), ...NEGATIVE_TEXT_PATTERNS],
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TouchlessCleanupPage() {
  const [tier1, setTier1] = useState<CleanupListing[]>([]);
  const [tier2, setTier2] = useState<CleanupListing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snippetsCache, setSnippetsCache] = useState<Record<string, ReviewSnippet[]>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [batchRemoving, setBatchRemoving] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [tier2Page, setTier2Page] = useState(0);
  const PAGE_SIZE = 50;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t1, t2, countRes] = await Promise.all([
        fetchTier1(),
        fetchTier2(),
        supabase.from('listings').select('id', { count: 'exact', head: true }),
      ]);
      setTier1(t1);
      setTier2(t2);
      setTotalCount(countRes.count ?? 0);
    } catch (err) {
      console.error('Failed to load cleanup data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!snippetsCache[id]) {
      const snippets = await fetchSnippetsForListing(id);
      setSnippetsCache(prev => ({ ...prev, [id]: snippets }));
    }
  }, [expandedId, snippetsCache]);

  const handleRemove = useCallback(async (id: string) => {
    setRemovingId(id);
    try {
      await supabase.from('listings').update({
        is_approved: false,
        verification_status: 'rejected',
      }).eq('id', id);
      setTier1(prev => prev.filter(l => l.id !== id));
      setTier2(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setRemovingId(null);
    }
  }, []);

  const handleKeep = useCallback(async (id: string) => {
    setRemovingId(id);
    try {
      await supabase.from('listings').update({
        touchless_verified: 'admin',
        is_approved: true,
        verification_status: 'approved',
      }).eq('id', id);
      setTier2(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Keep failed:', err);
    } finally {
      setRemovingId(null);
    }
  }, []);

  const handleRemoveAllTier1 = useCallback(async () => {
    const ids = tier1.map(l => l.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Remove ${ids.length} listings with negative touchless evidence?\n\nThis sets is_approved=false and verification_status=rejected (soft delete — listings can be restored).`)) {
      return;
    }
    setBatchRemoving(true);
    setBatchProgress({ current: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        await supabase.from('listings').update({
          is_approved: false,
          verification_status: 'rejected',
        }).in('id', batch);
        setBatchProgress({ current: Math.min(i + 50, ids.length), total: ids.length });
      }
      setTier1([]);
    } catch (err) {
      console.error('Batch remove failed:', err);
    } finally {
      setBatchRemoving(false);
    }
  }, [tier1]);

  const tier3Count = Math.max(0, totalCount - tier1.length - tier2.length);
  const tier2Paged = tier2.slice(tier2Page * PAGE_SIZE, (tier2Page + 1) * PAGE_SIZE);
  const tier2TotalPages = Math.ceil(tier2.length / PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          Analyzing listings for touchless evidence...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Touchless Cleanup</h1>
            <p className="text-sm text-gray-500 mt-1">Identify and remove listings that aren&apos;t actually touchless car washes</p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Dashboard cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Auto-Remove"
            count={tier1.length}
            color="red"
            icon={ShieldX}
            description="Negative review evidence"
          />
          <StatCard
            label="Review Needed"
            count={tier2.length}
            color="amber"
            icon={ShieldAlert}
            description="No touchless evidence found"
          />
          <StatCard
            label="Safe"
            count={tier3Count}
            color="green"
            icon={ShieldCheck}
            description="Has evidence of touchless"
          />
        </div>

        {/* ═══ TIER 1: Auto-Remove ═══ */}
        <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 bg-red-50 border-b border-red-200">
            <div className="flex items-center gap-2">
              <ShieldX className="w-5 h-5 text-red-600" />
              <h2 className="font-bold text-red-800">Auto-Remove: Negative Evidence ({tier1.length})</h2>
            </div>
            {tier1.length > 0 && (
              <button
                onClick={handleRemoveAllTier1}
                disabled={batchRemoving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {batchRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remove All ({tier1.length})
              </button>
            )}
          </div>
          {batchRemoving && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-200">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-red-200 rounded-full h-2.5">
                  <div
                    className="bg-red-600 h-2.5 rounded-full transition-all"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-red-600 font-medium">{batchProgress.current}/{batchProgress.total}</span>
              </div>
            </div>
          )}
          <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
            {tier1.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No listings with negative touchless evidence found</p>
              </div>
            ) : (
              tier1.map(l => (
                <CleanupRow
                  key={l.id}
                  listing={l}
                  snippetsCache={snippetsCache}
                  onExpand={handleExpand}
                  expanded={expandedId === l.id}
                  onRemove={handleRemove}
                  removing={removingId}
                  showKeep={false}
                />
              ))
            )}
          </div>
        </div>

        {/* ═══ TIER 2: Review Needed ═══ */}
        <div className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-amber-800">Review Needed: No Evidence ({tier2.length})</h2>
            </div>
            {tier2TotalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <button
                  onClick={() => setTier2Page(p => Math.max(0, p - 1))}
                  disabled={tier2Page === 0}
                  className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span>Page {tier2Page + 1} of {tier2TotalPages}</span>
                <button
                  onClick={() => setTier2Page(p => Math.min(tier2TotalPages - 1, p + 1))}
                  disabled={tier2Page >= tier2TotalPages - 1}
                  className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
          <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {tier2.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No listings without touchless evidence</p>
              </div>
            ) : (
              tier2Paged.map(l => (
                <CleanupRow
                  key={l.id}
                  listing={l}
                  snippetsCache={snippetsCache}
                  onExpand={handleExpand}
                  expanded={expandedId === l.id}
                  onRemove={handleRemove}
                  onKeep={handleKeep}
                  removing={removingId}
                  showKeep={true}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
