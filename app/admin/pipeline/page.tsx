'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, RotateCcw, RefreshCw, Loader2, AlertCircle,
  ChevronRight, CheckCircle2, XCircle, HelpCircle, WifiOff, Brain,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { StatsGrid } from './StatsGrid';
import { RecentRunsTable } from './RecentRunsTable';
import { supabase } from '@/lib/supabase';
import type { ClassifyStats, RecentListing, QueueListing, LogEntry } from './types';

const PAGE_SIZE = 50;
const QUEUE_FETCH_SIZE = 5000;
const STATS_REFRESH_INTERVAL = 5_000;

async function fetchStats(): Promise<ClassifyStats> {
  const [touchless, not_touchless, unclassified_with, unclassified_no, fetch_failed, classify_failed, unknown] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_touchless', true),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_touchless', false),
    supabase.from('listings').select('id', { count: 'exact', head: true }).is('is_touchless', null).not('website', 'is', null).neq('website', ''),
    supabase.from('listings').select('id', { count: 'exact', head: true }).is('is_touchless', null).or('website.is.null,website.eq.'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'fetch_failed'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'classify_failed'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'unknown'),
  ]);
  const t = touchless.count ?? 0;
  const nt = not_touchless.count ?? 0;
  const uw = unclassified_with.count ?? 0;
  const un = unclassified_no.count ?? 0;
  const unk = unknown.count ?? 0;
  return {
    total: t + nt + uw + un,
    touchless: t,
    not_touchless: nt,
    unclassified_with_website: uw,
    unclassified_no_website: un,
    fetch_failed: fetch_failed.count ?? 0,
    classify_failed: classify_failed.count ?? 0,
    unknown: unk,
  };
}

async function fetchQueue(offset: number): Promise<QueueListing[]> {
  const { data } = await supabase
    .from('listings')
    .select('id, name, city, state, website')
    .is('is_touchless', null)
    .not('website', 'is', null)
    .neq('website', '')
    .order('state', { ascending: true })
    .order('city', { ascending: true })
    .range(offset, offset + QUEUE_FETCH_SIZE - 1);
  return (data ?? []) as QueueListing[];
}

async function fetchRecentListings(page: number): Promise<{ listings: RecentListing[]; total: number }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from('listings')
    .select('id, name, city, state, is_touchless, touchless_evidence, last_crawled_at, website, crawl_status', { count: 'exact' })
    .not('last_crawled_at', 'is', null)
    .order('last_crawled_at', { ascending: false })
    .range(from, to);
  return { listings: (data ?? []) as RecentListing[], total: count ?? 0 };
}

