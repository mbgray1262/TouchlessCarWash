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
  const [touchless, not_touchless, unclassified_with, unclassified_no, fetch_failed, classify_failed, unknown, never_attempted] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_touchless', true),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_touchless', false),
    supabase.from('listings').select('id', { count: 'exact', head: true }).is('is_touchless', null).not('website', 'is', null).neq('website', ''),
    supabase.from('listings').select('id', { count: 'exact', head: true }).is('is_touchless', null).or('website.is.null,website.eq.'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'fetch_failed'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'classify_failed'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('crawl_status', 'unknown'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).is('is_touchless', null).not('website', 'is', null).neq('website', '').is('crawl_status', null),
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
    never_attempted: never_attempted.count ?? 0,
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
  const [firecrawlJobs, setFirecrawlJobs] = useState<Array<{ job_id: string; chunk_index: number; urls_submitted: number }>>([]);
  const [firecrawlJobCursors, setFirecrawlJobCursors] = useState<Record<string, string | null>>({});
  const [firecrawlJobDone, setFirecrawlJobDone] = useState<Record<string, boolean>>({});
  const [firecrawlJobScraped, setFirecrawlJobScraped] = useState<Record<string, number>>({});
  const [firecrawlJobPagesClassified, setFirecrawlJobPagesClassified] = useState<Record<string, number>>({});
  const [firecrawlJobTotalPages, setFirecrawlJobTotalPages] = useState<Record<string, number>>({});
  const [firecrawlTotalProcessed, setFirecrawlTotalProcessed] = useState(0);
  const [firecrawlPolling, setFirecrawlPolling] = useState(false);
  const [firecrawlAllDone, setFirecrawlAllDone] = useState(false);
  const [firecrawlPollError, setFirecrawlPollError] = useState<string | null>(null);
  const [firecrawlConsecErrors, setFirecrawlConsecErrors] = useState(0);
  const firecrawlPollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [kicking, setKicking] = useState(false);
  const [extractingRemaining, setExtractingRemaining] = useState(false);
  const [confirmExtract, setConfirmExtract] = useState(false);

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

  const loadActiveBatch = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pipeline_batches')
        .select('firecrawl_job_id, total_urls, status, classify_status')
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.firecrawl_job_id) {
        const alreadyLoaded = firecrawlJobs.some(j => j.job_id === data.firecrawl_job_id);
        if (!alreadyLoaded) {
          setFirecrawlJobs([{
            job_id: data.firecrawl_job_id,
            chunk_index: 0,
            urls_submitted: data.total_urls ?? 8148,
          }]);
          setFirecrawlJobCursors({});
          setFirecrawlJobDone({});
          setFirecrawlJobScraped({});
          setFirecrawlJobPagesClassified({});
          setFirecrawlJobTotalPages({});
          setFirecrawlTotalProcessed(0);
          setFirecrawlAllDone(false);
          setFirecrawlPolling(false);
        }
      }
    } catch { /* silent */ }
  }, [firecrawlJobs]);

  useEffect(() => {
    const init = async () => {
      setLoadingStats(true);
      await Promise.all([refreshStats(), refreshRecent(0), pollJob(), loadActiveBatch()]);
      setLoadingStats(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleKick = useCallback(async () => {
    if (!job) return;
    setKicking(true);
    try {
      const res = await callBatchFn({ action: 'kick', job_id: job.id });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error ?? 'Failed to restart processing loop');
      } else {
        showToast('success', 'Processing loop restarted.');
        await pollJob();
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setKicking(false);
    }
  }, [job, pollJob, showToast]);

  const handleFirecrawlRetry = useCallback(async () => {
    setRetryingWithFirecrawl(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'retry_all_chunks', app_url: window.location.origin }),
      });
      const data = await res.json();
      if (res.status === 409 && data.already_running) {
        // A batch is already running — load it into state so the poll UI appears
        showToast('error', 'A Firecrawl batch is already running. Resuming polling of existing job.');
        const existingJobId = data.existing_job_id as string;
        setFirecrawlJobs([{ job_id: existingJobId, chunk_index: 0, urls_submitted: 8148 }]);
        setFirecrawlJobCursors({});
        setFirecrawlJobDone({});
        setFirecrawlJobScraped({});
        setFirecrawlTotalProcessed(0);
        setFirecrawlAllDone(false);
        setFirecrawlPolling(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit Firecrawl batches');
      if (data.done || !data.batches || data.batches.length === 0) {
        showToast('success', 'No listings to retry — all caught up!');
        return;
      }
      const batches = data.batches as Array<{ job_id: string; chunk_index: number; urls_submitted: number }>;
      setFirecrawlJobs(batches);
      setFirecrawlJobCursors({});
      setFirecrawlJobDone({});
      setFirecrawlJobScraped({});
      setFirecrawlTotalProcessed(0);
      setFirecrawlAllDone(false);
      setFirecrawlPolling(false);
      const totalUrls = data.total_submitted ?? batches.reduce((s: number, b: { urls_submitted: number }) => s + b.urls_submitted, 0);
      showToast('success', `Submitted ${batches.length} batch${batches.length > 1 ? 'es' : ''} to Firecrawl (${totalUrls.toLocaleString()} URLs total). All running in parallel.`);
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setRetryingWithFirecrawl(false);
    }
  }, [showToast]);

  const pollSingleJob = useCallback(async (
    jobId: string,
    cursor: string | null,
  ): Promise<{ processed: number; next_cursor: string | null; done: boolean; total_completed: number; total_urls: number; waiting: boolean }> => {
    const res = await fetch('/api/pipeline/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, next_cursor: cursor, page_limit: 20 }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.expired) throw Object.assign(new Error('Firecrawl job data expired.'), { expired: true });
      throw new Error(data.error ?? 'Poll failed');
    }
    return {
      processed: data.processed ?? 0,
      next_cursor: data.next_cursor ?? null,
      done: !!data.done,
      total_completed: data.total_completed ?? 0,
      total_urls: data.total_urls ?? 0,
      waiting: (data.page_size ?? 0) === 0,
    };
  }, []);

  const handleFirecrawlAutoPoll = useCallback(async () => {
    if (firecrawlJobs.length === 0) return;
    if (firecrawlPollTimerRef.current) clearTimeout(firecrawlPollTimerRef.current);
    setFirecrawlPolling(true);
    setFirecrawlPollError(null);
    setFirecrawlConsecErrors(0);

    const cursors: Record<string, string | null> = { ...firecrawlJobCursors };
    const done: Record<string, boolean> = { ...firecrawlJobDone };

    // Pre-mark any batches that are already fully classified so we don't re-run Claude on them
    const jobIds = firecrawlJobs.map(j => j.job_id);
    const { data: batchRows } = await supabase
      .from('pipeline_batches')
      .select('firecrawl_job_id, classify_status')
      .in('firecrawl_job_id', jobIds);
    for (const row of (batchRows ?? [])) {
      if (row.classify_status === 'completed' || row.classify_status === 'expired') {
        done[row.firecrawl_job_id] = true;
      }
    }
    const scraped: Record<string, number> = { ...firecrawlJobScraped };
    const pagesClassified: Record<string, number> = { ...firecrawlJobPagesClassified };
    const totalPages: Record<string, number> = { ...firecrawlJobTotalPages };
    let totalProcessed = firecrawlTotalProcessed;

    let consecErrors = 0;

    const pollRound = async (): Promise<void> => {
      const pendingJobs = firecrawlJobs.filter(j => !done[j.job_id]);
      if (pendingJobs.length === 0) {
        setFirecrawlAllDone(true);
        setFirecrawlPolling(false);
        setFirecrawlJobDone({ ...done });
        await refreshStats();
        showToast('success', `All done! Classified ${totalProcessed.toLocaleString()} listings from Firecrawl.`);
        return;
      }

      const results = await Promise.allSettled(
        pendingJobs.map(j => pollSingleJob(j.job_id, cursors[j.job_id] ?? null))
      );

      let anyWaiting = false;
      let anySuccess = false;
      const errorMessages: string[] = [];
      for (let i = 0; i < pendingJobs.length; i++) {
        const job = pendingJobs[i];
        const result = results[i];
        if (result.status === 'fulfilled') {
          const r = result.value;
          anySuccess = true;
          totalProcessed += r.processed;
          cursors[job.job_id] = r.next_cursor;
          scraped[job.job_id] = r.total_completed;
          pagesClassified[job.job_id] = (pagesClassified[job.job_id] ?? 0) + 1;
          if (!totalPages[job.job_id] && r.total_urls > 0) {
            totalPages[job.job_id] = Math.ceil(r.total_urls / 20);
          }
          if (r.done) done[job.job_id] = true;
          if (r.waiting) anyWaiting = true;
        } else {
          errorMessages.push(result.reason?.message ?? 'Unknown error');
          if ((result.reason as { expired?: boolean })?.expired) {
            setFirecrawlPolling(false);
            showToast('error', 'Firecrawl job data expired. Please retry with Firecrawl.');
            return;
          }
        }
      }

      if (anySuccess) {
        consecErrors = 0;
        setFirecrawlPollError(null);
      } else if (errorMessages.length > 0) {
        consecErrors++;
        const errMsg = errorMessages[0];
        setFirecrawlPollError(errMsg);
        setFirecrawlConsecErrors(consecErrors);
        if (consecErrors >= 5) {
          setFirecrawlPolling(false);
          showToast('error', `Polling stopped after 5 consecutive errors: ${errMsg}`);
          return;
        }
      }

      setFirecrawlTotalProcessed(totalProcessed);
      setFirecrawlJobCursors({ ...cursors });
      setFirecrawlJobDone({ ...done });
      setFirecrawlJobScraped({ ...scraped });
      setFirecrawlJobPagesClassified({ ...pagesClassified });
      setFirecrawlJobTotalPages({ ...totalPages });

      const allFinished = firecrawlJobs.every(j => done[j.job_id]);
      if (allFinished) {
        setFirecrawlAllDone(true);
        setFirecrawlPolling(false);
        await refreshStats();
        showToast('success', `All done! Classified ${totalProcessed.toLocaleString()} listings from Firecrawl.`);
        return;
      }

      const delay = anyWaiting ? 5000 : consecErrors > 0 ? 8000 : 1500;
      firecrawlPollTimerRef.current = setTimeout(pollRound, delay);
    };

    pollRound();
  }, [firecrawlJobs, firecrawlJobCursors, firecrawlJobDone, firecrawlJobScraped, firecrawlJobPagesClassified, firecrawlJobTotalPages, firecrawlTotalProcessed, pollSingleJob, refreshStats, showToast]);

  useEffect(() => {
    return () => { if (firecrawlPollTimerRef.current) clearTimeout(firecrawlPollTimerRef.current); };
  }, []);

  const handleExtractRemaining = useCallback(async () => {
    const count = stats?.never_attempted ?? 0;
    setExtractingRemaining(true);
    setConfirmExtract(false);
    try {
      const res = await callBatchFn({ action: 'start', concurrency, never_attempted_only: true });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error ?? 'Failed to start');
      } else {
        showToast('success', `Started classification for ${count.toLocaleString()} never-attempted listings.`);
        await pollJob();
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setExtractingRemaining(false);
    }
  }, [stats, concurrency, pollJob, showToast]);

  const handleRecentPageChange = useCallback((page: number) => {
    setRecentPage(page);
    refreshRecent(page);
  }, [refreshRecent]);

  const isRunning = job?.status === 'running';
  const isPaused = job?.status === 'paused';
  const isDone = job?.status === 'done';
  const isFailed = job?.status === 'failed';
  const isActive = isRunning || isPaused;

  const isStalled = isRunning && job?.updated_at
    ? (Date.now() - new Date(job.updated_at).getTime()) > 5 * 60 * 1000
    : false;

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
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                      onClick={handleStart}
                      disabled={actionLoading || extractingRemaining}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      {isDone ? 'Run Again' : isFailed ? 'Retry' : 'Start Classification'}
                    </Button>
                    {(stats?.never_attempted ?? 0) > 0 && (
                      confirmExtract ? (
                        <div className="border border-teal-200 rounded-lg bg-teal-50 p-3 space-y-2">
                          <p className="text-xs text-teal-800 font-medium">
                            Process {(stats?.never_attempted ?? 0).toLocaleString()} never-attempted listings?
                          </p>
                          <p className="text-xs text-teal-700">
                            Only sites with no crawl history will be processed. Already-failed and classified listings are unaffected.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs h-8"
                              onClick={handleExtractRemaining}
                              disabled={extractingRemaining}
                            >
                              {extractingRemaining ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                              Confirm
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 text-xs h-8"
                              onClick={() => setConfirmExtract(false)}
                              disabled={extractingRemaining}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full border-teal-300 text-teal-700 hover:bg-teal-50"
                          onClick={() => setConfirmExtract(true)}
                          disabled={actionLoading || extractingRemaining}
                        >
                          <Play className="w-4 h-4 mr-2" /> Extract Remaining ({(stats?.never_attempted ?? 0).toLocaleString()})
                        </Button>
                      )
                    )}
                  </div>
                ) : isRunning ? (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={handlePause}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
                      Pause
                    </Button>
                    {isStalled && (
                      <div className="space-y-2">
                        <div className="border border-red-100 rounded-lg bg-red-50 p-3">
                          <p className="text-xs text-red-800 font-medium mb-0.5">Processing loop stalled</p>
                          <p className="text-xs text-red-700">No progress in over 5 minutes. The self-scheduling chain has broken.</p>
                        </div>
                        <Button
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          onClick={handleKick}
                          disabled={kicking}
                        >
                          {kicking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                          Restart Processing Loop
                        </Button>
                      </div>
                    )}
                  </div>
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

                {isDone && ((stats?.fetch_failed ?? 0) + (stats?.unknown ?? 0) + (stats?.classify_failed ?? 0)) > 0 && (
                  <div className="border border-blue-100 rounded-lg bg-blue-50 p-3 space-y-2">
                    <p className="text-xs text-blue-800 font-medium">
                      {((stats?.fetch_failed ?? 0) + (stats?.unknown ?? 0) + (stats?.classify_failed ?? 0)).toLocaleString()} listings need a retry
                    </p>
                    <p className="text-xs text-blue-700">
                      {stats?.fetch_failed ?? 0} fetch failed + {stats?.unknown ?? 0} unknown + {stats?.classify_failed ?? 0} classify failed. Firecrawl can resolve most of these using JS rendering and proxy rotation.
                    </p>
                    <Button
                      type="button"
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

                {firecrawlJobs.length > 0 && !firecrawlAllDone && (
                  <div className="border border-blue-200 rounded-lg bg-blue-50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-blue-800 font-semibold">
                        {firecrawlPolling ? 'Classifying results…' : 'Firecrawl batches ready'}
                      </p>
                      <span className="text-xs text-blue-500 font-medium">
                        {firecrawlJobs.length} batch{firecrawlJobs.length > 1 ? 'es' : ''} in parallel
                      </span>
                    </div>

                    {firecrawlPolling ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-blue-700">Polling all {firecrawlJobs.length} Firecrawl jobs simultaneously and classifying with AI…</p>
                        <div className="space-y-1">
                          {firecrawlJobs.map(j => {
                            const isDoneJob = firecrawlJobDone[j.job_id] ?? false;
                            const pages = firecrawlJobPagesClassified[j.job_id] ?? 0;
                            const total = firecrawlJobTotalPages[j.job_id] ?? Math.ceil(j.urls_submitted / 20);
                            const pct = total > 0 ? Math.min(99, Math.round((pages / total) * 100)) : 0;
                            return (
                              <div key={j.job_id} className="flex items-center gap-2">
                                <span className="text-[10px] text-blue-600 w-14 shrink-0">Batch {j.chunk_index + 1}</span>
                                <div className="flex-1 bg-blue-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all duration-500 ${isDoneJob ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${isDoneJob ? 100 : pct}%` }}
                                  />
                                </div>
                                {isDoneJob
                                  ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                                  : <span className="text-[10px] text-blue-500 w-7 text-right shrink-0">{pct}%</span>
                                }
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-blue-500">{firecrawlTotalProcessed.toLocaleString()} classified so far across all batches</p>
                        {firecrawlPollError && (
                          <div className="flex items-start gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>Error ({firecrawlConsecErrors}/5): {firecrawlPollError}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-blue-700">
                        {firecrawlTotalProcessed > 0
                          ? `${firecrawlTotalProcessed.toLocaleString()} classified so far. Click below to continue.`
                          : `${firecrawlJobs.reduce((s, j) => s + j.urls_submitted, 0).toLocaleString()} listings across ${firecrawlJobs.length} parallel batch${firecrawlJobs.length > 1 ? 'es' : ''}. Click below when Firecrawl is done scraping.`}
                      </p>
                    )}

                    <Button
                      type="button"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                      onClick={handleFirecrawlAutoPoll}
                      disabled={firecrawlPolling}
                    >
                      {firecrawlPolling
                        ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Classifying all batches…</>
                        : <><Zap className="w-3 h-3 mr-1" /> Fetch &amp; Classify All Results</>
                      }
                    </Button>
                    {!firecrawlPolling && <p className="text-[10px] text-blue-400">Tip: wait a minute or two for Firecrawl to finish scraping before clicking.</p>}
                  </div>
                )}

                {firecrawlJobs.length > 0 && firecrawlAllDone && (
                  <div className="border border-green-200 rounded-lg bg-green-50 p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <p className="text-xs text-green-800 font-medium">All Firecrawl batches complete — {firecrawlTotalProcessed.toLocaleString()} listings processed.</p>
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
