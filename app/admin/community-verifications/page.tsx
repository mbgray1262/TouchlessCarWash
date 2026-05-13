'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ThumbsUp, ThumbsDown, MessageSquare, Users, TrendingUp,
  AlertTriangle, CheckCircle, ExternalLink, BarChart3,
  RefreshCw, Trash2, XCircle, Loader2, Ban, ShieldCheck, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { slugify, US_STATES } from '@/lib/constants';

interface Report {
  id: string;
  is_touchless: boolean; // the user's vote
  comment: string | null;
  created_at: string;
}

interface ListingRow {
  listing_id: string;
  listing_name: string;
  listing_city: string;
  listing_state: string;
  listing_slug: string;
  listing_is_touchless: boolean;
  listing_business_status: string | null;
  listing_is_approved: boolean;
  reports: Report[];
  no_count: number;
  yes_count: number;
  latest_at: string;
}

interface Stats {
  total: number;
  yesCount: number;
  noCount: number;
  withComment: number;
  uniqueListings: number;
}

type FilterTab = 'outstanding' | 'all' | 'removed';

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

function isRemoved(business_status: string | null): boolean {
  return business_status === 'REMOVED_BY_ADMIN' || business_status === 'CLOSED_PERMANENTLY';
}

export default function CommunityVerificationsPage() {
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, yesCount: 0, noCount: 0, withComment: 0, uniqueListings: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('outstanding');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null); // listing_id currently being acted on
  const [deletingReport, setDeletingReport] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: raw } = await supabase
        .from('listing_verifications')
        .select(`
          id,
          listing_id,
          is_touchless,
          comment,
          created_at,
          listings!inner(name, city, state, slug, is_touchless, business_status, is_approved)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!raw) return;

      type JoinedListing = {
        name: string; city: string; state: string; slug: string;
        is_touchless: boolean | null;
        business_status: string | null;
        is_approved: boolean | null;
      };
      type RawRow = {
        id: string;
        listing_id: string;
        is_touchless: boolean;
        comment: string | null;
        created_at: string;
        listings: JoinedListing | JoinedListing[];
      };

      // Group reports by listing — one card per listing, all reports nested
      const map = new Map<string, ListingRow>();
      for (const r of raw as RawRow[]) {
        const l = Array.isArray(r.listings) ? r.listings[0] : r.listings;
        if (!map.has(r.listing_id)) {
          map.set(r.listing_id, {
            listing_id: r.listing_id,
            listing_name: l?.name ?? 'Unknown',
            listing_city: l?.city ?? '',
            listing_state: l?.state ?? '',
            listing_slug: l?.slug ?? '',
            listing_is_touchless: l?.is_touchless ?? false,
            listing_business_status: l?.business_status ?? null,
            listing_is_approved: l?.is_approved ?? true,
            reports: [],
            no_count: 0,
            yes_count: 0,
            latest_at: r.created_at,
          });
        }
        const entry = map.get(r.listing_id)!;
        entry.reports.push({
          id: r.id,
          is_touchless: r.is_touchless,
          comment: r.comment,
          created_at: r.created_at,
        });
        if (r.is_touchless) entry.yes_count++;
        else entry.no_count++;
        if (r.created_at > entry.latest_at) entry.latest_at = r.created_at;
      }

      const list = Array.from(map.values()).sort((a, b) =>
        a.latest_at < b.latest_at ? 1 : -1,
      );
      setRows(list);

      // Stats — totals across all 500 reports
      const allReports = list.flatMap(r => r.reports);
      setStats({
        total: allReports.length,
        yesCount: allReports.filter(r => r.is_touchless).length,
        noCount: allReports.filter(r => !r.is_touchless).length,
        withComment: allReports.filter(r => r.comment).length,
        uniqueListings: list.length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─────────────────────────── Action handlers ───────────────────────────

  /** Optimistically patch a row's listing-level fields. */
  function patchRow(listing_id: string, patch: Partial<ListingRow>) {
    setRows(prev => prev.map(r => r.listing_id === listing_id ? { ...r, ...patch } : r));
  }

  async function removeListing(row: ListingRow) {
    const reason = window.prompt(
      `Remove "${row.listing_name}"?\n\nThis hides it from the public site immediately. Optional reason for the audit log:`,
      'Reported as not a car wash by community',
    );
    if (reason === null) return;
    setBusy(row.listing_id);
    try {
      const res = await fetch('/api/admin/listings/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to remove: ${body.error ?? res.statusText}`);
        return;
      }
      patchRow(row.listing_id, {
        listing_is_touchless: false,
        listing_is_approved: false,
        listing_business_status: 'REMOVED_BY_ADMIN',
      });
    } finally {
      setBusy(null);
    }
  }

  async function restoreListing(row: ListingRow) {
    if (!window.confirm(`Restore "${row.listing_name}" to the public site?`)) return;
    setBusy(row.listing_id);
    try {
      const res = await fetch('/api/admin/listings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to restore: ${body.error ?? res.statusText}`);
        return;
      }
      patchRow(row.listing_id, {
        listing_is_touchless: true,
        listing_is_approved: true,
        listing_business_status: 'OPERATIONAL',
      });
    } finally {
      setBusy(null);
    }
  }

  /** Wipe negative reports for a listing — used when the flag was wrong. */
  async function dismissFlags(row: ListingRow) {
    if (!window.confirm(`Dismiss all ${row.no_count} "not touchless" flag${row.no_count !== 1 ? 's' : ''} for "${row.listing_name}"?\n\nPositive votes are kept.`)) return;
    setBusy(row.listing_id);
    try {
      const res = await fetch('/api/admin/listings/dismiss-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to dismiss: ${body.error ?? res.statusText}`);
        return;
      }
      // Strip negative reports from this listing
      setRows(prev => prev.map(r => r.listing_id === row.listing_id
        ? { ...r, reports: r.reports.filter(rep => rep.is_touchless), no_count: 0 }
        : r));
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(row: ListingRow, next: boolean) {
    setBusy(row.listing_id);
    patchRow(row.listing_id, { listing_is_touchless: next });
    try {
      const res = await fetch('/api/admin/listings/toggle-touchless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id, is_touchless: next }),
      });
      if (!res.ok) {
        // Revert
        patchRow(row.listing_id, { listing_is_touchless: !next });
        const body = await res.json().catch(() => ({}));
        alert(`Failed to update: ${body.error ?? res.statusText}`);
      } else if (next === false) {
        // toggle-touchless also unapproves when flipping to false
        patchRow(row.listing_id, { listing_is_approved: false });
      }
    } finally {
      setBusy(null);
    }
  }

  /** Delete a single report — for nonsense comments etc. */
  async function deleteReport(report_id: string, listing_id: string, isNegative: boolean, snippet: string) {
    if (!window.confirm(`Delete this report?\n\n"${snippet}"\n\nThe individual vote is removed; the listing's status is unchanged.`)) return;
    setDeletingReport(report_id);
    try {
      const res = await fetch('/api/verify-listing/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${body.error ?? res.statusText}`);
        return;
      }
      // Drop the report locally; if it was the last on this listing, drop the row too
      setRows(prev => prev
        .map(r => r.listing_id === listing_id ? {
          ...r,
          reports: r.reports.filter(rep => rep.id !== report_id),
          no_count: r.no_count - (isNegative ? 1 : 0),
          yes_count: r.yes_count - (isNegative ? 0 : 1),
        } : r)
        .filter(r => r.reports.length > 0));
    } finally {
      setDeletingReport(null);
    }
  }

  // ─────────────────────────── Derived view state ────────────────────────

  const outstandingCount = useMemo(
    () => rows.filter(r => r.no_count > 0 && !isRemoved(r.listing_business_status)).length,
    [rows],
  );
  const removedCount = useMemo(
    () => rows.filter(r => isRemoved(r.listing_business_status)).length,
    [rows],
  );

  const filtered = useMemo(() => {
    if (filter === 'outstanding') {
      return rows.filter(r => r.no_count > 0 && !isRemoved(r.listing_business_status));
    }
    if (filter === 'removed') {
      return rows.filter(r => isRemoved(r.listing_business_status));
    }
    return rows;
  }, [rows, filter]);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [filter]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pct = stats.total > 0 ? Math.round((stats.yesCount / stats.total) * 100) : null;

  // ─────────────────────────── Render ────────────────────────────────────

  return (
    <div className="container mx-auto px-4 max-w-5xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">Community Verifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review user reports, then act on the listing or dismiss the flag.</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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

      {/* Confidence bar */}
      {stats.total > 0 && pct !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
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

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('outstanding')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'outstanding'
              ? 'bg-[#0F2744] border-[#0F2744] text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Outstanding
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            filter === 'outstanding' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
          }`}>{outstandingCount}</span>
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'all'
              ? 'bg-[#0F2744] border-[#0F2744] text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All listings
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            filter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
          }`}>{rows.length}</span>
        </button>
        <button
          onClick={() => setFilter('removed')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'removed'
              ? 'bg-[#0F2744] border-[#0F2744] text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Ban className="w-4 h-4" />
          Removed
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            filter === 'removed' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
          }`}>{removedCount}</span>
        </button>
      </div>

      {/* Listing cards */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : paginated.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {filter === 'outstanding' ? 'Nothing outstanding — you\'re all caught up.' :
             filter === 'removed' ? 'No removed listings.' :
             'No reports to review.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map(row => {
            const url = buildListingUrl(row.listing_state, row.listing_city, row.listing_slug);
            const removed = isRemoved(row.listing_business_status);
            const outstanding = row.no_count > 0 && !removed;
            const rowBusy = busy === row.listing_id;
            return (
              <div
                key={row.listing_id}
                className={`bg-white rounded-xl border-2 overflow-hidden transition-colors ${
                  removed ? 'border-gray-200 opacity-75'
                  : outstanding ? 'border-red-200'
                  : 'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className={`px-5 py-3 flex items-start justify-between gap-4 ${
                  removed ? 'bg-gray-50'
                  : outstanding ? 'bg-red-50/50'
                  : 'bg-gray-50/50'
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={url}
                        target="_blank"
                        className="text-base font-semibold text-[#0F2744] hover:text-[#22C55E] flex items-center gap-1.5"
                      >
                        {row.listing_name}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </Link>
                      <span className="text-sm text-gray-500">·</span>
                      <span className="text-sm text-gray-500">{row.listing_city}, {row.listing_state}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* Status pill */}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        removed
                          ? 'bg-gray-200 text-gray-700 border border-gray-300'
                          : row.listing_is_touchless && row.listing_is_approved
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {removed
                          ? <><Ban className="w-3 h-3" /> Removed</>
                          : row.listing_is_touchless && row.listing_is_approved
                            ? <><CheckCircle className="w-3 h-3" /> Touchless · Public</>
                            : <><XCircle className="w-3 h-3" /> Hidden from public</>}
                      </span>
                      {/* Vote tallies */}
                      {row.yes_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <ThumbsUp className="w-3 h-3" /> {row.yes_count}
                        </span>
                      )}
                      {row.no_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <ThumbsDown className="w-3 h-3" /> {row.no_count} flag{row.no_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {/* Outstanding badge */}
                      {outstanding && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                          Needs review
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reports list */}
                <div className="divide-y divide-gray-100">
                  {row.reports.map(r => (
                    <div key={r.id} className="px-5 py-2.5 flex items-start gap-3 hover:bg-gray-50/50">
                      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        r.is_touchless ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {r.is_touchless
                          ? <ThumbsUp className="w-3 h-3 text-green-600" />
                          : <ThumbsDown className="w-3 h-3 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {r.comment ? (
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{r.is_touchless ? 'Confirmed' : 'Flagged'}:</span>{' '}
                            <span className="text-gray-600">&ldquo;{r.comment}&rdquo;</span>
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">
                            {r.is_touchless ? 'Confirmed touchless (no comment)' : 'Flagged as not touchless (no comment)'}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(r.created_at)}</p>
                      </div>
                      <button
                        onClick={() => deleteReport(r.id, row.listing_id, !r.is_touchless, r.comment || (r.is_touchless ? 'Thumbs-up vote (no comment)' : 'Thumbs-down vote (no comment)'))}
                        disabled={deletingReport === r.id}
                        title="Delete this report (e.g. nonsense comment)"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-gray-200 text-gray-500 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 transition-colors"
                      >
                        {deletingReport === r.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                {/* Action bar */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                  {removed ? (
                    <button
                      onClick={() => restoreListing(row)}
                      disabled={rowBusy}
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore listing
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => removeListing(row)}
                        disabled={rowBusy}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Hide this listing from the public site"
                      >
                        {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        Remove listing
                      </button>
                      {row.no_count > 0 && (
                        <button
                          onClick={() => dismissFlags(row)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Clear the negative flags (listing stays as-is)"
                        >
                          {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          Dismiss flags
                        </button>
                      )}
                      {row.listing_is_touchless ? (
                        <button
                          onClick={() => toggleStatus(row, false)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Keep the listing but mark it as not touchless"
                        >
                          {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                          Mark not touchless
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleStatus(row, true)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-green-200 text-green-700 bg-white hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                          Mark touchless
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages} ({filtered.length} listing{filtered.length !== 1 ? 's' : ''})
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
    </div>
  );
}
