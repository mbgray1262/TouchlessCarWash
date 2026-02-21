'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RefreshCw, SkipForward, Loader2, Zap, AlertCircle, ChevronRight, CheckCircle2, XCircle, Clock, BarChart3, Brain, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { StatsGrid } from './StatsGrid';
import { RecentRunsTable } from './RecentRunsTable';
import type { PipelineBatch, PipelineStatusResponse } from './types';

type UIState = 'idle' | 'submitting' | 'polling' | 'refreshing';

// Returns a simple label + color for each batch's current lifecycle stage
function getBatchStage(batch: PipelineBatch): {
  label: string;
  sublabel: string;
  color: 'gray' | 'blue' | 'amber' | 'green' | 'red';
  canClassify: boolean;
} {
  if (batch.status === 'failed') {
    return { label: 'Failed', sublabel: 'Scraping failed', color: 'red', canClassify: false };
  }
  if (batch.classify_status === 'completed' || batch.status === 'completed') {
    return { label: 'Done', sublabel: 'Scraping + AI classification complete', color: 'green', canClassify: false };
  }
  if (batch.classify_status === 'running') {
    // If classify_status is "running" but updated more than 3 minutes ago, the browser tab
    // that was polling must have closed or crashed. Show button so it can be restarted.
    const updatedAt = new Date(batch.updated_at).getTime();
    const stale = Date.now() - updatedAt > 3 * 60 * 1000;
    if (stale) {
      return { label: 'Stalled — Click to Resume', sublabel: 'Classification stopped. Click Classify Results to resume.', color: 'blue', canClassify: true };
    }
    return { label: 'Classifying', sublabel: 'AI is classifying scraped results…', color: 'blue', canClassify: false };
  }
  if (batch.status === 'running') {
    const scraped = batch.completed_count;
    const total = batch.total_urls;
    if (scraped >= total) {
      return { label: 'Ready to Classify', sublabel: `All ${total.toLocaleString()} pages scraped — click Classify to run AI`, color: 'blue', canClassify: true };
    }
    return { label: 'Scraping', sublabel: `Firecrawl is crawling websites…`, color: 'blue', canClassify: false };
  }
  return { label: 'Pending', sublabel: 'Waiting to start', color: 'gray', canClassify: false };
}