function LogLine({ entry }: { entry: LogEntry }) {
  const icons: Record<LogEntry['status'], React.ReactNode> = {
    touchless: <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />,
    not_touchless: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
    unknown: <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    fetch_failed: <WifiOff className="w-3.5 h-3.5 text-orange-400 shrink-0" />,
    classify_failed: <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
    already_classified: <CheckCircle2 className="w-3.5 h-3.5 text-gray-300 shrink-0" />,
  };
  const labels: Record<LogEntry['status'], string> = {
    touchless: 'TOUCHLESS',
    not_touchless: 'NOT TOUCHLESS',
    unknown: 'UNKNOWN',
    fetch_failed: 'FETCH FAILED',
    classify_failed: 'AI FAILED',
    already_classified: 'SKIPPED',
  };
  const colors: Record<LogEntry['status'], string> = {
    touchless: 'text-green-700',
    not_touchless: 'text-red-600',
    unknown: 'text-amber-600',
    fetch_failed: 'text-orange-600',
    classify_failed: 'text-rose-600',
    already_classified: 'text-gray-400',
  };

  return (
    <div className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
      {icons[entry.status]}
      <div className="min-w-0">
        <span className="font-medium text-[#0F2744] text-xs">{entry.name}</span>
        {(entry.city || entry.state) && (
          <span className="text-gray-400 text-xs ml-1">({[entry.city, entry.state].filter(Boolean).join(', ')})</span>
        )}
        <span className={`ml-2 font-semibold text-xs ${colors[entry.status]}`}>{labels[entry.status]}</span>
        {entry.evidence && (
          <span className="text-gray-400 text-xs ml-1 truncate block">{entry.evidence}</span>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [stats, setStats] = useState<ClassifyStats | null>(null);
  const [recentListings, setRecentListings] = useState<RecentListing[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentPage, setRecentPage] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [dismissingFetchFailed, setDismissingFetchFailed] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const [concurrency, setConcurrency] = useState(3);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalInQueue, setTotalInQueue] = useState(0);
  const [currentListing, setCurrentListing] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [speed, setSpeed] = useState(0);

  const pausedRef = useRef(false);
  const queueRef = useRef<QueueListing[]>([]);
  const queueOffsetRef = useRef(0);
  const processedRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const statsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatsRefreshRef = useRef<number>(0);
  const batchsSinceRefreshRef = useRef(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  const liveTouchlessRef = useRef(0);
  const liveNotTouchlessRef = useRef(0);
  const liveUnknownRef = useRef(0);
  const liveFailedRef = useRef(0);
  const [liveCounts, setLiveCounts] = useState({ touchless: 0, not_touchless: 0, unknown: 0, failed: 0 });

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
    } catch { /* silent */ }
  }, []);

  const refreshRecent = useCallback(async (page: number) => {
    try {
      const { listings, total } = await fetchRecentListings(page);
      setRecentListings(listings);
      setRecentTotal(total);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoadingStats(true);
      await Promise.all([refreshStats(), refreshRecent(0)]);
      setLoadingStats(false);
    };
    init();
  }, [refreshStats, refreshRecent]);

  const runStateRef = useRef(runState);
  runStateRef.current = runState;

  useEffect(() => {
    statsTimerRef.current = setInterval(() => {
      if (runStateRef.current === 'running') {
        refreshRecent(0);
        setRecentPage(0);
      }
    }, STATS_REFRESH_INTERVAL);
    return () => { if (statsTimerRef.current) clearInterval(statsTimerRef.current); };
  }, [refreshRecent]);

  const addLog = useCallback((entry: LogEntry) => {
    setLog(prev => [entry, ...prev].slice(0, 50));
  }, []);

  const applyStatsDelta = useCallback((status: LogEntry['status']) => {
    setStats(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      if (status === 'touchless') {
        next.touchless += 1;
        next.unclassified_with_website = Math.max(0, next.unclassified_with_website - 1);
      } else if (status === 'not_touchless') {
        next.not_touchless += 1;
        next.unclassified_with_website = Math.max(0, next.unclassified_with_website - 1);
      } else if (status === 'unknown') {
        next.unknown += 1;
        next.unclassified_with_website = Math.max(0, next.unclassified_with_website - 1);
      } else if (status === 'fetch_failed') {
        next.fetch_failed += 1;
        next.unclassified_with_website = Math.max(0, next.unclassified_with_website - 1);
      } else if (status === 'classify_failed') {
        next.classify_failed += 1;
        next.unclassified_with_website = Math.max(0, next.unclassified_with_website - 1);
      }
      return next;
    });
  }, []);

  const classifyOne = useCallback(async (listing: QueueListing): Promise<void> => {
    setCurrentListing(`${listing.name} — ${listing.website}`);
    let status: LogEntry['status'] = 'fetch_failed';
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/classify-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id }),
      });
      const json = await res.json();

      if (json.status === 'already_classified') status = 'already_classified';
      else if (json.status === 'fetch_failed') status = 'fetch_failed';
      else if (json.status === 'classify_failed') status = 'classify_failed';
      else if (json.status === 'update_failed') status = 'classify_failed';
      else if (json.is_touchless === true) status = 'touchless';
      else if (json.is_touchless === false) status = 'not_touchless';
      else status = 'unknown';

      addLog({
        listing_id: listing.id,
        name: listing.name,
        city: listing.city,
        state: listing.state,
        website: listing.website,
        status,
        evidence: json.evidence,
      });
    } catch {
      addLog({
        listing_id: listing.id,
        name: listing.name,
        city: listing.city,
        state: listing.state,
        website: listing.website,
        status: 'fetch_failed',
      });
    }

    if (status !== 'already_classified') {
      applyStatsDelta(status);
    }

    if (status === 'touchless') liveTouchlessRef.current += 1;
    else if (status === 'not_touchless') liveNotTouchlessRef.current += 1;
    else if (status === 'unknown') liveUnknownRef.current += 1;
    else if (status === 'fetch_failed' || status === 'classify_failed') liveFailedRef.current += 1;

    setLiveCounts({
      touchless: liveTouchlessRef.current,
      not_touchless: liveNotTouchlessRef.current,
      unknown: liveUnknownRef.current,
      failed: liveFailedRef.current,
    });
    processedRef.current += 1;
    setProcessedCount(processedRef.current);
    if (startTimeRef.current) {
      const elapsed = (Date.now() - startTimeRef.current) / 60000;
      setSpeed(elapsed > 0 ? Math.round(processedRef.current / elapsed) : 0);
    }
  }, [addLog, applyStatsDelta]);

  const runLoop = useCallback(async () => {
    while (true) {
      if (pausedRef.current) return;

      if (queueRef.current.length === 0) {
        const batch = await fetchQueue(queueOffsetRef.current);
        if (batch.length === 0) {
          setRunState('done');
          setCurrentListing(null);
          await refreshStats();
          await refreshRecent(0);
          setRecentPage(0);
          showToast('success', `Classification complete! Processed ${processedRef.current.toLocaleString()} listings.`);
          return;
        }
        queueRef.current = batch;
        queueOffsetRef.current += batch.length;
        setTotalInQueue(prev => prev + batch.length);
      }

      const batch = queueRef.current.splice(0, concurrency);

      await Promise.all(batch.map(listing => classifyOne(listing)));

      if (pausedRef.current) return;

      batchsSinceRefreshRef.current += 1;
      const now = Date.now();
      if (batchsSinceRefreshRef.current >= 3 || now - lastStatsRefreshRef.current > 3000) {
        batchsSinceRefreshRef.current = 0;
        lastStatsRefreshRef.current = now;
        await refreshRecent(0);
        setRecentPage(0);
      }
    }
  }, [concurrency, classifyOne, refreshStats, refreshRecent, showToast]);

  const handleStart = useCallback(async () => {
    pausedRef.current = false;
    queueRef.current = [];
    queueOffsetRef.current = 0;
    processedRef.current = 0;
    liveTouchlessRef.current = 0;
    liveNotTouchlessRef.current = 0;
    liveUnknownRef.current = 0;
    liveFailedRef.current = 0;
    lastStatsRefreshRef.current = 0;
    batchsSinceRefreshRef.current = 0;
    startTimeRef.current = Date.now();
    setProcessedCount(0);
    setTotalInQueue(0);
    setSpeed(0);
    setLog([]);
    setLiveCounts({ touchless: 0, not_touchless: 0, unknown: 0, failed: 0 });
    setRunState('running');

    const initial = await fetchStats();
    setStats(initial);
    setTotalInQueue(initial.unclassified_with_website);

    runLoop();
  }, [runLoop]);

  const handlePause = useCallback(() => {
    pausedRef.current = true;
    setRunState('paused');
    setCurrentListing(null);
  }, []);

  const handleResume = useCallback(() => {
    pausedRef.current = false;
    setRunState('running');
    runLoop();
  }, [runLoop]);

  const handleDismissFetchFailed = useCallback(async () => {
    if (!confirm(`Mark all ${stats?.fetch_failed ?? 0} fetch-failed listings as no-website? They will be excluded from future runs.`)) return;
    setDismissingFetchFailed(true);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ crawl_status: 'no_website', website: null })
        .eq('crawl_status', 'fetch_failed');
      if (error) throw error;
      showToast('success', 'Fetch-failed listings cleared.');
      await refreshStats();
    } catch (e) {
      showToast('error', `Failed: ${(e as Error).message}`);
    } finally {
      setDismissingFetchFailed(false);
    }
  }, [stats, refreshStats, showToast]);

  const handleRecentPageChange = useCallback((page: number) => {
    setRecentPage(page);
    refreshRecent(page);
  }, [refreshRecent]);

  const totalPages = Math.ceil(recentTotal / PAGE_SIZE);
  const classified = stats ? stats.touchless + stats.not_touchless : 0;
  const totalQueue = stats?.unclassified_with_website ?? 0;
  const progressPct = totalInQueue > 0 ? Math.round((processedCount / totalInQueue) * 100) : 0;
  const estimatedMinsRemaining = speed > 0 && totalQueue > 0
    ? Math.round((totalQueue - processedCount) / speed)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="container mx-auto px-4 max-w-7xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-[#0F2744] flex items-center gap-1 transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Classification Pipeline</span>
        </div>

        <div className="flex items-start justify-between mt-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Brain className="w-6 h-6 text-[#0F2744]" />
              <h1 className="text-3xl font-bold text-[#0F2744]">Classification Pipeline</h1>
            </div>
            <p className="text-gray-500">
              Fetch each car wash website and classify touchless vs. non-touchless using AI. Runs entirely in your browser.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { await Promise.all([refreshStats(), refreshRecent(recentPage)]); }}
            disabled={runState === 'running'}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            {loadingStats ? (
              <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-gray-200">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : stats ? (
              <StatsGrid
                stats={stats}
                onDismissFetchFailed={handleDismissFetchFailed}
                dismissingFetchFailed={dismissingFetchFailed}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">Classification Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Concurrency</label>
                  <select
                    value={concurrency}
                    onChange={e => setConcurrency(Number(e.target.value))}
                    disabled={runState === 'running'}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2744]/20 disabled:opacity-50"
                  >
                    <option value={1}>1 — Slowest, most reliable</option>
                    <option value={2}>2 — Conservative</option>
                    <option value={3}>3 — Recommended</option>
                    <option value={5}>5 — Fastest</option>
                  </select>
                </div>

                {runState === 'idle' || runState === 'done' ? (
                  <Button
                    className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                    onClick={handleStart}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {runState === 'done' ? 'Run Again' : 'Start Classification'}
                  </Button>
                ) : runState === 'running' ? (
                  <Button
                    variant="outline"
                    className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={handlePause}
                  >
                    <Pause className="w-4 h-4 mr-2" /> Pause
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                      onClick={handleResume}
                    >
                      <Play className="w-4 h-4 mr-2" /> Resume
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full text-gray-600"
                      onClick={handleStart}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Restart from Beginning
                    </Button>
                  </div>
                )}

                <div className="border border-gray-100 rounded-lg bg-gray-50 p-3 flex gap-2 items-start">
                  <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500">
                    Keep this tab open while running. Already-classified listings are automatically skipped.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {runState !== 'idle' && (
          <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-[#0F2744] flex items-center gap-2">
                {runState === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                {runState === 'paused' && <Pause className="w-4 h-4 text-amber-500" />}
                {runState === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {runState === 'running' ? 'Classifying…' : runState === 'paused' ? 'Paused' : 'Complete'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Processing: <span className="font-semibold text-[#0F2744]">{processedCount.toLocaleString()}</span>
                    {totalInQueue > 0 && <> / {totalInQueue.toLocaleString()} ({progressPct}%)</>}
                  </span>
                  <div className="flex items-center gap-3 text-gray-400">
                    {speed > 0 && <span>~{speed}/min</span>}
                    {estimatedMinsRemaining !== null && estimatedMinsRemaining > 0 && (
                      <span>~{estimatedMinsRemaining >= 60
                        ? `${Math.floor(estimatedMinsRemaining / 60)}h ${estimatedMinsRemaining % 60}m`
                        : `${estimatedMinsRemaining}m`} remaining</span>
                    )}
                  </div>
                </div>
                {totalInQueue > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}
                {currentListing && runState === 'running' && (
                  <p className="text-xs text-gray-400 truncate">
                    <span className="font-medium text-gray-500">Current:</span> {currentListing}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Live Results</p>
                <div
                  ref={logRef}
                  className="bg-gray-50 border border-gray-100 rounded-lg p-3 h-48 overflow-y-auto font-mono"
                >
                  {log.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center mt-16">Results will appear here…</p>
                  ) : (
                    log.map((entry, i) => <LogLine key={`${entry.listing_id}-${i}`} entry={entry} />)
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {([
                  { label: 'Touchless', count: liveCounts.touchless, color: 'text-green-600' },
                  { label: 'Not Touchless', count: liveCounts.not_touchless, color: 'text-red-500' },
                  { label: 'Unknown', count: liveCounts.unknown, color: 'text-amber-500' },
                  { label: 'Failed', count: liveCounts.failed, color: 'text-orange-500' },
                ] as const).map(({ label, count, color }) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-lg p-2">
                    <p className={`text-lg font-bold tabular-nums ${color}`}>{count}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[#0F2744]">
                Recent Classifications
                {recentTotal > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({recentTotal.toLocaleString()} total)</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {runState === 'running' && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <RecentRunsTable
              listings={recentListings}
              page={recentPage}
              totalPages={totalPages}
              total={recentTotal}
              onPageChange={handleRecentPageChange}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
