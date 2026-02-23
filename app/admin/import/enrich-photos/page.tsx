'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { slugify } from '@/lib/constants';
import {
  ChevronRight, Camera, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle, ImageIcon, Globe, MapPin, Bug, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type JobStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

interface PipelineStats {
  total: number;
  with_hero: number;
  by_source: { google: number; website: number; street_view: number };
}

interface JobProgress {
  id: number;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
}

interface RecentListing {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string | null;
  hero_image: string | null;
  hero_image_source: string | null;
  logo_photo: string | null;
}

interface TaskTrace {
  id: number;
  listing_id: string;
  listing_name: string;
  website: string | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  task_status: string;
  hero_source: string | null;
  hero_image_found: boolean;
  gallery_count: number;
  google_photo_exists: boolean | null;
  google_verdict: string | null;
  google_reason: string | null;
  website_photos_db_count: number;
  website_photos_screened: number;
  website_photos_approved: number;
  firecrawl_triggered: boolean;
  firecrawl_images_found: number;
  firecrawl_candidates: number;
  firecrawl_approved: number;
  total_approved: number;
  fallback_reason: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  google: 'Google Photo',
  website: 'Website',
  street_view: 'Street View',
  manual: 'Manual',
};

const SOURCE_COLOR: Record<string, string> = {
  google: 'bg-blue-100 text-blue-700 border-blue-200',
  website: 'bg-teal-100 text-teal-700 border-teal-200',
  street_view: 'bg-amber-100 text-amber-700 border-amber-200',
  manual: 'bg-gray-100 text-gray-600 border-gray-200',
};

const VERDICT_COLOR: Record<string, string> = {
  GOOD: 'text-teal-700 bg-teal-50 border-teal-200',
  BAD_CONTACT: 'text-red-700 bg-red-50 border-red-200',
  BAD_OTHER: 'text-amber-700 bg-amber-50 border-amber-200',
  fetch_failed: 'text-red-600 bg-red-50 border-red-200',
  previously_blocked: 'text-gray-500 bg-gray-50 border-gray-200',
  skipped: 'text-gray-400 bg-gray-50 border-gray-200',
};

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function TraceRow({ task }: { task: TaskTrace }) {
  const [open, setOpen] = useState(false);
  const finalSource = task.hero_source ?? (task.hero_image_found ? 'unknown' : 'none');

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#0F2744] truncate">{task.listing_name}</p>
          {task.website && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{task.website}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {finalSource && finalSource !== 'none'
            ? <Pill label={SOURCE_LABEL[finalSource] ?? finalSource} color={SOURCE_COLOR[finalSource] ?? 'bg-gray-100 text-gray-600 border-gray-200'} />
            : <Pill label="No hero" color="bg-red-50 text-red-600 border-red-200" />
          }
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-gray-100 pt-3 bg-gray-50/50">

          {/* Step 1: Google Photo */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Step 1 — Google Photo</p>
            <div className="flex items-start gap-2 flex-wrap">
              <Pill
                label={task.google_photo_exists ? 'URL present' : 'No google_photo_url'}
                color={task.google_photo_exists ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
              />
              {task.google_photo_exists && (
                <Pill
                  label={task.google_verdict ?? 'not run'}
                  color={VERDICT_COLOR[task.google_verdict ?? ''] ?? 'bg-gray-100 text-gray-500 border-gray-200'}
                />
              )}
            </div>
            {task.google_reason && (
              <p className="text-[10px] text-gray-500 italic leading-relaxed">{task.google_reason}</p>
            )}
            {task.google_photo_url && (
              <a href={task.google_photo_url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-blue-500 hover:underline truncate block max-w-full">
                {task.google_photo_url}
              </a>
            )}
          </div>

          {/* Step 2: DB Website Photos */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Step 2 — DB Website Photos</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill
                label={`${task.website_photos_db_count} in DB`}
                color={task.website_photos_db_count > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
              />
              {task.website_photos_db_count > 0 && (
                <>
                  <Pill label={`${task.website_photos_screened} screened`} color="bg-gray-100 text-gray-600 border-gray-200" />
                  <Pill
                    label={`${task.website_photos_approved} approved`}
                    color={task.website_photos_approved > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
                  />
                </>
              )}
            </div>
          </div>

          {/* Step 3: Firecrawl */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Step 3 — Firecrawl Scrape</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill
                label={task.firecrawl_triggered ? 'Triggered' : 'Skipped'}
                color={task.firecrawl_triggered ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
              />
              {task.firecrawl_triggered && (
                <>
                  <Pill label={`${task.firecrawl_images_found} raw imgs`} color="bg-gray-100 text-gray-600 border-gray-200" />
                  <Pill label={`${task.firecrawl_candidates} candidates`} color="bg-gray-100 text-gray-600 border-gray-200" />
                  <Pill
                    label={`${task.firecrawl_approved} approved`}
                    color={task.firecrawl_approved > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}
                  />
                </>
              )}
            </div>
          </div>

          {/* Result */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Result</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill
                label={`${task.total_approved} total approved`}
                color={task.total_approved > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-red-50 text-red-600 border-red-200'}
              />
              {finalSource && finalSource !== 'none'
                ? <Pill label={`Hero: ${SOURCE_LABEL[finalSource] ?? finalSource}`} color={SOURCE_COLOR[finalSource] ?? 'bg-gray-100 text-gray-600 border-gray-200'} />
                : <Pill label="No hero image" color="bg-red-50 text-red-600 border-red-200" />
              }
              {task.gallery_count > 0 && (
                <Pill label={`+${task.gallery_count} gallery`} color="bg-gray-100 text-gray-600 border-gray-200" />
              )}
            </div>
            {task.fallback_reason && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-relaxed">
                {task.fallback_reason}
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default function EnrichPhotosPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [mode, setMode] = useState<'test' | 'full'>('test');
  const [testLimit, setTestLimit] = useState(10);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [recentListings, setRecentListings] = useState<RecentListing[]>([]);
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

  const loadStats = useCallback(async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/photo-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'status' }),
    });
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    }
  }, []);

  const loadRecentListings = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, city, state, slug, hero_image, hero_image_source, logo_photo')
      .eq('is_touchless', true)
      .not('hero_image', 'is', null)
      .order('last_crawled_at', { ascending: false })
      .limit(12);
    if (data) setRecentListings(data);
  }, []);

  const loadTraces = useCallback(async (jobId: number) => {
    setLoadingTraces(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/photo-enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'task_traces', job_id: jobId }),
      });
      if (res.ok) {
        const data = await res.json();
        setTraces(data.tasks ?? []);
        setShowTraces(true);
      }
    } finally {
      setLoadingTraces(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadRecentListings();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadStats, loadRecentListings]);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/photo-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'job_status', job_id: jobId }),
    });
    if (!res.ok) return;
    const data: JobProgress = await res.json();
    setJobProgress(data);
    if (data.status === 'done' || data.status === 'cancelled') {
      if (pollRef.current) clearInterval(pollRef.current);
      setJobStatus(data.status === 'done' ? 'done' : 'cancelled');
      loadStats();
      loadRecentListings();
      showToast('success', `Done! ${data.succeeded} of ${data.total} listings got a hero image.`);
      loadTraces(jobId);
    }
  }, [loadStats, loadRecentListings, showToast, loadTraces]);

  const handleStart = useCallback(async () => {
    setJobStatus('running');
    setJobProgress(null);
    setTraces([]);
    setShowTraces(false);
    try {
      const limit = mode === 'test' ? testLimit : 0;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/photo-enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'start', limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start');
      jobIdRef.current = data.job_id;
      setJobProgress({ id: data.job_id, status: 'running', total: data.total, processed: 0, succeeded: 0 });
      showToast('info', `Started — processing ${data.total} listings one by one.`);
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
    await fetch(`${SUPABASE_URL}/functions/v1/photo-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'cancel', job_id: jobId }),
    });
    setJobStatus('cancelled');
    showToast('info', 'Job cancelled.');
    loadTraces(jobId);
  }, [showToast, loadTraces]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    setJobStatus('idle');
    setJobProgress(null);
    setTraces([]);
    setShowTraces(false);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))
    : 0;

  const coveragePct = stats && stats.total > 0
    ? Math.round((stats.with_hero / stats.total) * 100)
    : 0;

  const streetViewCount = traces.filter(t => t.hero_source === 'street_view' || (!t.hero_image_found && t.task_status === 'done')).length;
  const googleCount = traces.filter(t => t.hero_source === 'google').length;
  const websiteCount = traces.filter(t => t.hero_source === 'website').length;
  const noHeroCount = traces.filter(t => !t.hero_image_found && t.task_status === 'done').length;
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
          <span className="text-sm font-medium text-[#0F2744]">Photo Enrichment</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <Camera className="w-6 h-6 text-teal-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Photo Enrichment</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Collects 3–5 approved photos per listing. Google photos and existing website photos are AI-screened first — Firecrawl scraping only runs as a fallback when fewer than 3 photos are found.
        </p>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Touchless</p>
              <p className="text-2xl font-bold text-[#0F2744]">{stats.total.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Have Hero Image</p>
              <p className="text-2xl font-bold text-teal-600">{stats.with_hero.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{coveragePct}% coverage</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">From Google</p>
              <p className="text-2xl font-bold text-blue-600">{stats.by_source.google.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">From Website</p>
              <p className="text-2xl font-bold text-teal-600">{stats.by_source.website.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.by_source.street_view} street view</p>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span><strong>Google photo</strong> — AI-screened with Claude Haiku. GOOD = added to approved list. BAD_CONTACT = noted in crawl log. BAD_OTHER = silently rejected.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span><strong>Existing website photos</strong> — If the DB already has <code className="text-xs bg-gray-100 px-1 rounded">website_photos</code>, each is screened. Logos, icons, brand graphics, and social images are strictly rejected.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span><strong>Firecrawl scrape</strong> — Only runs if fewer than 3 approved photos after steps 1–2 AND no <code className="text-xs bg-gray-100 px-1 rounded">website_photos</code> in DB. Same strict screening applied.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span><strong>Street view fallback</strong> — Used as hero only if zero approved photos found in steps 1–3.</span>
            </div>
          </div>
        </div>

        {/* Run panel */}
        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Photo Enrichment</CardTitle>
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
                        {m === 'test' ? 'Small batch to verify results' : `All ${stats?.total.toLocaleString() ?? '…'} touchless listings`}
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
                    <p className="text-xs text-amber-800 font-medium">Full run uses Firecrawl + Anthropic credits</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Processes all {stats?.total.toLocaleString() ?? '…'} listings sequentially. Run a test first.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleStart}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {mode === 'test' ? `Run Test (${testLimit} listings)` : 'Start Full Photo Enrichment'}
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Processing listings…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {jobProgress.processed} / {jobProgress.total} done &nbsp;·&nbsp; {jobProgress.succeeded} got hero images
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
                  <span>Running on server — processes one listing at a time to stay within compute limits.</span>
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
                      {jobStatus === 'done' ? 'Enrichment complete' : 'Job cancelled'}
                    </p>
                    <p className={`text-xs mt-0.5 ${jobStatus === 'done' ? 'text-teal-600' : 'text-gray-400'}`}>
                      {jobProgress.succeeded} of {jobProgress.processed} listings got a hero image.
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

        {/* Debug Traces Panel */}
        {(showTraces || loadingTraces) && (
          <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-gray-500" />
                  <CardTitle className="text-sm font-semibold text-[#0F2744]">
                    Per-Listing Debug Trace
                  </CardTitle>
                </div>
                {doneCount > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {googleCount > 0 && <Pill label={`${googleCount} Google`} color={SOURCE_COLOR.google} />}
                    {websiteCount > 0 && <Pill label={`${websiteCount} Website`} color={SOURCE_COLOR.website} />}
                    {streetViewCount > 0 && <Pill label={`${streetViewCount} Street View`} color={SOURCE_COLOR.street_view} />}
                    {noHeroCount > 0 && <Pill label={`${noHeroCount} No Hero`} color="bg-red-50 text-red-600 border-red-200" />}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loadingTraces ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading trace data…
                </div>
              ) : (
                <div className="space-y-2">
                  {traces.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No trace data available yet.</p>
                  ) : (
                    traces.map(task => <TraceRow key={task.id} task={task} />)
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent results */}
        {recentListings.length > 0 && (
          <Card>
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Recently Enriched
                  <span className="ml-2 text-xs font-normal text-gray-400">— touchless listings with hero images</span>
                </CardTitle>
                <button onClick={loadRecentListings} className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
                {recentListings.map(listing => {
                  const href = listing.slug
                    ? `/car-washes/${slugify(listing.state)}/${slugify(listing.city)}/${listing.slug}`
                    : null;
                  const inner = (
                    <>
                      <div className="relative">
                        {listing.hero_image ? (
                          <img
                            src={listing.hero_image}
                            alt={listing.name}
                            className="w-full h-28 object-cover rounded-lg border border-gray-100"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-28 bg-gray-100 rounded-lg border border-gray-100 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-300" />
                          </div>
                        )}
                        {listing.hero_image_source && (
                          <span className={`absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${SOURCE_COLOR[listing.hero_image_source] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                            {SOURCE_LABEL[listing.hero_image_source] ?? listing.hero_image_source}
                          </span>
                        )}
                        {listing.logo_photo && (
                          <img
                            src={listing.logo_photo}
                            alt=""
                            className="absolute bottom-1.5 right-1.5 w-8 h-8 object-contain rounded bg-white/90 border border-gray-200 p-0.5"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#0F2744] truncate group-hover:underline">{listing.name}</p>
                        <p className="text-xs text-gray-400">{listing.city}, {listing.state}</p>
                      </div>
                    </>
                  );
                  return href ? (
                    <a key={listing.id} href={href} target="_blank" rel="noopener noreferrer"
                      className="bg-white p-3 space-y-2 group cursor-pointer hover:bg-gray-50 transition-colors">
                      {inner}
                    </a>
                  ) : (
                    <div key={listing.id} className="bg-white p-3 space-y-2">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source legend */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Photo source:</span>
          {Object.entries(SOURCE_LABEL).map(([key, label]) => (
            <span key={key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${SOURCE_COLOR[key]}`}>
              {label}
            </span>
          ))}
          <Globe className="w-3.5 h-3.5 text-gray-300 ml-1" />
          <MapPin className="w-3.5 h-3.5 text-gray-300" />
        </div>
      </div>
    </div>
  );
}