function StagePill({ color, label }: { color: string; label: string }) {
  const styles: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };
  const icons: Record<string, React.ReactNode> = {
    gray: <Clock className="w-3 h-3" />,
    blue: <Loader2 className="w-3 h-3 animate-spin" />,
    amber: <Brain className="w-3 h-3" />,
    green: <CheckCircle2 className="w-3 h-3" />,
    red: <XCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-0.5 ${styles[color]}`}>
      {icons[color]}
      {label}
    </span>
  );
}

function BatchCard({
  batch,
  onClassify,
  isClassifyingThis,
  liveClassifiedCount,
}: {
  batch: PipelineBatch;
  onClassify: (jobId: string) => void;
  isClassifyingThis: boolean;
  liveClassifiedCount: number | null;
}) {
  const stage = getBatchStage(batch);
  const total = batch.total_urls;

  // Scrape progress bar
  const scrapeCount = batch.completed_count;
  const scrapePct = total > 0 ? Math.min(100, Math.round((scrapeCount / total) * 100)) : 0;

  // Classify progress — use live in-memory count while actively polling, otherwise use DB value
  const classifiedCount = isClassifyingThis && liveClassifiedCount !== null
    ? liveClassifiedCount
    : batch.classified_count;
  const classifyPct = total > 0 ? Math.min(100, Math.round((classifiedCount / total) * 100)) : 0;

  const isDone = stage.color === 'green';
  const isScraping = stage.label === 'Scraping';
  const isClassifying = stage.label === 'Classifying' || isClassifyingThis;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDone ? 'bg-green-50/40 border-green-200' : isClassifying ? 'bg-blue-50/30 border-blue-200' : isScraping ? 'bg-blue-50/30 border-blue-200' : 'bg-white border-gray-200'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#0F2744]">Batch #{batch.chunk_index + 1}</span>
            <StagePill color={stage.color} label={isClassifyingThis ? 'Classifying' : stage.label} />
            <span className="text-xs text-gray-400 font-mono truncate hidden sm:block">{batch.firecrawl_job_id ?? '—'}</span>
          </div>
          <p className="text-xs text-gray-500">{isClassifyingThis ? 'AI is classifying scraped results…' : stage.sublabel}</p>
        </div>

        {/* Classify button — only shown when ready and not yet done */}
        {(stage.canClassify || stage.label === 'Ready to Classify') && batch.firecrawl_job_id && (
          <Button
            size="sm"
            className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white shrink-0 h-8"
            onClick={() => onClassify(batch.firecrawl_job_id!)}
            disabled={isClassifyingThis}
          >
            {isClassifyingThis
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Classifying…</>
              : <><Brain className="w-3.5 h-3.5 mr-1.5" /> Classify Results</>
            }
          </Button>
        )}
      </div>

      {/* Scrape progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-medium">
            {isScraping ? (
              <span className="text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Scraping</span>
            ) : 'Scraped'}
          </span>
          <span className="tabular-nums font-semibold text-gray-700">{scrapeCount.toLocaleString()} / {total.toLocaleString()} &nbsp;{scrapePct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              scrapePct >= 100 ? 'bg-blue-400' : 'bg-blue-500'
            }`}
            style={{ width: `${scrapePct}%` }}
          />
        </div>
      </div>

      {/* Classify progress — always shown so you can see how many have been classified */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-medium">
            {isClassifying ? (
              <span className="text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Classifying with AI</span>
            ) : isDone ? (
              <span className="text-green-600">Classified</span>
            ) : (
              <span className="text-gray-400">AI Classification</span>
            )}
          </span>
          <span className={`tabular-nums font-semibold ${isDone ? 'text-green-600' : isClassifying ? 'text-blue-600' : 'text-gray-400'}`}>
            {classifiedCount.toLocaleString()} / {total.toLocaleString()} &nbsp;{classifyPct}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              isDone ? 'bg-green-500' : isClassifying ? 'bg-blue-500' : 'bg-gray-200'
            }`}
            style={{ width: `${classifyPct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-0.5">
        <span>
          Started {new Date(batch.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="flex items-center gap-3">
          {batch.credits_used > 0 && <span>{batch.credits_used.toLocaleString()} credits used</span>}
          {batch.classify_completed_at && (
            <span className="text-green-600">
              Finished {new Date(batch.classify_completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
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
  const [runsPage, setRunsPage] = useState(0);
  const [totalRuns, setTotalRuns] = useState(0);
  const [classifyProgressMap, setClassifyProgressMap] = useState<Record<string, number>>({});
  const [fcStatusMap, setFcStatusMap] = useState<Record<string, { status: string; total: number; completed: number; credits_used: number } | { error: string }>>({});
  const [checkingFcStatus, setCheckingFcStatus] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
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

  useEffect(() => { loadStatusFnRef.current = loadStatus; }, [loadStatus]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      if (loadStatusFnRef.current) loadStatusFnRef.current(true);
    }, 5_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, []);

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
        showToast('success', `Batch submitted — ${json.urls_submitted?.toLocaleString()} URLs sent to Firecrawl for scraping.`);
      }
      await loadStatus();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setUiState('idle');
    }
  }, [loadStatus, showToast]);

  const checkFirecrawlStatus = useCallback(async () => {
    setCheckingFcStatus(true);
    const batchList = data?.batches ?? [];
    const results: typeof fcStatusMap = {};
    await Promise.all(batchList.map(async (batch) => {
      if (!batch.firecrawl_job_id) return;
      try {
        const res = await fetch(`/api/pipeline/firecrawl-status?job_id=${batch.firecrawl_job_id}`);
        results[batch.firecrawl_job_id] = await res.json();
      } catch (e) {
        results[batch.firecrawl_job_id] = { error: (e as Error).message };
      }
    }));
    setFcStatusMap(results);
    setCheckingFcStatus(false);
  }, [data]);

  const handleClassify = useCallback(async (jobId: string) => {
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
  const batches = data?.batches ?? [];
  const nextBatchNum = batches.length + 1;

  // Derive a single clear status summary from actual DB state
  const scrapingBatches = batches.filter(b => b.status === 'running' && !b.classify_status && b.completed_count < b.total_urls);
  const readyToClassify = batches.filter(b => b.status === 'running' && !b.classify_status && b.completed_count >= b.total_urls);
  const classifyingBatches = batches.filter(b => b.classify_status === 'running' || pollingJobId === b.firecrawl_job_id);
  const doneBatches = batches.filter(b => b.classify_status === 'completed' || b.status === 'completed');

  let bannerMsg: React.ReactNode = null;
  if (pollingJobId) {
    const batch = batches.find(b => b.firecrawl_job_id === pollingJobId);
    const count = classifyProgressMap[pollingJobId] ?? batch?.classified_count ?? 0;
    const total = batch?.total_urls ?? 0;
    bannerMsg = (
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">AI classification running</span>
          {total > 0 && <span className="ml-2 text-blue-700">{count.toLocaleString()} / {total.toLocaleString()} classified so far</span>}
          <span className="ml-2 text-blue-600 text-xs">— do not close this tab</span>
        </div>
      </div>
    );
  } else if (readyToClassify.length > 0 && classifyingBatches.length === 0) {
    bannerMsg = (
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
        <Brain className="w-4 h-4 text-blue-600 shrink-0" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">{readyToClassify.length} batch{readyToClassify.length > 1 ? 'es' : ''} ready for AI classification.</span>{' '}
          Firecrawl scraping is complete. Click <strong>Classify Results</strong> on each batch below.
        </div>
      </div>
    );
  } else if (scrapingBatches.length > 0) {
    bannerMsg = (
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">{scrapingBatches.length} batch{scrapingBatches.length > 1 ? 'es' : ''} scraping.</span>{' '}
          Firecrawl is crawling websites in the background. This page auto-refreshes every 5s.
        </div>
      </div>
    );
  } else if (classifyingBatches.length > 0 && !pollingJobId) {
    bannerMsg = (
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
        <Brain className="w-4 h-4 text-blue-600 shrink-0" />
        <div className="text-sm text-blue-800">
          <span className="font-semibold">Classification is running</span> — results are being written to the database.
        </div>
      </div>
    );
  }

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
              Live — every 5s
            </span>
            <Button variant="outline" size="sm" onClick={() => loadStatus()} disabled={isRunning}>
              {uiState === 'refreshing'
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Refreshing</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</>
              }
            </Button>
          </div>
        </div>

        {bannerMsg}

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
                  <Button variant="outline" className="w-full" onClick={() => handleSubmitBatch(true)} disabled={isRunning}>
                    <SkipForward className="w-4 h-4 mr-2" /> Retry Failed
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="p-4 flex gap-2.5 items-start">
                <AlertCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                <div className="text-xs text-gray-600 space-y-1">
                  <p className="font-semibold">Safe to run multiple times</p>
                  <p>Only listings with <code className="bg-gray-200 px-1 rounded">is_touchless = NULL</code> are queued. Existing classifications are never overwritten.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Firecrawl Job Status Debug Panel */}
        {batches.length > 0 && (
          <Card className="mb-6 border-gray-200">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744] flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Firecrawl Job Status (Live from API)
                </CardTitle>
                <Button variant="outline" size="sm" onClick={checkFirecrawlStatus} disabled={checkingFcStatus}>
                  {checkingFcStatus ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking…</> : <><Search className="w-3.5 h-3.5 mr-1.5" />Check Firecrawl Jobs</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {Object.keys(fcStatusMap).length === 0 ? (
                <p className="text-xs text-gray-400">Click &quot;Check Firecrawl Jobs&quot; to see real-time status from Firecrawl API.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map(batch => {
                    const fc = batch.firecrawl_job_id ? fcStatusMap[batch.firecrawl_job_id] : null;
                    if (!fc) return null;
                    const hasError = 'error' in fc;
                    return (
                      <div key={batch.id} className="flex items-center gap-3 text-xs font-mono bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-400 truncate max-w-[200px]">{batch.firecrawl_job_id}</span>
                        {hasError ? (
                          <span className="text-red-600">Error: {(fc as {error:string}).error}</span>
                        ) : (
                          <>
                            <span className={`font-semibold ${(fc as {status:string}).status === 'completed' ? 'text-green-600' : (fc as {status:string}).status === 'scraping' ? 'text-blue-600' : 'text-gray-600'}`}>
                              {(fc as {status:string}).status}
                            </span>
                            <span className="text-gray-600">{(fc as {completed:number}).completed} / {(fc as {total:number}).total} scraped</span>
                            <span className="text-gray-400">{(fc as {credits_used:number}).credits_used} credits</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Batches
                {batches.length > 0 && (
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    — {doneBatches.length} done, {classifyingBatches.length} classifying, {scrapingBatches.length} scraping
                  </span>
                )}
              </CardTitle>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Auto-refreshing every 5s
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {!data || batches.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No batches submitted yet. Click "Start Batch" to begin.
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map(batch => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    onClassify={handleClassify}
                    isClassifyingThis={pollingJobId === batch.firecrawl_job_id}
                    liveClassifiedCount={batch.firecrawl_job_id ? (classifyProgressMap[batch.firecrawl_job_id] ?? null) : null}
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
