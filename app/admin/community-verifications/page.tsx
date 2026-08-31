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

// The four community-verifiable wash types. Each has its own copy, badge color, and the
// listings flag its "Mark …" CTA toggles — so the queue reads and acts per category.
type WashType = 'touchless' | 'self_serve' | 'hand_wash' | 'detailing';
const WASH_ORDER: WashType[] = ['touchless', 'self_serve', 'hand_wash', 'detailing'];
const CAT: Record<WashType, {
  label: string; flagField: keyof ListingRow; badge: string; dot: string;
  markYes: string; markNo: string; confirmed: string; flagged: string; noun: string;
}> = {
  touchless: {
    label: 'Touchless', flagField: 'listing_is_touchless',
    badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500',
    markYes: 'Mark touchless', markNo: 'Mark not touchless',
    confirmed: 'Confirmed touchless', flagged: 'Flagged not touchless', noun: 'touchless wash',
  },
  self_serve: {
    label: 'Self-Serve', flagField: 'listing_is_self_service',
    badge: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500',
    markYes: 'Mark self-serve', markNo: 'Mark not self-serve',
    confirmed: 'Confirmed self-serve', flagged: 'Flagged not self-serve', noun: 'self-serve wash',
  },
  hand_wash: {
    label: 'Hand Wash', flagField: 'listing_is_hand_wash',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500',
    markYes: 'Mark hand wash', markNo: 'Mark not hand wash',
    confirmed: 'Confirmed hand wash', flagged: 'Flagged not hand wash', noun: 'hand wash',
  },
  detailing: {
    label: 'Detailing', flagField: 'listing_is_detailing',
    badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500',
    markYes: 'Mark detailer', markNo: 'Mark not detailer',
    confirmed: 'Confirmed detailer', flagged: 'Flagged not detailer', noun: 'detailer',
  },
};

interface Report {
  id: string;
  is_touchless: boolean; // the vote value (true = confirms the listing matches its wash type)
  comment: string | null;
  created_at: string;
  resolved_at: string | null; // when an admin verdict settled this flag (null = still open)
}

// The admin verdict recorded on a card, so the UI can say exactly what was done.
type ResolveAction = 'confirmed' | 'not_touchless' | 'removed';

