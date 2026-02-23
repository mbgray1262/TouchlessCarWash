'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Images, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_KEY = 'gallery_backfill_last_job';

type JobStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

interface StatusData {
  total_with_place_id: number;
  gallery_stats: {
    total_gallery_photos: number;
    listings_with_photos: number;
    avg_photos_per_listing: number;
  } | null;
  recent_job: {
    id: number;
    status: string;
    total: number;
    processed: number;
    succeeded: number;
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
}

interface TaskTrace {
  id: number;
  listing_id: string;
  listing_name: string;
  google_place_id: string;
  photos_before: number;
  task_status: string;
  place_photos_fetched: number;
  place_photos_screened: number;
  place_photos_approved: number;
  photos_after: number;
  fallback_reason: string | null;
  finished_at: string | null;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function TraceRow({ task }: { task: TaskTrace }) {
  const [open, setOpen] = useState(false);
  const gained = task.photos_after - task.photos_before;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#0F2744] truncate">{task.listing_name}</p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">Place ID: {task.google_place_id}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {gained > 0
            ? <Pill label={`+${gained} photos`} color="bg-teal-50 text-teal-700 border-teal-200" />
            : <Pill label="No new photos" color="bg-gray-100 text-gray-500 border-gray-200" />
          }
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-gray-100 pt-3 bg-gray-50/50">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Photos</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Pill label={`${task.photos_before} before`} color="bg-gray-100 text-gray-600 border-gray-200" />
                <Pill
                  label={`${task.photos_after} after`}
                  color={task.photos_after > task.photos_before ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-600 border-gray-200'}
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">API Results</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Pill label={`${task.place_photos_fetched} fetched`} color="bg-gray-100 text-gray-600 border-gray-200" />
                <Pill label={`${task.place_photos_screened} screened`} color="bg-gray-100 text-gray-600 border-gray-200" />
                <Pill
                  label={`${task.place_photos_approved} approved`}
                  color={task.place_photos_approved > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
                />
              </div>
            </div>
          </div>

          {task.fallback_reason && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-relaxed">
              {task.fallback_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function GalleryBackfillPage() {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [mode, setMode] = useState<'test' | 'full'>('test');
  const [testLimit, setTestLimit] = useState(10);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [traces, setTraces] = useState<TaskTrace[]>([]);
  const [showTraces, setShowTraces] = useState(false);
  const [loadingTraces, setLoadingTraces] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const callFn = useCallback(async (body: Record<string, unknown>) => {
    return fetch(`${SUPABASE_URL}/functions/v1/gallery-backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await callFn({ action: 'status' });
    if (res.ok) {
      const data = await res.json();
      setStatusData(data);
    }
  }, [callFn]);

  const loadTraces = useCallback(async (jobId: number) => {
    setLoadingTraces(true);
    try {
      const res = await callFn({ action: 'task_traces', job_id: jobId });
      if (res.ok) {
        const data = await res.json();
        setTraces(data.tasks ?? []);
        setShowTraces(true);
      }
    } finally {
      setLoadingTraces(false);
    }
  }, [callFn]);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const res = await callFn({ action: 'job_status', job_id: jobId });
    if (!res.ok) return;
    const data: JobProgress = await res.json();
    setJobProgress(data);
    if (data.status === 'done' || data.status === 'cancelled') {
      if (pollRef.current) clearInterval(pollRef.current);
      const finalStatus = data.status === 'done' ? 'done' : 'cancelled';
      setJobStatus(finalStatus);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, status: finalStatus })); } catch {}
      loadStatus();
      showToast('success', `Done! ${data.succeeded} of ${data.total} listings gained new photos.`);
      loadTraces(jobId);
    }
  }, [callFn, loadStatus, showToast, loadTraces]);

  useEffect(() => {
    loadStatus();

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { jobId, status } = JSON.parse(saved) as { jobId: number; status: string };
        if (jobId && (status === 'done' || status === 'cancelled' || status === 'running')) {
          jobIdRef.current = jobId;
          callFn({ action: 'job_status', job_id: jobId })
            .then(r => r.ok ? r.json() : null)
            .then((data: JobProgress | null) => {
              if (!data) return;
              setJobProgress(data);
              if (data.status === 'done' || data.status === 'cancelled') {
                setJobStatus(data.status === 'done' ? 'done' : 'cancelled');
                loadTraces(jobId);
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
    setTraces([]);
    setShowTraces(false);
    try {
      const limit = mode === 'test' ? testLimit : 0;
      const res = await callFn({ action: 'start', limit });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start');
      jobIdRef.current = data.job_id;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: data.job_id, status: 'running' })); } catch {}
      setJobProgress({ id: data.job_id, status: 'running', total: data.total, processed: 0, succeeded: 0 });
      showToast('info', `Started — processing ${data.total} listings one at a time.`);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(pollJob, 3000);
      pollJob();
    } catch (e) {
      showToast('error', (e as Error).message);
      setJobStatus('idle');
    }
  }, [mode, testLimit, callFn, showToast, pollJob]);

  const handleCancel = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    await callFn({ action: 'cancel', job_id: jobId });
    setJobStatus('cancelled');
    showToast('info', 'Job cancelled.');
    loadTraces(jobId);
  }, [callFn, showToast, loadTraces]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setJobStatus('idle');
    setJobProgress(null);
    setTraces([]);
    setShowTraces(false);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))
    : 0;

  const gainedCount = traces.filter(t => t.photos_after > t.photos_before).length;
  const noGainCount = traces.filter(t => t.task_status === 'done' && t.photos_after <= t.photos_before).length;
  const doneCount = traces.filter(t => t.task_status === 'done').length;

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
          <span className="text-sm font-medium text-[#0F2744]">Gallery Photo Backfill</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <Images className="w-6 h-6 text-teal-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Gallery Photo Backfill</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Finds touchless listings with a Google Place ID and fewer than {MIN_GALLERY_TARGET} gallery photos, then fetches up to {MAX_GALLERY_PHOTOS} additional photos from the Google Places API. Each photo is screened by Claude Haiku — only GOOD verdicts are saved.
        </p>

        {statusData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Eligible Listings</p>
              <p className="text-2xl font-bold text-[#0F2744]">{statusData.total_with_place_id.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">have a Place ID</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Gallery Photos</p>
              <p className="text-2xl font-bold text-teal-600">
                {statusData.gallery_stats ? statusData.gallery_stats.total_gallery_photos.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {statusData.gallery_stats ? `avg ${statusData.gallery_stats.avg_photos_per_listing}/listing` : ''}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">With Gallery Photos</p>
              <p className="text-2xl font-bold text-[#0F2744]">
                {statusData.gallery_stats ? statusData.gallery_stats.listings_with_photos.toLocaleString() : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Last Job</p>
              {statusData.recent_job ? (
                <>
                  <p className="text-2xl font-bold text-[#0F2744]">{statusData.recent_job.succeeded}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    of {statusData.recent_job.total} gained photos
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-1">No runs yet</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span><strong>Find eligible listings</strong> — touchless listings that have a <code className="text-xs bg-gray-100 px-1 rounded">google_place_id</code> but fewer than {MIN_GALLERY_TARGET} gallery photos.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span><strong>Fetch from Google Places API</strong> — calls the Place Details API to retrieve up to {MAX_GALLERY_PHOTOS + 5} photo references, resolves each to a full-size image URL.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span><strong>Claude Haiku screening</strong> — every photo is classified. Only GOOD verdicts (exterior car wash shots) are kept. BAD_CONTACT and BAD_OTHER are discarded. Retries on 529 overload errors.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span><strong>Save approved photos</strong> — rehosted to Supabase storage and appended to the listing's <code className="text-xs bg-gray-100 px-1 rounded">photos</code> array. Listings are processed one at a time to avoid rate limits.</span>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Gallery Photo Backfill</CardTitle>
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
                          ? 'bg-teal-50 border-teal-400 text-teal-800'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m === 'test' ? 'Test Mode' : 'Full Run'}
                      <span className="block text-xs font-normal mt-0.5 opacity-70">
                        {m === 'test'
                          ? 'Small batch to verify results'
                          : `All eligible listings with < ${MIN_GALLERY_TARGET} gallery photos`
                        }
                      </span>
                    </button>
                  ))}
                </div>

                {mode === 'test' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">Listings to process</label>
                    <div className="flex gap-2">
                      {[5, 10, 25, 50].map(n => (
                        <button
                          key={n}
                          onClick={() => setTestLimit(n)}
                          className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                            testLimit === n
                              ? 'bg-teal-600 border-teal-600 text-white'
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
                    <p className="text-xs text-amber-800 font-medium">Full run uses Google Places API + Anthropic credits</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Each photo requires a Claude Haiku API call. Processes listings one at a time. Run a test first.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleStart}
                >
                  <Images className="w-4 h-4 mr-2" />
                  {mode === 'test' ? `Run Test (${testLimit} listings)` : 'Start Gallery Photo Backfill'}
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Processing listings…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {jobProgress.processed} / {jobProgress.total} done &nbsp;·&nbsp; {jobProgress.succeeded} gained new photos
                    </p>
                  </div>
                  <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-teal-500 h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Processes one listing at a time — each photo is screened by Claude Haiku before saving.</span>
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
                      {jobStatus === 'done' ? 'Backfill complete' : 'Job cancelled'}
                    </p>
                    <p className={`text-xs mt-0.5 ${jobStatus === 'done' ? 'text-teal-600' : 'text-gray-400'}`}>
                      {jobProgress.succeeded} of {jobProgress.processed} listings gained new gallery photos.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Again
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(showTraces || loadingTraces) && (
          <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Per-Listing Results
                </CardTitle>
                {doneCount > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {gainedCount > 0 && (
                      <Pill label={`${gainedCount} gained photos`} color="bg-teal-50 text-teal-700 border-teal-200" />
                    )}
                    {noGainCount > 0 && (
                      <Pill label={`${noGainCount} no new photos`} color="bg-gray-100 text-gray-500 border-gray-200" />
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loadingTraces ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading results…
                </div>
              ) : (
                <div className="space-y-2">
                  {traces.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No results yet.</p>
                  ) : (
                    traces.map(task => <TraceRow key={task.id} task={task} />)
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

const MIN_GALLERY_TARGET = 3;
const MAX_GALLERY_PHOTOS = 5;
