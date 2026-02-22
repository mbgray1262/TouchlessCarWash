'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, RotateCcw, RefreshCw, Loader2, AlertCircle,
  ChevronRight, CheckCircle2, XCircle, HelpCircle, WifiOff, Brain, Server, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { StatsGrid } from './StatsGrid';
import { RecentRunsTable } from './RecentRunsTable';
import { supabase } from '@/lib/supabase';
import type { ClassifyStats, RecentListing } from './types';

const PAGE_SIZE = 50;
const POLL_INTERVAL = 4_000;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface PipelineJob {
  id: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'failed';
  concurrency: number;
  processed_count: number;
  touchless_count: number;
  not_touchless_count: number;
  unknown_count: number;
  failed_count: number;
  total_queue: number;
  offset: number;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  error: string | null;
}

async function callBatchFn(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/classify-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

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

export default function PipelinePage() {
  const [stats, setStats] = useState<ClassifyStats | null>(null);
  const [recentListings, setRecentListings] = useState<RecentListing[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentPage, setRecentPage] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dismissingFetchFailed, setDismissingFetchFailed] = useState(false);
  const [retryingWithFirecrawl, setRetryingWithFirecrawl] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statsTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const pollJob = useCallback(async () => {
    try {
      const res = await callBatchFn({ action: 'status' });
      const data = await res.json();
      const j: PipelineJob | null = data.job ?? null;
      setJob(j);

      if (j?.status === 'done') {
        await refreshStats();
        await refreshRecent(0);
      }
    } catch { /* silent */ }
  }, [refreshStats, refreshRecent]);

  useEffect(() => {
    const init = async () => {
      setLoadingStats(true);
      await Promise.all([refreshStats(), refreshRecent(0), pollJob()]);
      setLoadingStats(false);
    };
    init();
  }, [refreshStats, refreshRecent, pollJob]);

  useEffect(() => {
    pollTimerRef.current = setInterval(pollJob, POLL_INTERVAL);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [pollJob]);

  useEffect(() => {
    statsTimerRef.current = setInterval(() => {
      if (job?.status === 'running') {
        refreshStats();
        refreshRecent(0);
        setRecentPage(0);
      }
    }, 8000);
    return () => { if (statsTimerRef.current) clearInterval(statsTimerRef.current); };
  }, [job?.status, refreshStats, refreshRecent]);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await callBatchFn({ action: 'start', concurrency });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error ?? 'Failed to start');
      } else {
        showToast('success', 'Classification started in the background.');
        await pollJob();
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [concurrency, pollJob, showToast]);

  const handlePause = useCallback(async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      await callBatchFn({ action: 'pause', job_id: job.id });
      await pollJob();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [job, pollJob, showToast]);

  const handleResume = useCallback(async () => {
    if (!job) return;
    setActionLoading(true);
    try {
      const res = await callBatchFn({ action: 'resume', job_id: job.id });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error ?? 'Failed to resume');
      } else {
        await pollJob();
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [job, pollJob, showToast]);

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

  const handleFirecrawlRetry = useCallback(async () => {
    const retryCount = (stats?.fetch_failed ?? 0) + (stats?.unknown ?? 0);
    if (!confirm(`Submit ${retryCount.toLocaleString()} fetch-failed and unknown listings to Firecrawl for a second attempt?\n\nFirecrawl uses JS rendering and proxy rotation which resolves most failures. This will use Firecrawl credits.`)) return;
    setRetryingWithFirecrawl(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'retry_classify_failures',
          app_url: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error ?? 'Failed to submit Firecrawl retry batch');
      } else if (data.done) {
        showToast('success', 'No listings to retry — all caught up!');
      } else {
        showToast('success', `Submitted ${data.urls_submitted.toLocaleString()} listings to Firecrawl (job ${data.job_id}). Use the Bulk Verify page to poll results.`);
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setRetryingWithFirecrawl(false);
    }
  }, [stats, showToast]);

  const handleRecentPageChange = useCallback((page: number) => {
    setRecentPage(page);
    refreshRecent(page);
  }, [refreshRecent]);

  const isRunning = job?.status === 'running';
  const isPaused = job?.status === 'paused';
  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed';
  const isActive = isRunning || isPaused;

  const progressPct = job && job.total_queue > 0
    ? Math.round((job.processed_count / job.total_queue) * 100)
    : 0;

  const totalPages = Math.ceil(recentTotal / PAGE_SIZE);

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
            <p className="text-gray-500 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-green-500" />
              Runs in the background — you can close this tab safely.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { await Promise.all([refreshStats(), refreshRecent(recentPage), pollJob()]); }}
            disabled={isRunning}
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
                    disabled={isActive}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2744]/20 disabled:opacity-50"
                  >
                    <option value={1}>1 — Slowest, most reliable</option>
                    <option value={2}>2 — Conservative</option>
                    <option value={3}>3 — Recommended</option>
                    <option value={5}>5 — Fastest</option>
                  </select>
                </div>

                {!isActive ? (
                  <Button
                    className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                    onClick={handleStart}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {isDone ? 'Run Again' : isFailed ? 'Retry' : 'Start Classification'}
                  </Button>
                ) : isRunning ? (
                  <Button
                    variant="outline"
                    className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={handlePause}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
                    Pause
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                      onClick={handleResume}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Resume
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full text-gray-600"
                      onClick={handleStart}
                      disabled={actionLoading}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Restart from Beginning
                    </Button>
                  </div>
                )}

                {isDone && ((stats?.fetch_failed ?? 0) + (stats?.unknown ?? 0)) > 0 && (
                  <div className="border border-blue-100 rounded-lg bg-blue-50 p-3 space-y-2">
                    <p className="text-xs text-blue-800 font-medium">
                      {((stats?.fetch_failed ?? 0) + (stats?.unknown ?? 0)).toLocaleString()} listings need a retry
                    </p>
                    <p className="text-xs text-blue-700">
                      {stats?.fetch_failed ?? 0} fetch failed + {stats?.unknown ?? 0} unknown. Firecrawl can resolve most of these using JS rendering and proxy rotation.
                    </p>
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                      onClick={handleFirecrawlRetry}
                      disabled={retryingWithFirecrawl}
                    >
                      {retryingWithFirecrawl
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Submitting to Firecrawl…</>
                        : <><Zap className="w-3.5 h-3.5 mr-1.5" /> Retry with Firecrawl</>
                      }
                    </Button>
                  </div>
                )}

                <div className="border border-green-100 rounded-lg bg-green-50 p-3 flex gap-2 items-start">
                  <Server className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">
                    Classification runs on the server. You can close this tab and it will continue.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {isActive || isDone || isFailed ? (
          <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-sm font-semibold text-[#0F2744] flex items-center gap-2">
                {isRunning && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                {isPaused && <Pause className="w-4 h-4 text-amber-500" />}
                {isDone && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {isFailed && <AlertCircle className="w-4 h-4 text-red-500" />}
                {isRunning ? 'Classifying…' : isPaused ? 'Paused' : isDone ? 'Complete' : 'Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {job && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        Processed: <span className="font-semibold text-[#0F2744]">{job.processed_count.toLocaleString()}</span>
                        {job.total_queue > 0 && <> / {job.total_queue.toLocaleString()} ({progressPct}%)</>}
                      </span>
                      {isRunning && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                          Running on server
                        </span>
                      )}
                    </div>
                    {job.total_queue > 0 && (
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {isFailed && job.error && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700">
                      <span className="font-semibold">Error:</span> {job.error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    {([
                      { label: 'Touchless', count: job.touchless_count, color: 'text-green-600' },
                      { label: 'Not Touchless', count: job.not_touchless_count, color: 'text-red-500' },
                      { label: 'Unknown', count: job.unknown_count, color: 'text-amber-500' },
                      { label: 'Failed', count: job.failed_count, color: 'text-orange-500' },
                    ] as const).map(({ label, count, color }) => (
                      <div key={label} className="bg-white border border-gray-100 rounded-lg p-2">
                        <p className={`text-lg font-bold tabular-nums ${color}`}>{count}</p>
                        <p className="text-xs text-gray-400">{label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[#0F2744]">
                Recent Classifications
                {recentTotal > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({recentTotal.toLocaleString()} total)</span>
                )}
              </CardTitle>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live
                </span>
              )}
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
