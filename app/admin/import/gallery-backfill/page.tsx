'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { slugify } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import {
  ChevronRight, Images, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle, ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_KEY = 'gallery_backfill_last_job';
const MIN_GALLERY_TARGET = 3;
const MAX_GALLERY_PHOTOS = 5;

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

interface ListingDetail {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string | null;
  photos: string[] | null;
  hero_image: string | null;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function ResultCard({ trace, listing }: { trace: TaskTrace; listing: ListingDetail | null }) {
  const gained = trace.photos_after - trace.photos_before;
  const photos = listing?.photos ?? [];
  const href = listing?.slug && listing?.city && listing?.state
    ? `/car-washes/${slugify(listing.state)}/${slugify(listing.city)}/${listing.slug}`
    : null;

  const inner = (
    <>
      <div className="relative aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
        {photos.length > 0 ? (
          <div className={`grid h-full ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-2'} gap-px`}>
            {photos.slice(0, Math.min(photos.length, 4)).map((url, i) => (
              <div
                key={i}
                className={`relative overflow-hidden bg-gray-100 ${photos.length === 3 && i === 0 ? 'row-span-2' : ''}`}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-300" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          {gained > 0 ? (
            <Pill label={`+${gained} new`} color="bg-teal-600 text-white border-teal-600" />
          ) : (
            <Pill label="No new" color="bg-gray-800/70 text-gray-100 border-transparent" />
          )}
        </div>
        {photos.length > 0 && (
          <div className="absolute bottom-1.5 right-1.5">
            <Pill label={`${photos.length} total`} color="bg-black/60 text-white border-transparent" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-[#0F2744] truncate group-hover:underline">{trace.listing_name}</p>
        {listing && (
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{listing.city}, {listing.state}</p>
        )}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          <Pill label={`${trace.place_photos_fetched} fetched`} color="bg-gray-100 text-gray-500 border-gray-200" />
          <Pill label={`${trace.place_photos_approved} approved`} color={trace.place_photos_approved > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-500 border-gray-200'} />
        </div>
        {trace.fallback_reason && (
          <p className="text-[10px] text-amber-700 mt-1.5 leading-snug truncate" title={trace.fallback_reason}>
            {trace.fallback_reason}
          </p>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-teal-300 hover:shadow-sm transition-all block"
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {inner}
    </div>
  );
}

export default function GalleryBackfillPage() {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [mode, setMode] = useState<'test' | 'today' | 'full'>('test');
  const [testLimit, setTestLimit] = useState(10);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [traces, setTraces] = useState<TaskTrace[]>([]);
  const [listingDetails, setListingDetails] = useState<Record<string, ListingDetail>>({});
  const [showResults, setShowResults] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedRef = useRef<number>(-1);
  const stalledSinceRef = useRef<number | null>(null);

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

  const loadResults = useCallback(async (jobId: number) => {
    setLoadingResults(true);
    try {
      const res = await callFn({ action: 'task_traces', job_id: jobId });
      if (!res.ok) return;
      const data = await res.json();
      const taskList: TaskTrace[] = data.tasks ?? [];
      setTraces(taskList);
      setShowResults(true);

      if (taskList.length > 0) {
        const ids = taskList.map(t => t.listing_id);
        const CHUNK = 200;
        const allListings: ListingDetail[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { data: listings } = await supabase
            .from('listings')
            .select('id, name, city, state, slug, photos, hero_image')
            .in('id', chunk)
            .limit(CHUNK);
          if (listings) allListings.push(...(listings as ListingDetail[]));
        }
        const map: Record<string, ListingDetail> = {};
        for (const l of allListings) map[l.id] = l;
        setListingDetails(map);
      }
    } finally {
      setLoadingResults(false);
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
      lastProcessedRef.current = -1;
      stalledSinceRef.current = null;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId, status: finalStatus })); } catch {}
      loadStatus();
      showToast('success', `Done! ${data.succeeded} of ${data.total} listings gained new photos.`);
      loadResults(jobId);
    } else if (data.status === 'running') {
      if (data.processed === lastProcessedRef.current) {
        const now = Date.now();
        if (stalledSinceRef.current === null) {
          stalledSinceRef.current = now;
        } else if (now - stalledSinceRef.current > 15_000) {
          stalledSinceRef.current = now;
          callFn({ action: 'process_batch', job_id: jobId }).catch(() => {});
        }
      } else {
        lastProcessedRef.current = data.processed;
        stalledSinceRef.current = null;
      }
    }
  }, [callFn, loadStatus, showToast, loadResults]);

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
                loadResults(jobId);
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
    setListingDetails({});
    setShowResults(false);
    lastProcessedRef.current = -1;
    stalledSinceRef.current = null;
    try {
      const limit = mode === 'test' ? testLimit : 0;
      const since = mode === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        : null;
      const res = await callFn({ action: 'start', limit, ...(since ? { since } : {}) });
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
    loadResults(jobId);
  }, [callFn, showToast, loadResults]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setJobStatus('idle');
    setJobProgress(null);
    setTraces([]);
    setListingDetails({});
    setShowResults(false);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))
    : 0;

  const gainedCount = traces.filter(t => t.photos_after > t.photos_before).length;
  const noGainCount = traces.filter(t => t.task_status === 'done' && t.photos_after <= t.photos_before).length;

  const gainedTraces = traces.filter(t => t.photos_after > t.photos_before);
  const noGainTraces = traces.filter(t => t.task_status === 'done' && t.photos_after <= t.photos_before);

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

      <div className="container mx-auto px-4 max-w-4xl py-10">
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
                  {([
                    { key: 'test', label: 'Test Mode', desc: 'Small batch to verify results' },
                    { key: 'today', label: "Today's Run", desc: 'Listings processed today that need more photos' },
                    { key: 'full', label: 'Full Run', desc: `All eligible listings with < ${MIN_GALLERY_TARGET} gallery photos` },
                  ] as const).map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => setMode(key)}
                      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all text-left ${
                        mode === key
                          ? 'bg-teal-50 border-teal-400 text-teal-800'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {label}
                      <span className="block text-xs font-normal mt-0.5 opacity-70">{desc}</span>
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

                {mode === 'today' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-800 font-medium">Scoped to listings where photo enrichment ran today</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Only listings with a <code className="bg-blue-100 px-1 rounded">photo_enrichment_attempted_at</code> timestamp from today that still have fewer than {MIN_GALLERY_TARGET} gallery photos will be included.
                    </p>
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
                  {mode === 'test'
                    ? `Run Test (${testLimit} listings)`
                    : mode === 'today'
                    ? "Start Today's Run"
                    : 'Start Gallery Photo Backfill'
                  }
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

        {(showResults || loadingResults) && (
          <>
            {loadingResults ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading results…
              </div>
            ) : (
              <>
                {gainedTraces.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-[#0F2744]">
                          Gained New Photos
                          <span className="ml-2 text-xs font-normal text-gray-400">— click to open listing</span>
                        </CardTitle>
                        <Pill label={`${gainedCount} listings`} color="bg-teal-50 text-teal-700 border-teal-200" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {gainedTraces.map(task => (
                          <ResultCard
                            key={task.id}
                            trace={task}
                            listing={listingDetails[task.listing_id] ?? null}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {noGainTraces.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-[#0F2744]">No New Photos</CardTitle>
                        <Pill label={`${noGainCount} listings`} color="bg-gray-100 text-gray-500 border-gray-200" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {noGainTraces.map(task => (
                          <ResultCard
                            key={task.id}
                            trace={task}
                            listing={listingDetails[task.listing_id] ?? null}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
