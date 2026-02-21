'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RefreshCw, SkipForward, Loader2, Zap, AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { StatsGrid } from './StatsGrid';
import { BatchesTable } from './BatchesTable';
import { RecentRunsTable } from './RecentRunsTable';
import type { PipelineStatusResponse } from './types';

type UIState = 'idle' | 'submitting' | 'polling' | 'refreshing';

export default function PipelinePage() {
  const [data, setData] = useState<PipelineStatusResponse | null>(null);
  const [uiState, setUiState] = useState<UIState>('idle');
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const loadStatus = useCallback(async (silent = false) => {
    if (!silent) setUiState('refreshing');
    try {
      const res = await fetch('/api/pipeline/status');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json: PipelineStatusResponse = await res.json();
      setData(json);
    } catch (err) {
      if (!silent) showToast('error', (err as Error).message);
    } finally {
      if (!silent) setUiState('idle');
    }
  }, [showToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => loadStatus(true), 30_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [loadStatus]);

  const handleSubmitBatch = useCallback(async (retryFailed = false) => {
    setUiState('submitting');
    try {
      const res = await fetch('/api/pipeline/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_index: chunkIndex, retry_failed: retryFailed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      if (json.done) {
        showToast('success', 'No more listings to process — queue is empty.');
      } else {
        showToast('success', `Batch submitted: ${json.urls_submitted?.toLocaleString()} URLs (Job: ${json.job_id})`);
        setChunkIndex(i => i + 1);
      }
      await loadStatus();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setUiState('idle');
    }
  }, [chunkIndex, loadStatus, showToast]);

  const handlePollBatch = useCallback(async (jobId: string) => {
    setPollingJobId(jobId);
    setUiState('polling');
    try {
      const res = await fetch('/api/pipeline/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      showToast('success', `Polled: ${json.processed?.toLocaleString() ?? 0} results processed (${json.credits_used?.toLocaleString() ?? 0} credits used)`);
      await loadStatus();
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setPollingJobId(null);
      setUiState('idle');
    }
  }, [loadStatus, showToast]);

  const isRunning = uiState !== 'idle';
  const runningBatches = data?.batches.filter(b => b.status === 'running') ?? [];

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadStatus()}
            disabled={isRunning}
            className="shrink-0"
          >
            {uiState === 'refreshing'
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Refreshing</>
              : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh</>
            }
          </Button>
        </div>

        {runningBatches.length > 0 && (
          <Card className="border-blue-200 bg-blue-50 mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <div className="text-sm text-blue-800">
                <span className="font-semibold">{runningBatches.length} batch{runningBatches.length > 1 ? 'es' : ''} running.</span>{' '}
                If you configured a webhook, results will arrive automatically. Otherwise, use the "Poll Results" button on each batch below.
              </div>
            </CardContent>
          </Card>
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
                    Submits up to 2,000 unclassified listings per batch (chunk #{chunkIndex + 1}).
                  </p>
                  <Button
                    className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
                    onClick={() => handleSubmitBatch(false)}
                    disabled={isRunning}
                  >
                    {uiState === 'submitting'
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                      : <><Play className="w-4 h-4 mr-2" /> Start Batch #{chunkIndex + 1}</>
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

                {chunkIndex > 0 && (
                  <button
                    onClick={() => setChunkIndex(0)}
                    className="text-xs text-gray-400 hover:text-gray-600 w-full text-center transition-colors"
                  >
                    Reset to chunk #1
                  </button>
                )}
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
            <CardTitle className="text-base font-semibold text-[#0F2744]">Batches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <BatchesTable
              batches={data?.batches ?? []}
              onPoll={handlePollBatch}
              polling={pollingJobId}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-base font-semibold text-[#0F2744]">Recent Classifications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RecentRunsTable runs={data?.recent_runs ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
