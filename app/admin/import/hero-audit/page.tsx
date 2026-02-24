'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, ShieldCheck, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle, ImageIcon, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_KEY = 'hero_audit_last_job';
const PARALLEL_BATCH_SIZE = 3;

type JobStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

interface AuditStatus {
  trusted_tasks: number;
  listings_with_auditable_hero: number;
  unaudited_count: number;
  audited_count: number;
  recent_job: {
    id: number;
    status: string;
    total: number;
    processed: number;
    succeeded: number;
    cleared: number;
    started_at: string;
    finished_at: string | null;
  } | null;
}

interface JobProgress {
  id: number;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  cleared: number;
}

interface AuditTask {
  id: number;
  listing_id: string;
  listing_name: string;
  hero_image_url: string;
  task_status: string;
  verdict: string | null;
  reason: string | null;
  action_taken: string | null;
  finished_at: string | null;
}

const VERDICT_COLOR: Record<string, string> = {
  GOOD: 'bg-teal-50 text-teal-700 border-teal-200',
  BAD_CONTACT: 'bg-red-50 text-red-700 border-red-200',
  BAD_OTHER: 'bg-amber-50 text-amber-700 border-amber-200',
  fetch_failed: 'bg-gray-100 text-gray-500 border-gray-200',
};

const ACTION_COLOR: Record<string, string> = {
  kept: 'bg-teal-50 text-teal-700 border-teal-200',
  cleared: 'bg-red-50 text-red-600 border-red-200',
  skipped: 'bg-gray-100 text-gray-500 border-gray-200',
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function TaskRow({ task }: { task: AuditTask }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-gray-100 border border-gray-200">
          {task.hero_image_url ? (
            <img
              src={task.hero_image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-gray-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#0F2744] truncate">{task.listing_name}</p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{task.hero_image_url}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {task.verdict && (
            <Pill label={task.verdict} color={VERDICT_COLOR[task.verdict] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />
          )}
          {task.action_taken && (
            <Pill label={task.action_taken} color={ACTION_COLOR[task.action_taken] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-gray-100 bg-gray-50/50 space-y-3">
          <div className="flex gap-3">
            <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
              {task.hero_image_url ? (
                <img
                  src={task.hero_image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                      '<div class="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-300" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Verdict</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {task.verdict ? (
                    <Pill label={task.verdict} color={VERDICT_COLOR[task.verdict] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />
                  ) : (
                    <span className="text-[10px] text-gray-400">Pending…</span>
                  )}
                  {task.action_taken && (
                    <Pill
                      label={task.action_taken === 'cleared' ? 'Hero cleared' : 'Hero kept'}
                      color={ACTION_COLOR[task.action_taken] ?? 'bg-gray-100 text-gray-500 border-gray-200'}
                    />
                  )}
                </div>
              </div>
              {task.reason && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Reason</p>
                  <p className="text-[10px] text-gray-600 leading-relaxed">{task.reason}</p>
                </div>
              )}
            </div>
          </div>
          <a
            href={task.hero_image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-500 hover:underline truncate block"
          >
            {task.hero_image_url}
          </a>
        </div>
      )}
    </div>
  );
}

function callFn(body: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/functions/v1/hero-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
}

export default function HeroAuditPage() {
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null);
  const [mode, setMode] = useState<'test' | 'full'>('test');
  const [testLimit, setTestLimit] = useState(25);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [tasks, setTasks] = useState<AuditTask[]>([]);
  const [showTasks, setShowTasks] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<number>(-1);
  const stalledSinceRef = useRef<number | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 8000);
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await callFn({ action: 'status' });
    if (res.ok) {
      const data = await res.json();
      setAuditStatus(data);
    }
  }, []);

  const loadTaskTraces = useCallback(async (jobId: number) => {
    setLoadingTasks(true);
    try {
      const res = await callFn({ action: 'task_traces', job_id: jobId });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setShowTasks(true);
      }
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const res = await callFn({ action: 'job_status', job_id: jobId });
    if (!res.ok) return;
    const data: JobProgress = await res.json();
    setJobProgress(data);

    if (data.status === 'running') {
      if (data.processed === lastProcessedRef.current) {
        const now = Date.now();
        if (stalledSinceRef.current === null) {
          stalledSinceRef.current = now;
        } else if (now - stalledSinceRef.current > 20_000) {
          stalledSinceRef.current = now;
          callFn({ action: 'process_batch', job_id: jobId }).catch(() => {});
        }
      } else {
        lastProcessedRef.current = data.processed;
        stalledSinceRef.current = null;
      }
    }

    if (data.status === 'done' || data.status === 'cancelled') {
      if (pollRef.current) clearInterval(pollRef.current);
      const finalStatus = data.status === 'done' ? 'done' : 'cancelled';
      setJobStatus(finalStatus);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, status: finalStatus })); } catch {}
      loadStatus();
      showToast(
        'success',
        `Done! ${data.succeeded} heroes kept, ${data.cleared} cleared from ${data.processed} listings.`
      );
      loadTaskTraces(jobId);
    }
  }, [loadStatus, showToast, loadTaskTraces]);

  useEffect(() => {
    loadStatus();

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { jobId, status } = JSON.parse(saved) as { jobId: number; status: string };
        if (jobId) {
          jobIdRef.current = jobId;
          callFn({ action: 'job_status', job_id: jobId })
            .then(r => r.ok ? r.json() : null)
            .then((data: JobProgress | null) => {
              if (!data) return;
              setJobProgress(data);
              if (data.status === 'done' || data.status === 'cancelled') {
                setJobStatus(data.status === 'done' ? 'done' : 'cancelled');
                loadTaskTraces(jobId);
              } else if (data.status === 'running') {
                setJobStatus('running');
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = setInterval(pollJob, 3000);
              }
            })
            .catch(() => {});
        }
      }
    } catch {}

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = useCallback(async () => {
    setJobStatus('running');
    setJobProgress(null);
    setTasks([]);
    setShowTasks(false);
    lastProcessedRef.current = -1;
    stalledSinceRef.current = null;

    try {
      const limit = mode === 'test' ? testLimit : 0;
      const res = await callFn({ action: 'start', limit });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start');
      jobIdRef.current = data.job_id;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: data.job_id, status: 'running' })); } catch {}
      setJobProgress({ id: data.job_id, status: 'running', total: data.total, processed: 0, succeeded: 0, cleared: 0 });
      showToast('info', `Started — screening ${data.total} Google hero images.`);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(pollJob, 3000);
      pollJob();
    } catch (e) {
      showToast('error', (e as Error).message);
      setJobStatus('idle');
    }
  }, [mode, testLimit, showToast, pollJob]);

  const handleCancel = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    await callFn({ action: 'cancel', job_id: jobId });
    setJobStatus('cancelled');
    showToast('info', 'Job cancelled.');
    loadTaskTraces(jobId);
  }, [showToast, loadTaskTraces]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setJobStatus('idle');
    setJobProgress(null);
    setTasks([]);
    setShowTasks(false);
    loadStatus();
  }, [loadStatus]);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))
    : 0;

  const goodTasks = tasks.filter(t => t.verdict === 'GOOD');
  const badTasks = tasks.filter(t => t.verdict === 'BAD_CONTACT' || t.verdict === 'BAD_OTHER');
  const failedTasks = tasks.filter(t => t.verdict === 'fetch_failed');
  const doneTasks = tasks.filter(t => t.task_status === 'done');

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg text-sm font-medium animate-in slide-in-from-right-4 ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800'
          : toast.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800'
          : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="container mx-auto px-4 max-w-3xl py-10">

        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Admin</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/admin/import" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Import</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Hero Image Audit</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <ShieldCheck className="w-6 h-6 text-amber-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Hero Image Audit</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Re-screens all Google hero images that were previously marked "trusted" without going through Claude Haiku classification.
          Bad images (poor quality, wrong subject, contact wash) will have their hero cleared — the listing then falls back to street view
          or can be re-enriched.
        </p>

        {auditStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-amber-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Remaining to audit</p>
              <p className="text-2xl font-bold text-amber-600">{auditStatus.unaudited_count.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">of {auditStatus.listings_with_auditable_hero.toLocaleString()} total auditable heroes</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Already audited</p>
              <p className="text-2xl font-bold text-[#0F2744]">{auditStatus.audited_count.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">across all past runs</p>
            </div>
            {auditStatus.recent_job && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">Last Audit Run</p>
                <p className="text-2xl font-bold text-[#0F2744]">{auditStatus.recent_job.cleared}</p>
                <p className="text-xs text-gray-400 mt-0.5">heroes cleared of {auditStatus.recent_job.total}</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Root Cause</p>
          <p className="text-sm text-amber-800 leading-relaxed">
            During initial photo enrichment, Google photos were marked <code className="bg-amber-100 px-1 rounded text-xs">"trusted"</code> and
            used as hero images without any Claude Haiku screening. This allowed low-quality images — car interiors, wrong businesses,
            blurry shots — to appear as hero images on listing pages.
          </p>
          <p className="text-sm text-amber-700 mt-2 leading-relaxed">
            This tool classifies each of those images now. <strong>BAD verdicts clear the hero</strong>, leaving the listing
            with no hero (which triggers re-enrichment or falls back to street view). GOOD verdicts leave the hero unchanged.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span><strong>Find all Google hero images</strong> — selects every touchless listing where <code className="text-xs bg-gray-100 px-1 rounded">hero_image_source = 'google'</code> and a hero image exists.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span><strong>Classify with Claude Haiku</strong> — each image is sent to Claude for classification: GOOD (exterior car wash shot), BAD_CONTACT (brushes/cloth), or BAD_OTHER (wrong subject, low quality, etc.).</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span><strong>Act on the verdict</strong> — GOOD images are left untouched. BAD images have <code className="text-xs bg-gray-100 px-1 rounded">hero_image</code> and <code className="text-xs bg-gray-100 px-1 rounded">hero_image_source</code> cleared from the listing.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span><strong>After the audit</strong> — run Photo Enrichment on listings with no hero to fill them with properly screened images or fall back to street view.</span>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Hero Audit</CardTitle>
          </CardHeader>
          <CardContent className="p-5">

            {jobStatus === 'idle' && (
              <div className="space-y-5">
                <div className="flex gap-3">
                  {(['test', 'full'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all text-left ${
                        mode === m
                          ? 'bg-amber-50 border-amber-400 text-amber-800'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m === 'test' ? 'Test Mode' : 'Full Audit'}
                      <span className="block text-xs font-normal mt-0.5 opacity-70">
                        {m === 'test'
                          ? 'Small sample to preview results'
                          : `Screen ${auditStatus?.unaudited_count.toLocaleString() ?? '…'} remaining unaudited images`}
                      </span>
                    </button>
                  ))}
                </div>

                {mode === 'test' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">Listings to screen</label>
                    <div className="flex gap-2">
                      {[10, 25, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setTestLimit(n)}
                          className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                            testLimit === n
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mode === 'full' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-800 font-medium">Full audit uses Anthropic credits (~1 Haiku call per listing)</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Will screen {auditStatus?.unaudited_count.toLocaleString() ?? '…'} remaining unaudited Google hero images and clear any that fail.
                      Run a test first to calibrate expectations.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleStart}
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {mode === 'test' ? `Run Test (${testLimit} images)` : 'Start Full Hero Audit'}
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Screening hero images…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {jobProgress.processed} / {jobProgress.total} screened
                      &nbsp;·&nbsp; {jobProgress.succeeded} kept
                      &nbsp;·&nbsp; <span className="text-red-500 font-medium">{jobProgress.cleared} cleared</span>
                    </p>
                  </div>
                  <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {jobProgress.cleared > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{jobProgress.cleared} bad heroes cleared so far — those listings now have no hero image.</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Processing {PARALLEL_BATCH_SIZE} images at a time on the server.</span>
                </div>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancel}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
                </Button>
              </div>
            )}

            {(jobStatus === 'done' || jobStatus === 'cancelled') && jobProgress && (
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                  jobStatus === 'done' ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  {jobStatus === 'done'
                    ? <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                    : <XCircle className="w-5 h-5 text-gray-400 shrink-0" />
                  }
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${jobStatus === 'done' ? 'text-teal-800' : 'text-gray-600'}`}>
                      {jobStatus === 'done' ? 'Audit complete' : 'Audit cancelled'}
                    </p>
                    <p className={`text-xs mt-0.5 ${jobStatus === 'done' ? 'text-teal-600' : 'text-gray-400'}`}>
                      {jobProgress.succeeded} heroes kept &nbsp;·&nbsp; {jobProgress.cleared} heroes cleared
                      {' '}of {jobProgress.processed} screened
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Again
                  </Button>
                </div>

                {jobProgress.cleared > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800 font-medium">Next step: re-enrich cleared listings</p>
                    <p className="text-xs text-blue-700 mt-1">
                      {jobProgress.cleared} listings now have no hero image. Run{' '}
                      <Link href="/admin/import/enrich-photos" className="underline font-semibold">Photo Enrichment</Link>
                      {' '}to give them properly screened heroes (website photos, Google Place photos, or street view fallback).
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {(showTasks || loadingTasks) && (
          <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Screening Results
                </CardTitle>
                {doneTasks.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {goodTasks.length > 0 && <Pill label={`${goodTasks.length} GOOD`} color="bg-teal-50 text-teal-700 border-teal-200" />}
                    {badTasks.length > 0 && <Pill label={`${badTasks.length} BAD`} color="bg-red-50 text-red-600 border-red-200" />}
                    {failedTasks.length > 0 && <Pill label={`${failedTasks.length} failed`} color="bg-gray-100 text-gray-500 border-gray-200" />}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loadingTasks ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading results…
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No results yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {badTasks.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2 px-1">
                        Cleared ({badTasks.length})
                      </p>
                      <div className="space-y-1.5">
                        {badTasks.map(t => <TaskRow key={t.id} task={t} />)}
                      </div>
                    </div>
                  )}
                  {goodTasks.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-2 px-1">
                        Kept ({goodTasks.length})
                      </p>
                      <div className="space-y-1.5">
                        {goodTasks.map(t => <TaskRow key={t.id} task={t} />)}
                      </div>
                    </div>
                  )}
                  {failedTasks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                        Fetch Failed ({failedTasks.length})
                      </p>
                      <div className="space-y-1.5">
                        {failedTasks.map(t => <TaskRow key={t.id} task={t} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
