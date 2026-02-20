'use client';

import { useState, useEffect, useRef } from 'react';
import { Wand2, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const POLL_INTERVAL = 2500;

interface Job {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  changed: number;
  current_batch: number;
  total_batches: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface Props {
  onComplete: () => void;
}

function eta(job: Job): string {
  if (!job.started_at || job.processed === 0) return '';
  const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
  const rate = job.processed / elapsed;
  const remaining = (job.total - job.processed) / rate;
  if (remaining < 60) return `~${Math.round(remaining)}s left`;
  return `~${Math.round(remaining / 60)}m left`;
}

export function CleanVendorNamesButton({ onComplete }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function pollJob(jobId: string) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/clean-vendor-names?job_id=${jobId}`,
        { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
      );
      if (!res.ok) return;
      const data: Job = await res.json();
      setJob(data);
      if (data.status === 'done') {
        stopPolling();
        onComplete();
      } else if (data.status === 'failed') {
        stopPolling();
        setError(data.error ?? 'Job failed');
      }
    } catch {
      // keep polling
    }
  }

  async function start() {
    setStarting(true);
    setError(null);
    setJob(null);
    stopPolling();

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/clean-vendor-names`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      const jobId: string = data.job_id;
      pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL);
      await pollJob(jobId);
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setStarting(false);
    }
  }

  const isActive = starting || (job && (job.status === 'pending' || job.status === 'running'));
  const isDone = job?.status === 'done';
  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Clean Up Vendor Names</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Uses Claude to infer the correct brand name from domain and listing names. Runs as a background job — you can navigate away and come back.
            </p>
          </div>
          <button
            onClick={start}
            disabled={!!isActive}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-[#0F2744] text-white text-sm font-medium rounded-lg hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
          >
            {isActive ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Running...</>
            ) : isDone ? (
              <><RefreshCw className="w-4 h-4" />Run Again</>
            ) : (
              <><Wand2 className="w-4 h-4" />Clean Up Names</>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <p className="text-xs text-gray-400">
          Example: <span className="font-mono text-gray-500">find.shell.com</span> → <span className="font-mono text-gray-500">Shell</span>
          &nbsp;·&nbsp;
          <span className="font-mono text-gray-500">chevronwithtechron.com</span> → <span className="font-mono text-gray-500">Chevron</span>
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {job && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {job.status === 'pending' && 'Starting up...'}
                {job.status === 'running' && `Batch ${job.current_batch} of ${job.total_batches}`}
                {job.status === 'done' && 'Complete'}
                {job.status === 'failed' && 'Failed'}
              </span>
              <span className="text-gray-500 tabular-nums text-xs">
                {job.processed.toLocaleString()} / {job.total.toLocaleString()} vendors
                {job.status === 'running' && job.processed > 0 && (
                  <span className="ml-2 text-gray-400">{eta(job)}</span>
                )}
              </span>
            </div>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isDone ? 'bg-emerald-500' : job.status === 'failed' ? 'bg-red-400' : 'bg-[#0F2744]'
                }`}
                style={{ width: `${isDone ? 100 : pct}%` }}
              />
            </div>

            <div className="flex items-center gap-4 text-sm">
              {isDone ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">{job.changed.toLocaleString()} vendors renamed</span>
                  <span className="text-emerald-500 text-xs">out of {job.total.toLocaleString()}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-500 text-xs">
                  <span className="tabular-nums font-medium text-gray-700">{pct}%</span>
                  <span className="text-emerald-600 font-medium tabular-nums">{job.changed.toLocaleString()} renamed so far</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