// One card = one listing's votes FOR ONE wash type. Grouping by (listing, wash_type) keeps
// every CTA unambiguous (the card is about that category) and makes the per-category filter/
// counts trivial. Listing-level fields (flags, status) are duplicated onto each of a listing's
// per-type rows so actions have what they need.
interface ListingRow {
  key: string;               // `${listing_id}|${wash_type}`
  wash_type: WashType;
  listing_id: string;
  listing_name: string;
  listing_city: string;
  listing_state: string;
  listing_slug: string;
  listing_is_touchless: boolean;
  listing_is_self_service: boolean;
  listing_is_hand_wash: boolean;
  listing_is_detailing: boolean;
  listing_business_status: string | null;
  listing_is_approved: boolean;
  reports: Report[];
  no_count: number;        // total thumbs-down votes for this listing+type
  open_no_count: number;   // thumbs-down votes NOT yet resolved by an admin — drives "needs review"
  yes_count: number;
  resolved_at: string | null;        // when the admin last gave a verdict (null = never / reopened)
  resolved_action: ResolveAction | null; // which verdict was given
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

function normWashType(v: unknown): WashType {
  return v === 'self_serve' || v === 'hand_wash' || v === 'detailing' ? v : 'touchless';
}

export default function CommunityVerificationsPage() {
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, yesCount: 0, noCount: 0, withComment: 0, uniqueListings: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('outstanding');
  const [catFilter, setCatFilter] = useState<WashType | 'all'>('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null); // row key currently being acted on
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
          wash_type,
          comment,
          created_at,
          resolved_at,
          resolved_action,
          listings!inner(name, city, state, slug, is_touchless, is_self_service, is_hand_wash, is_detailing, business_status, is_approved)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!raw) return;

      type JoinedListing = {
        name: string; city: string; state: string; slug: string;
        is_touchless: boolean | null;
        is_self_service: boolean | null;
        is_hand_wash: boolean | null;
        is_detailing: boolean | null;
        business_status: string | null;
        is_approved: boolean | null;
      };
      type RawRow = {
        id: string;
        listing_id: string;
        is_touchless: boolean;
        wash_type: string | null;
        comment: string | null;
        created_at: string;
        resolved_at: string | null;
        resolved_action: string | null;
        listings: JoinedListing | JoinedListing[];
      };

      // Group reports by (listing, wash_type) — one card per listing per category.
      const map = new Map<string, ListingRow>();
      for (const r of raw as RawRow[]) {
        const l = Array.isArray(r.listings) ? r.listings[0] : r.listings;
        const wt = normWashType(r.wash_type);
        const key = `${r.listing_id}|${wt}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            wash_type: wt,
            listing_id: r.listing_id,
            listing_name: l?.name ?? 'Unknown',
            listing_city: l?.city ?? '',
            listing_state: l?.state ?? '',
            listing_slug: l?.slug ?? '',
            listing_is_touchless: !!l?.is_touchless,
            listing_is_self_service: !!l?.is_self_service,
            listing_is_hand_wash: !!l?.is_hand_wash,
            listing_is_detailing: !!l?.is_detailing,
            listing_business_status: l?.business_status ?? null,
            listing_is_approved: l?.is_approved ?? true,
            reports: [],
            no_count: 0,
            open_no_count: 0,
            yes_count: 0,
            resolved_at: null,
            resolved_action: null,
            latest_at: r.created_at,
          });
        }
        const entry = map.get(key)!;
        entry.reports.push({ id: r.id, is_touchless: r.is_touchless, comment: r.comment, created_at: r.created_at, resolved_at: r.resolved_at });
        if (r.is_touchless) {
          entry.yes_count++;
        } else {
          entry.no_count++;
          if (!r.resolved_at) entry.open_no_count++;
          // Remember the most recent verdict stamped on this card's flags.
          if (r.resolved_at && (!entry.resolved_at || r.resolved_at > entry.resolved_at)) {
            entry.resolved_at = r.resolved_at;
            entry.resolved_action = (r.resolved_action as ResolveAction | null) ?? null;
          }
        }
        if (r.created_at > entry.latest_at) entry.latest_at = r.created_at;
      }

      const list = Array.from(map.values()).sort((a, b) => (a.latest_at < b.latest_at ? 1 : -1));
      setRows(list);

      const allReports = list.flatMap(r => r.reports);
      const uniq = new Set(list.map(r => r.listing_id)).size;
      setStats({
        total: allReports.length,
        yesCount: allReports.filter(r => r.is_touchless).length,
        noCount: allReports.filter(r => !r.is_touchless).length,
        withComment: allReports.filter(r => r.comment).length,
        uniqueListings: uniq,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─────────────────────────── Action handlers ───────────────────────────

  /** Optimistically patch every row of the SAME listing (flags/status are listing-level). */
  function patchListing(listing_id: string, patch: Partial<ListingRow>) {
    setRows(prev => prev.map(r => r.listing_id === listing_id ? { ...r, ...patch } : r));
  }

  /** Optimistically patch ONE card (resolution is per listing+wash-type, keyed by row.key). */
  function patchRow(key: string, patch: Partial<ListingRow>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  }

  /**
   * Record an admin verdict on a card's flags (or reopen it). This is what actually
   * clears "needs review": it stamps the thumbs-down votes resolved so the card drops
   * out of the queue. Votes are kept (not deleted), so Undo can reopen it.
   */
  async function setResolved(row: ListingRow, resolved: boolean, action: ResolveAction | null) {
    const before = { open_no_count: row.open_no_count, resolved_at: row.resolved_at, resolved_action: row.resolved_action };
    patchRow(row.key, resolved
      ? { open_no_count: 0, resolved_at: new Date().toISOString(), resolved_action: action }
      : { open_no_count: row.no_count, resolved_at: null, resolved_action: null });
    try {
      const res = await fetch('/api/admin/listings/resolve-verifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id, wash_type: row.wash_type, resolved, action }),
      });
      if (!res.ok) {
        patchRow(row.key, before); // revert
        const body = await res.json().catch(() => ({}));
        alert(`Failed to update: ${body.error ?? res.statusText}`);
        return false;
      }
      return true;
    } catch {
      patchRow(row.key, before);
      alert('Failed to update: network error');
      return false;
    }
  }

  /** VERDICT: the flags were wrong — keep the listing exactly as it is, mark them handled. */
  async function keepAsIs(row: ListingRow) {
    setBusy(row.key);
    try { await setResolved(row, true, 'confirmed'); }
    finally { setBusy(null); }
  }

  /** VERDICT: the flags were right — flip the category flag off (touchless also hides it) and resolve. */
  async function agreeNotType(row: ListingRow) {
    setBusy(row.key);
    try {
      const field = CAT[row.wash_type].flagField;
      patchListing(row.listing_id, { [field]: false } as Partial<ListingRow>);
      const res = await fetch('/api/admin/listings/toggle-wash-type', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id, wash_type: row.wash_type, value: false }),
      });
      if (!res.ok) {
        patchListing(row.listing_id, { [field]: true } as Partial<ListingRow>);
        const body = await res.json().catch(() => ({}));
        alert(`Failed to update: ${body.error ?? res.statusText}`);
        return;
      }
      if (row.wash_type === 'touchless') patchListing(row.listing_id, { listing_is_approved: false });
      await setResolved(row, true, 'not_touchless');
    } finally { setBusy(null); }
  }

  /** Undo a verdict: reopen the flags for review (and, if we'd flipped the flag, leave that to the admin). */
  async function undoResolve(row: ListingRow) {
    setBusy(row.key);
    try { await setResolved(row, false, null); }
    finally { setBusy(null); }
  }

  async function removeListing(row: ListingRow) {
    const reason = window.prompt(
      `Remove "${row.listing_name}"?\n\nThis hides it from the public site immediately. Optional reason for the audit log:`,
      `Reported as not a ${CAT[row.wash_type].noun} by community`,
    );
    if (reason === null) return;
    setBusy(row.key);
    try {
      const res = await fetch('/api/admin/listings/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to remove: ${body.error ?? res.statusText}`);
        return;
      }
      patchListing(row.listing_id, { listing_is_approved: false, listing_business_status: 'REMOVED_BY_ADMIN' });
      // A removed listing's open flags are settled too — mark this card's flags resolved.
      if (row.open_no_count > 0) await setResolved(row, true, 'removed');
    } finally {
      setBusy(null);
    }
  }

  async function restoreListing(row: ListingRow) {
    if (!window.confirm(`Restore "${row.listing_name}" to the public site?`)) return;
    setBusy(row.key);
    try {
      const res = await fetch('/api/admin/listings/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: row.listing_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to restore: ${body.error ?? res.statusText}`);
        return;
      }
      patchListing(row.listing_id, { listing_is_approved: true, listing_business_status: 'OPERATIONAL' });
    } finally {
      setBusy(null);
    }
  }

  /** Delete a single report. */
  async function deleteReport(report_id: string, rowKey: string, snippet: string) {
    if (!window.confirm(`Delete this report?\n\n"${snippet}"\n\nThe individual vote is removed; the listing's status is unchanged.`)) return;
    setDeletingReport(report_id);
    try {
      const res = await fetch('/api/verify-listing/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report_id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${body.error ?? res.statusText}`);
        return;
      }
      setRows(prev => prev
        .map(r => {
          if (r.key !== rowKey) return r;
          const reports = r.reports.filter(rep => rep.id !== report_id);
          // Recompute from what's left so open-flag counts stay exact.
          const negatives = reports.filter(rep => !rep.is_touchless);
          return {
            ...r,
            reports,
            no_count: negatives.length,
            open_no_count: negatives.filter(rep => !rep.resolved_at).length,
            yes_count: reports.filter(rep => rep.is_touchless).length,
          };
        })
        .filter(r => r.reports.length > 0));
    } finally {
      setDeletingReport(null);
    }
  }

  // ─────────────────────────── Derived view state ────────────────────────

  // Outstanding = still has UNRESOLVED thumbs-down votes. Once the admin gives a verdict,
  // the flags are stamped resolved and the card leaves the queue — that's the whole fix.
  const isOutstanding = useCallback(
    (r: ListingRow) => r.open_no_count > 0 && !isRemoved(r.listing_business_status),
    [],
  );

  // Per-category OUTSTANDING counts — the at-a-glance "what needs my attention, by category".
  const catCounts = useMemo(() => {
    const c: Record<WashType, number> = { touchless: 0, self_serve: 0, hand_wash: 0, detailing: 0 };
    for (const r of rows) if (isOutstanding(r)) c[r.wash_type]++;
    return c;
  }, [rows, isOutstanding]);
  const totalOutstanding = catCounts.touchless + catCounts.self_serve + catCounts.hand_wash + catCounts.detailing;

  const outstandingCount = useMemo(() => rows.filter(isOutstanding).length, [rows, isOutstanding]);
  const removedCount = useMemo(() => rows.filter(r => isRemoved(r.listing_business_status)).length, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (catFilter !== 'all') r = r.filter(x => x.wash_type === catFilter);
    if (filter === 'outstanding') return r.filter(isOutstanding);
    if (filter === 'removed') return r.filter(x => isRemoved(x.listing_business_status));
    return r;
  }, [rows, filter, catFilter, isOutstanding]);

  useEffect(() => { setPage(0); }, [filter, catFilter]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pct = stats.total > 0 ? Math.round((stats.yesCount / stats.total) * 100) : null;

  // ─────────────────────────── Render ────────────────────────────────────

  return (
    <div className="container mx-auto px-4 max-w-5xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">Community Verifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visitor votes on each listing&apos;s wash type — grouped by category. Act on the listing or dismiss the flag.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Per-category "needs review" board — the at-a-glance notifications ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {WASH_ORDER.map(wt => {
          const n = catCounts[wt];
          const active = catFilter === wt;
          return (
            <button
              key={wt}
              onClick={() => { setCatFilter(active ? 'all' : wt); setFilter('outstanding'); }}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                active ? 'border-[#0F2744] ring-2 ring-[#0F2744]/10' : n > 0 ? 'border-red-200 hover:border-red-300' : 'border-gray-200 hover:border-gray-300'
              } bg-white`}
              title={`${active ? 'Showing' : 'Show'} ${CAT[wt].label} verifications that need review`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${CAT[wt].dot}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{CAT[wt].label}</span>
              </div>
              <div className="flex items-end justify-between">
                <span className={`text-3xl font-bold ${n > 0 ? 'text-red-600' : 'text-gray-300'}`}>{n}</span>
                {n > 0 && <span className="text-[11px] font-semibold text-red-600 mb-1.5 uppercase">needs review</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Users className="w-3.5 h-3.5" />Total votes</div>
          <div className="text-2xl font-bold text-[#0F2744]">{stats.total.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1"><ThumbsUp className="w-3.5 h-3.5" />Confirmed</div>
          <div className="text-2xl font-bold text-green-600">{stats.yesCount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-red-500 text-xs mb-1"><ThumbsDown className="w-3.5 h-3.5" />Flagged</div>
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
              Overall confidence (confirmed vs flagged, all categories)
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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter('outstanding')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'outstanding' ? 'bg-[#0F2744] border-[#0F2744] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Outstanding
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === 'outstanding' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>
            {catFilter === 'all' ? outstandingCount : catCounts[catFilter]}
          </span>
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'all' ? 'bg-[#0F2744] border-[#0F2744] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All votes
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {(catFilter === 'all' ? rows : rows.filter(r => r.wash_type === catFilter)).length}
          </span>
        </button>
        <button
          onClick={() => setFilter('removed')}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
            filter === 'removed' ? 'bg-[#0F2744] border-[#0F2744] text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Ban className="w-4 h-4" />
          Removed
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === 'removed' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{removedCount}</span>
        </button>

        {catFilter !== 'all' && (
          <button
            onClick={() => setCatFilter('all')}
            className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 flex items-center gap-1.5"
            title="Clear category filter"
          >
            <span className={`w-2 h-2 rounded-full ${CAT[catFilter].dot}`} />
            {CAT[catFilter].label} only
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Listing cards */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : paginated.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {filter === 'outstanding' ? (totalOutstanding === 0 ? 'Nothing outstanding — you\'re all caught up.' : 'Nothing outstanding in this category.') :
             filter === 'removed' ? 'No removed listings.' :
             'No votes to review.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map(row => {
            const c = CAT[row.wash_type];
            const url = buildListingUrl(row.listing_state, row.listing_city, row.listing_slug);
            const removed = isRemoved(row.listing_business_status);
            const outstanding = row.open_no_count > 0 && !removed;
            // Has flags AND the admin already gave a verdict on them (and it's not removed).
            const resolved = !removed && row.no_count > 0 && row.open_no_count === 0 && !!row.resolved_at;
            const rowBusy = busy === row.key;
            const flagOn = !!row[c.flagField];
            const publicNow = flagOn && row.listing_is_approved && !removed;
            // Human-readable summary of the verdict, for the resolved banner.
            const verdictText =
              row.resolved_action === 'not_touchless' ? `Marked NOT ${c.label.toLowerCase()} — hidden from public`
              : row.resolved_action === 'removed' ? 'Listing removed'
              : `Kept as-is — confirmed ${c.label.toLowerCase()}`;
            return (
              <div
                key={row.key}
                className={`bg-white rounded-xl border-2 overflow-hidden transition-colors ${
                  removed ? 'border-gray-200 opacity-75' : outstanding ? 'border-red-200' : resolved ? 'border-green-200' : 'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className={`px-5 py-3 flex items-start justify-between gap-4 ${
                  removed ? 'bg-gray-50' : outstanding ? 'bg-red-50/50' : resolved ? 'bg-green-50/40' : 'bg-gray-50/50'
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Topic chip — the QUESTION the community raised (muted, not a status claim). */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label} check
                      </span>
                      <Link href={url} target="_blank" className="text-base font-semibold text-[#0F2744] hover:text-[#22C55E] flex items-center gap-1.5">
                        {row.listing_name}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </Link>
                      <span className="text-sm text-gray-500">·</span>
                      <span className="text-sm text-gray-500">{row.listing_city}, {row.listing_state}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {/* Review-state pill — the single source of truth for "what do I need to do?" */}
                      {removed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300"><Ban className="w-3 h-3" /> Removed</span>
                      ) : outstanding ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white"><AlertTriangle className="w-3 h-3" /> Needs review</span>
                      ) : resolved ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-600 text-white"><CheckCircle className="w-3 h-3" /> Reviewed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200"><CheckCircle className="w-3 h-3" /> No open flags</span>
                      )}
                      {/* Public-visibility pill — separate concern: is it live on the site right now? */}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        removed ? 'bg-gray-100 text-gray-500 border border-gray-200'
                          : publicNow ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {removed ? <>Hidden</>
                          : publicNow ? <><CheckCircle className="w-3 h-3" /> Public · tagged {c.label.toLowerCase()}</>
                          : flagOn ? <><XCircle className="w-3 h-3" /> Hidden from public</>
                          : <><XCircle className="w-3 h-3" /> Not tagged {c.label.toLowerCase()}</>}
                      </span>
                      {row.yes_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><ThumbsUp className="w-3 h-3" /> {row.yes_count}</span>
                      )}
                      {row.no_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><ThumbsDown className="w-3 h-3" /> {row.no_count} flag{row.no_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resolved banner — makes the admin's own decision unmistakable + reversible. */}
                {resolved && (
                  <div className="px-5 py-2.5 bg-green-50 border-b border-green-100 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm text-green-800">
                      <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                      <span><span className="font-semibold">You reviewed this.</span> {verdictText}.</span>
                    </span>
                    <button
                      onClick={() => undoResolve(row)}
                      disabled={rowBusy}
                      className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-green-300 text-green-700 bg-white hover:bg-green-100 disabled:opacity-50 transition-colors"
                      title="Reopen these flags for review"
                    >
                      {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Undo
                    </button>
                  </div>
                )}

                {/* Reports list */}
                <div className="divide-y divide-gray-100">
                  {row.reports.map(r => (
                    <div key={r.id} className="px-5 py-2.5 flex items-start gap-3 hover:bg-gray-50/50">
                      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${r.is_touchless ? 'bg-green-100' : 'bg-red-100'}`}>
                        {r.is_touchless ? <ThumbsUp className="w-3 h-3 text-green-600" /> : <ThumbsDown className="w-3 h-3 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {r.comment ? (
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{r.is_touchless ? c.confirmed : c.flagged}:</span>{' '}
                            <span className="text-gray-600">&ldquo;{r.comment}&rdquo;</span>
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">{r.is_touchless ? `${c.confirmed} (no comment)` : `${c.flagged} (no comment)`}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(r.created_at)}</p>
                      </div>
                      <button
                        onClick={() => deleteReport(r.id, row.key, r.comment || (r.is_touchless ? 'Thumbs-up vote (no comment)' : 'Thumbs-down vote (no comment)'))}
                        disabled={deletingReport === r.id}
                        title="Delete this report (e.g. nonsense comment)"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-gray-200 text-gray-500 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 transition-colors"
                      >
                        {deletingReport === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                {/* Action bar */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                  {removed ? (
                    <button
                      onClick={() => restoreListing(row)}
                      disabled={rowBusy}
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore listing
                    </button>
                  ) : outstanding ? (
                    /* The verdict: one decisive click. Each option both records the decision
                       AND clears the card from the queue. */
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your verdict — is this really {c.label.toLowerCase()}?</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => keepAsIs(row)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg border border-green-300 text-green-700 bg-white hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="The flags are wrong. Keep the listing exactly as it is and clear the flags."
                        >
                          {rowBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          Keep — it IS {c.label.toLowerCase()}
                        </button>
                        <button
                          onClick={() => agreeNotType(row)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title={row.wash_type === 'touchless'
                            ? 'The flags are right. Untag touchless and hide the listing from the public site.'
                            : `The flags are right. Untag ${c.label.toLowerCase()} on this listing.`}
                        >
                          {rowBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                          Change — {c.markNo.replace('Mark ', '')}
                        </button>
                        <span className="w-px h-6 bg-gray-200 mx-1" />
                        <button
                          onClick={() => removeListing(row)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Take the whole listing down (spam, duplicate, or permanently closed)"
                        >
                          {rowBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                          Remove listing
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Reviewed or no open flags — Undo lives in the green banner above. */
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => removeListing(row)}
                        disabled={rowBusy}
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Take the whole listing down (spam, duplicate, or permanently closed)"
                      >
                        {rowBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        Remove listing
                      </button>
                    </div>
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
            Page {page + 1} of {totalPages} ({filtered.length} card{filtered.length !== 1 ? 's' : ''})
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
