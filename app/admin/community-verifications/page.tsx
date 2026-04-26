'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ThumbsUp, ThumbsDown, MessageSquare, Users, TrendingUp,
  AlertTriangle, CheckCircle, ExternalLink, Calendar, BarChart3,
  RefreshCw, Trash2, XCircle, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { slugify, US_STATES } from '@/lib/constants';

interface Verification {
  id: string;
  listing_id: string;
  is_touchless: boolean; // the user's vote
  comment: string | null;
  created_at: string;
  listing_name: string;
  listing_city: string;
  listing_state: string;
  listing_slug: string;
  listing_is_touchless: boolean; // the listing's CURRENT status (not the vote)
}

interface ListingFlag {
  listing_id: string;
  listing_name: string;
  listing_city: string;
  listing_state: string;
  listing_slug: string;
  listing_is_touchless: boolean; // current status — drives the toggle button label
  no_count: number;
  yes_count: number;
  total: number;
}

interface Stats {
  total: number;
  yesCount: number;
  noCount: number;
  withComment: number;
  uniqueListings: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStateSlug(code: string): string {
  const s = US_STATES.find(s => s.code === code);
  return s ? slugify(s.name) : code.toLowerCase();
}

function buildListingUrl(stateCode: string, city: string, slug: string): string {
  return `/state/${getStateSlug(stateCode)}/${slugify(city)}/${slug}`;
}

export default function CommunityVerificationsPage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [flagged, setFlagged] = useState<ListingFlag[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, yesCount: 0, noCount: 0, withComment: 0, uniqueListings: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'yes' | 'no' | 'commented'>('all');
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch verifications joined with listing data — pull the listing's
      // current is_touchless so the admin toggle reflects live status,
      // not just the user's vote.
      const { data: rawVerifications } = await supabase
        .from('listing_verifications')
        .select(`
          id,
          listing_id,
          is_touchless,
          comment,
          created_at,
          listings!inner(name, city, state, slug, is_touchless)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!rawVerifications) return;

      // Flatten the join
      type JoinedListing = { name: string; city: string; state: string; slug: string; is_touchless: boolean | null };
      const flat: Verification[] = rawVerifications.map((v: {
        id: string;
        listing_id: string;
        is_touchless: boolean;
        comment: string | null;
        created_at: string;
        listings: JoinedListing | JoinedListing[];
      }) => {
        const l = Array.isArray(v.listings) ? v.listings[0] : v.listings;
        return {
          id: v.id,
          listing_id: v.listing_id,
          is_touchless: v.is_touchless,
          comment: v.comment,
          created_at: v.created_at,
          listing_name: l?.name ?? 'Unknown',
          listing_city: l?.city ?? '',
          listing_state: l?.state ?? '',
          listing_slug: l?.slug ?? '',
          listing_is_touchless: l?.is_touchless ?? false,
        };
      });

      setVerifications(flat);

      // Stats
      const yesCount = flat.filter(v => v.is_touchless).length;
      const noCount = flat.filter(v => !v.is_touchless).length;
      const withComment = flat.filter(v => v.comment).length;
      const uniqueListings = new Set(flat.map(v => v.listing_id)).size;
      setStats({ total: flat.length, yesCount, noCount, withComment, uniqueListings });

      // Build flagged listings (those with ≥1 "not touchless" report)
      const flagMap = new Map<string, ListingFlag>();
      for (const v of flat) {
        if (!flagMap.has(v.listing_id)) {
          flagMap.set(v.listing_id, {
            listing_id: v.listing_id,
            listing_name: v.listing_name,
            listing_city: v.listing_city,
            listing_state: v.listing_state,
            listing_slug: v.listing_slug,
            listing_is_touchless: v.listing_is_touchless,
            no_count: 0,
            yes_count: 0,
            total: 0,
          });
        }
        const entry = flagMap.get(v.listing_id)!;
        entry.total++;
        if (v.is_touchless) entry.yes_count++;
        else entry.no_count++;
      }
      const flaggedList = Array.from(flagMap.values())
        .filter(f => f.no_count > 0)
        .sort((a, b) => b.no_count - a.no_count);
      setFlagged(flaggedList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Flip a listing's is_touchless flag and propagate the new value to
   * every cached row that references it (the flagged-listing card on
   * the left and any individual reports on the right). Optimistic —
   * if the API call fails, revert and surface the error.
   */
  async function toggleListingStatus(listing_id: string, next: boolean) {
    setToggling(listing_id);
    // Optimistic update
    setFlagged(prev => prev.map(f => f.listing_id === listing_id ? { ...f, listing_is_touchless: next } : f));
    setVerifications(prev => prev.map(v => v.listing_id === listing_id ? { ...v, listing_is_touchless: next } : v));
    try {
      const res = await fetch('/api/admin/listings/toggle-touchless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id, is_touchless: next }),
      });
      if (!res.ok) {
        // Revert
        setFlagged(prev => prev.map(f => f.listing_id === listing_id ? { ...f, listing_is_touchless: !next } : f));
        setVerifications(prev => prev.map(v => v.listing_id === listing_id ? { ...v, listing_is_touchless: !next } : v));
        const body = await res.json().catch(() => ({}));
        alert(`Failed to update: ${body.error ?? res.statusText}`);
      }
    } catch (err) {
      setFlagged(prev => prev.map(f => f.listing_id === listing_id ? { ...f, listing_is_touchless: !next } : f));
      setVerifications(prev => prev.map(v => v.listing_id === listing_id ? { ...v, listing_is_touchless: !next } : v));
      alert(`Failed to update: ${err}`);
    } finally {
      setToggling(null);
    }
  }

  async function deleteVerification(id: string) {
    setDeleting(id);
    try {
      const res = await fetch('/api/verify-listing/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setVerifications(prev => prev.filter(v => v.id !== id));
        // Recompute stats
        const updated = verifications.filter(v => v.id !== id);
        setStats({
          total: updated.length,
          yesCount: updated.filter(v => v.is_touchless).length,
          noCount: updated.filter(v => !v.is_touchless).length,
          withComment: updated.filter(v => v.comment).length,
          uniqueListings: new Set(updated.map(v => v.listing_id)).size,
        });
      }
    } finally {
      setDeleting(null);
    }
  }

  const filtered = verifications.filter(v => {
    if (filter === 'yes') return v.is_touchless;
    if (filter === 'no') return !v.is_touchless;
    if (filter === 'commented') return !!v.comment;
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pct = stats.total > 0 ? Math.round((stats.yesCount / stats.total) * 100) : null;

  return (
    <div className="container mx-auto px-4 max-w-7xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">Community Verifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">User-submitted touchless confirmations and flags</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Users className="w-3.5 h-3.5" />Total reports</div>
          <div className="text-2xl font-bold text-[#0F2744]">{stats.total.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1"><ThumbsUp className="w-3.5 h-3.5" />Confirmed touchless</div>
          <div className="text-2xl font-bold text-green-600">{stats.yesCount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-1"><ThumbsDown className="w-3.5 h-3.5" />Flagged not touchless</div>
          <div className="text-2xl font-bold text-red-500">{stats.noCount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-blue-500 text-xs mb-1"><MessageSquare className="w-3.5 h-3.5" />With comments</div>
          <div className="text-2xl font-bold text-blue-500">{stats.withComment.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-purple-500 text-xs mb-1"><BarChart3 className="w-3.5 h-3.5" />Unique listings</div>
          <div className="text-2xl font-bold text-purple-500">{stats.uniqueListings.toLocaleString()}</div>
        </div>
      </div>

      {/* Overall confidence bar */}
      {stats.total > 0 && pct !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0F2744]">
              <TrendingUp className="w-4 h-4" />
              Overall touchless confidence
            </div>
            <span className={`text-lg font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {pct}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{stats.yesCount} confirmed / {stats.noCount} flagged across {stats.uniqueListings} listings</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: flagged listings needing review */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h2 className="font-semibold text-[#0F2744] text-sm">Listings Needing Review</h2>
              {flagged.length > 0 && (
                <span className="ml-auto bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">{flagged.length}</span>
              )}
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
            ) : flagged.length === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No flagged listings</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {flagged.map(f => {
                  const url = buildListingUrl(f.listing_state, f.listing_city, f.listing_slug);
                  const flagPct = f.total > 0 ? Math.round((f.no_count / f.total) * 100) : 0;
                  const isBusy = toggling === f.listing_id;
                  return (
                    <div key={f.listing_id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={url}
                            target="_blank"
                            className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] flex items-center gap-1 truncate"
                          >
                            <span className="truncate">{f.listing_name}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </Link>
                          <p className="text-xs text-gray-400 mt-0.5">{f.listing_city}, {f.listing_state}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            flagPct >= 50 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {f.no_count} flag{f.no_count !== 1 ? 's' : ''}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">{f.yes_count} confirmed</p>
                        </div>
                      </div>

                      {/* Status + toggle */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          f.listing_is_touchless
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          {f.listing_is_touchless
                            ? <><CheckCircle className="w-3 h-3" /> Touchless</>
                            : <><XCircle className="w-3 h-3" /> Not touchless</>}
                        </span>
                        {f.listing_is_touchless ? (
                          <button
                            onClick={() => toggleListingStatus(f.listing_id, false)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Flip this listing's status to Not Touchless"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                            Mark Not Touchless
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleListingStatus(f.listing_id, true)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-green-200 text-green-700 bg-white hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Restore this listing to Touchless"
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            Mark Touchless
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: full feed */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 flex-wrap">
              <h2 className="font-semibold text-[#0F2744] text-sm">All Reports</h2>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {(['all', 'yes', 'no', 'commented'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setPage(0); }}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      filter === f
                        ? 'bg-[#0F2744] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? `All (${verifications.length})` :
                     f === 'yes' ? `👍 Yes (${stats.yesCount})` :
                     f === 'no' ? `👎 No (${stats.noCount})` :
                     `💬 Commented (${stats.withComment})`}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : paginated.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No results for this filter.</div>
            ) : (
              <>
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {paginated.map(v => {
                    const url = buildListingUrl(v.listing_state, v.listing_city, v.listing_slug);
                    return (
                      <div key={v.id} className="px-5 py-3.5 flex items-start gap-3">
                        <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                          v.is_touchless ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {v.is_touchless
                            ? <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                            : <ThumbsDown className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={url}
                              target="_blank"
                              className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] flex items-center gap-1"
                            >
                              {v.listing_name}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </Link>
                            <span className="text-xs text-gray-400">{v.listing_city}, {v.listing_state}</span>
                          </div>
                          {v.comment && (
                            <p className="text-sm text-gray-600 mt-1 flex items-start gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                              {v.comment}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {timeAgo(v.created_at)}
                          </span>
                          <button
                            onClick={() => deleteVerification(v.id)}
                            disabled={deleting === v.id}
                            title="Delete"
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500">
                      Page {page + 1} of {totalPages} ({filtered.length} total)
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
