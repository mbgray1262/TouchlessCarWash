'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RefreshCw, SkipForward, Loader2, Zap, AlertCircle, ChevronRight, CheckCircle2, XCircle, Clock, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { StatsGrid } from './StatsGrid';
import { RecentRunsTable } from './RecentRunsTable';
import type { PipelineBatch, PipelineStatusResponse } from './types';

type UIState = 'idle' | 'submitting' | 'polling' | 'refreshing';

interface FirecrawlProgress {
  status: string;
  total: number;
  completed: number;
  credits_used: number;
}

function StatusBadge({ status }: { status: PipelineBatch['status'] }) {
  if (status === 'completed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Completed
    </span>
  );
  if (status === 'running') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
      <Loader2 className="w-3 h-3 animate-spin" /> Running
    </span>
  );
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

function BatchProgressCard({
  batch,
  onPoll,
  polling,
  fcProgress,
  classifyCount,
}: {
  batch: PipelineBatch;
  onPoll: (jobId: string) => void;
  polling: string | null;
  fcProgress: FirecrawlProgress | null;
  classifyCount: number | null;
}) {
  const scrapeTotal = fcProgress?.total ?? batch.total_urls;
  const scrapeCompleted = fcProgress?.completed ?? batch.completed_count;
  const pct = scrapeTotal > 0
    ? Math.min(100, Math.round((scrapeCompleted / scrapeTotal) * 100))
    : 0;
  const isPolling = polling === batch.firecrawl_job_id;
  const fcStatus = fcProgress?.status ?? batch.status;
  const isLive = !!fcProgress;
  const effectiveStatus: PipelineBatch['status'] =
    fcStatus === 'completed' ? 'completed' :
    fcStatus === 'failed' ? 'failed' :
    batch.status;

  const isClassifying = isPolling && classifyCount !== null;
  const classifyTotal = batch.total_urls > 0 ? batch.total_urls : scrapeTotal;
  const classifyPct = isClassifying && classifyTotal > 0
    ? Math.min(99, Math.round((classifyCount! / classifyTotal) * 100))
    : null;

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-gray-400 shrink-0">Chunk #{batch.chunk_index + 1}</span>
          <StatusBadge status={effectiveStatus} />
          {isLive && effectiveStatus !== batch.status && (
            <span className="text-xs text-gray-400 font-medium">scraped, pending classify</span>
          )}
          <span className="text-xs text-gray-400 truncate hidden sm:block">
            {batch.firecrawl_job_id ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 tabular-nums">
            {scrapeCompleted.toLocaleString()} / {scrapeTotal.toLocaleString()}
            {isLive && <span className="text-blue-500 ml-1">scraped</span>}
          </span>
          {batch.status === 'running' && batch.firecrawl_job_id && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onPoll(batch.firecrawl_job_id!)}
              disabled={isPolling}
            >
              {isPolling ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Classifying…</>
              ) : effectiveStatus === 'completed' ? 'Classify Results' : 'Poll Status'}
            </Button>
          )}
          <span className="text-xs text-gray-400 tabular-nums font-semibold w-10 text-right">{pct}%</span>
        </div>
      </div>

      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
            effectiveStatus === 'completed' ? 'bg-green-500' :
            effectiveStatus === 'failed' ? 'bg-red-400' :
            'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
        {effectiveStatus === 'running' && pct < 100 && pct > 0 && (
          <div
            className="absolute inset-y-0 rounded-full bg-blue-300/40 animate-pulse"
            style={{ left: `${pct}%`, width: '8%' }}
          />
        )}
        {effectiveStatus === 'running' && pct === 0 && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-300/40 to-transparent animate-[shimmer_1.5s_infinite]" />
        )}
      </div>

      {isClassifying && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-600 font-medium flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Classifying with AI…
            </span>
            <span className="text-gray-500 tabular-nums">
              {classifyCount!.toLocaleString()} / {classifyTotal.toLocaleString()} ({classifyPct}%)
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-amber-100 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all duration-500"
              style={{ width: `${classifyPct ?? 0}%` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/40 to-transparent animate-[shimmer_1.5s_infinite]" />
          </div>
        </div>
      )}

      {isPolling && !isClassifying && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Fetching results from Firecrawl…</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {new Date(batch.created_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
        <span className="flex items-center gap-3">
          {isLive && fcStatus !== 'completed' && fcStatus !== 'failed' && (
            <span className="text-blue-500 flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> scraping</span>
          )}
          {(fcProgress?.credits_used ?? batch.credits_used) > 0 && (
            <span>{(fcProgress?.credits_used ?? batch.credits_used).toLocaleString()} credits used</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineStatusResponse | null>(null);
  const [uiState, setUiState] = useState<UIState>('idle');
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [lastSubmitResult, setLastSubmitResult] = useState<{ jobId: string; urls: number } | null>(null);
  const [runsPage, setRunsPage] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [fcProgressMap, setFcProgressMap] = useState<Record<string, FirecrawlProgress>>({});
  const [classifyProgressMap, setClassifyProgressMap] = useState<Record<string, number>>({});
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const fcPollRef = useRef<NodeJS.Timeout | null>(null);
  const runsPageRef = useRef(runsPage);
  const loadStatusFnRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  useEffect(() => { runsPageRef.current = runsPage; }, [runsPage]);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const loadRuns = useCallback(async (page: number) => {
    try {
      const res = await fetch(`/api/pipeline/status?runs_page=${page}`);
      if (!res.ok) return;
      const json: PipelineStatusResponse & { total_runs?: number } = await res.json();
      setData(prev => prev ? { ...prev, recent_runs: json.recent_runs } : json);
      if (json.total_runs !== undefined) setTotalRuns(json.total_runs);
    } catch { /* silent */ }
  }, []);

  const loadStatus = useCallback(async (silent = false) => {
    if (!silent) setUiState('refreshing');
    try {
      const res = await fetch(`/api/pipeline/status?runs_page=${runsPageRef.current}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json: PipelineStatusResponse & { total_runs?: number } = await res.json();
      setData(json);
      if (json.total_runs !== undefined) setTotalRuns(json.total_runs);
    } catch (err) {
      if (!silent) showToast('error', (err as Error).message);
    } finally {
      if (!silent) setUiState('idle');
    }
  }, [showToast]);

  useEffect(() => {
    loadStatusFnRef.current = loadStatus;
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      if (loadStatusFnRef.current) loadStatusFnRef.current(true);
    }, 5_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, []);

  const fetchFcProgress = useCallback(async (batches: PipelineBatch[]) => {
    const running = batches.filter(b => b.status === 'running' && b.firecrawl_job_id);
    if (running.length === 0) return;
    const results = await Promise.allSettled(
      running.map(b =>
        fetch('/api/pipeline/firecrawl-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: b.firecrawl_job_id }),
        }).then(r => r.json()).then(j => ({ jobId: b.firecrawl_job_id!, progress: j as FirecrawlProgress & { error?: string } }))
      )
    );
    setFcProgressMap(prev => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.progress.error) {
          next[r.value.jobId] = r.value.progress;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!data) return;
    fetchFcProgress(data.batches);
    if (fcPollRef.current) clearInterval(fcPollRef.current);
    const running = data.batches.filter(b => b.status === 'running');
    if (running.length > 0) {
      fcPollRef.current = setInterval(() => fetchFcProgress(data.batches), 10_000);
    }
    return () => { if (fcPollRef.current) clearInterval(fcPollRef.current); };
  }, [data, fetchFcProgress]);

  const handleSubmitBatch = useCallback(async (retryFailed = false) => {
    setUiState('submitting');
    try {
      const res = await fetch('/api/pipeline/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retry_failed: retryFailed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      if (json.done) {
        showToast('success', 'No more listings to process — queue is empty.');
      } else {
        setLastSubmitResult({ jobId: json.job_id, urls: json.urls_submitted });
        showToast('success', `Batch submitted — ${json.urls_submitted?.toLocaleString()} URLs sent to Firecrawl.`);
      }
      await loadStatus();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setUiState('idle');
    }
  }, [loadStatus, showToast]);

  const handlePollBatch = useCallback(async (jobId: string) => {
    setPollingJobId(jobId);
    setUiState('polling');

    let totalProcessed = 0;
    let nextCursor: string | null = null;

    try {
      while (true) {
        const res = await fetch('/api/pipeline/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, next_cursor: nextCursor }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);

        totalProcessed += json.processed ?? 0;
        setClassifyProgressMap(prev => ({ ...prev, [jobId]: json.total_completed ?? totalProcessed }));

        if (json.done) break;
        nextCursor = json.next_cursor;
      }

      showToast('success', `Classified ${totalProcessed.toLocaleString()} results`);
      await loadStatus();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setClassifyProgressMap(prev => { const n = { ...prev }; delete n[jobId]; return n; });
      setPollingJobId(null);
      setUiState('idle');
    }
  }, [loadStatus, showToast]);

  const isRunning = uiState !== 'idle';
  const nextBatchNum = (data?.batches.length ?? 0) + 1;
  const runningBatches = data?.batches.filter(b => b.status === 'running') ?? [];
  const hasRunningBatches = runningBatches.length > 0;
  const pendingClassifyCount = runningBatches.filter(b =>
    b.firecrawl_job_id && fcProgressMap[b.firecrawl_job_id]?.status === 'completed'
  ).length;

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
          <span className="text-sm font-medium text-[#0F2744]">Firecrawl Pipeline</span>
        </div>

        <div className="flex items-start justify-between mt-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <Zap className="w-6 h-6 text-[#0F2744]" />
              <h1 className="text-3xl font-bold text-[#0F2744]">Firecrawl Pipeline</h1>
            </div>
            <p className="text-gray-500">
              Scrape unclassified car wash websites and classify touchless vs. non-touchless using AI.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live — refreshing every 5s
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadStatus()}
              disabled={isRunning}
            >
              {uiState === 'refreshing'
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Refreshing</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</>
              }
            </Button>
          </div>
        </div>

        {lastSubmitResult && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-semibold">Batch running — {lastSubmitResult.urls.toLocaleString()} URLs submitted to Firecrawl</p>
              <p className="font-mono text-xs text-blue-600">Job ID: {lastSubmitResult.jobId}</p>
              <p className="text-xs text-blue-700">
                Firecrawl is now scraping the websites in the background. Use "Poll Results" on the batch below to fetch completed scrapes and run AI classification.
                The page auto-refreshes every 15 seconds.
              </p>
            </div>
          </div>
        )}

        {!lastSubmitResult && hasRunningBatches && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <div className="text-sm text-blue-800">
              {pendingClassifyCount > 0 ? (
                <>
                  <span className="font-semibold">{pendingClassifyCount} batch{pendingClassifyCount > 1 ? 'es' : ''} ready to classify.</span>{' '}
                  Firecrawl scraping is complete — click "Classify Results" on each batch below to run AI classification.
                </>
              ) : (
                <>
                  <span className="font-semibold">{runningBatches.length} batch{runningBatches.length > 1 ? 'es' : ''} scraping.</span>{' '}
                  Firecrawl is crawling websites in the background. The page auto-refreshes every 15s.
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            {data ? (
              <StatsGrid stats={data.stats} />
            ) : (
              <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-gray-200">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">Pipeline Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">
                    Submits up to 2,000 unclassified listings to Firecrawl for scraping.
                  </p>
                  <Button
                    className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                    onClick={() => handleSubmitBatch(false)}
                    disabled={isRunning}
                  >
                    {uiState === 'submitting'
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                      : <><Play className="w-4 h-4 mr-2" /> Start Batch #{nextBatchNum}</>
                    }
                  </Button>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-500 mb-1.5">
                    Resubmit listings with status "failed" or "timeout".
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSubmitBatch(true)}
                    disabled={isRunning}
                  >
                    <SkipForward className="w-4 h-4 mr-2" /> Retry Failed
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex gap-2.5 items-start">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">Safe to run multiple times</p>
                  <p>Only listings with <code className="bg-amber-100 px-1 rounded">is_touchless = NULL</code> are queued. Existing classifications are never overwritten.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Batches
              </CardTitle>
              {hasRunningBatches && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Auto-refreshing every 5s
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {!data || data.batches.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No batches submitted yet. Click "Start Batch" to begin.
              </div>
            ) : (
              <div className="space-y-3">
                {data.batches.map(batch => (
                  <BatchProgressCard
                    key={batch.id}
                    batch={batch}
                    onPoll={handlePollBatch}
                    polling={pollingJobId}
                    fcProgress={batch.firecrawl_job_id ? (fcProgressMap[batch.firecrawl_job_id] ?? null) : null}
                    classifyCount={batch.firecrawl_job_id ? (classifyProgressMap[batch.firecrawl_job_id] ?? null) : null}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[#0F2744]">
                Recent Classifications
                {totalRuns > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({totalRuns.toLocaleString()} total)</span>
                )}
              </CardTitle>
              {totalRuns > 50 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {runsPage * 50 + 1}–{Math.min((runsPage + 1) * 50, totalRuns)} of {totalRuns.toLocaleString()}
                  </span>
                  <button
                    onClick={() => { const p = runsPage - 1; setRunsPage(p); loadRuns(p); }}
                    disabled={runsPage === 0}
                    className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => { const p = runsPage + 1; setRunsPage(p); loadRuns(p); }}
                    disabled={(runsPage + 1) * 50 >= totalRuns}
                    className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <RecentRunsTable runs={data?.recent_runs ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
