'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Tag, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type JobStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

interface PipelineStats {
  eligible: number;
  already_have_amenities: number;
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
  amenities: string[] | null;
}

export default function AmenityBackfillPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [mode, setMode] = useState<'test' | 'full'>('test');
  const [testLimit, setTestLimit] = useState(10);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [recentListings, setRecentListings] = useState<RecentListing[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/amenity-backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'status' }),
    });
    if (res.ok) setStats(await res.json());
  }, []);

  const loadRecentListings = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, city, state, amenities')
      .eq('is_touchless', true)
      .not('amenities', 'is', null)
      .neq('amenities', '{}')
      .order('last_crawled_at', { ascending: false })
      .limit(10);
    if (data) setRecentListings(data);
  }, []);

  useEffect(() => {
    loadStats();
    loadRecentListings();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadStats, loadRecentListings]);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/amenity-backfill`, {
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
      if (data.status === 'done') {
        showToast('success', `Done! ${data.succeeded} of ${data.total} listings got new amenities.`);
      }
    }
  }, [loadStats, loadRecentListings, showToast]);

  const handleStart = useCallback(async () => {
    setJobStatus('running');
    setJobProgress(null);
    try {
      const limit = mode === 'test' ? testLimit : 0;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/amenity-backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'start', limit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start');
      if (data.total === 0) {
        showToast('info', data.message ?? 'No eligible listings found.');
        setJobStatus('idle');
        return;
      }
      jobIdRef.current = data.job_id;
      setJobProgress({ id: data.job_id, status: 'running', total: data.total, processed: 0, succeeded: 0 });
      showToast('info', `Started — processing ${data.total} listings.`);
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
    await fetch(`${SUPABASE_URL}/functions/v1/amenity-backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'cancel', job_id: jobId }),
    });
    setJobStatus('cancelled');
    showToast('info', 'Job cancelled.');
  }, [showToast]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    setJobStatus('idle');
    setJobProgress(null);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))
    : 0;

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
          <span className="text-sm font-medium text-[#0F2744]">Amenity Backfill</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <Tag className="w-6 h-6 text-teal-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Amenity Backfill</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Scrapes websites of touchless listings that are missing amenities and extracts them with Claude Haiku. Only adds new values — never removes or overwrites existing amenities.
        </p>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Eligible (missing amenities)</p>
              <p className="text-2xl font-bold text-amber-600">{stats.eligible.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">touchless listings with a website</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Already Have Amenities</p>
              <p className="text-2xl font-bold text-teal-600">{stats.already_have_amenities.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">touchless listings</p>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <ul className="space-y-1.5 text-sm text-gray-600 list-disc list-inside">
            <li>Targets only touchless listings with a website and no amenities (~{stats?.eligible ?? '…'} listings)</li>
            <li>Scrapes each website via Firecrawl (main content only)</li>
            <li>Claude Haiku extracts wash packages, services, facility features, and membership options</li>
            <li>New amenities are merged into the existing array — existing values are never removed</li>
            <li>Processes one listing at a time to avoid compute limits</li>
          </ul>
        </div>

        {/* Run panel */}
        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Amenity Backfill</CardTitle>
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
                        {m === 'test' ? 'Small batch to verify results' : `All ~${stats?.eligible.toLocaleString() ?? '…'} eligible listings`}
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
                      Processes all ~{stats?.eligible.toLocaleString() ?? '…'} eligible listings. Run a test first to confirm quality.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleStart}
                >
                  <Tag className="w-4 h-4 mr-2" />
                  {mode === 'test' ? `Run Test (${testLimit} listings)` : 'Start Full Amenity Backfill'}
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Scraping & extracting amenities…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {jobProgress.processed} / {jobProgress.total} done &nbsp;·&nbsp; {jobProgress.succeeded} got new amenities
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
                  <span>Running on server — safe to wait here or come back later.</span>
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
                      {jobProgress.succeeded} of {jobProgress.processed} listings got new amenities.
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

        {/* Recent results */}
        {recentListings.length > 0 && (
          <Card>
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Listings with Amenities
                  <span className="ml-2 text-xs font-normal text-gray-400">— recently updated</span>
                </CardTitle>
                <button onClick={loadRecentListings} className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {recentListings.map(listing => (
                  <div key={listing.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F2744] truncate">{listing.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{listing.city}, {listing.state}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{listing.amenities?.length ?? 0} amenities</span>
                    </div>
                    {listing.amenities && listing.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {listing.amenities.map((a, i) => (
                          <span key={i} className="px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full border border-teal-100">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
