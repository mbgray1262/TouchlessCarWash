'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Database, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type JobStatus = 'idle' | 'running' | 'completed' | 'failed';

interface PipelineStats {
  total_touchless: number;
  with_snapshot: number;
  with_extracted_data: number;
  eligible_for_extraction: number;
}

interface JobProgress {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
}

interface RecentExtraction {
  id: string;
  name: string;
  city: string;
  state: string;
  extracted_data: Record<string, unknown> | null;
  extracted_at: string | null;
}

function callFn(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/extract-rich-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export default function ExtractRichDataPage() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [mode, setMode] = useState<'test' | 'full'>('test');
  const [regenerate, setRegenerate] = useState(false);
  const [testLimit, setTestLimit] = useState(10);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [recentExtractions, setRecentExtractions] = useState<RecentExtraction[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const loadStats = useCallback(async () => {
    const res = await callFn({ action: 'status' });
    if (res.ok) setStats(await res.json());
  }, []);

  const loadRecentExtractions = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, city, state, extracted_data, extracted_at')
      .eq('is_touchless', true)
      .not('extracted_data', 'is', null)
      .order('extracted_at', { ascending: false })
      .limit(8);
    if (data) setRecentExtractions(data as RecentExtraction[]);
  }, []);

  useEffect(() => {
    loadStats();
    loadRecentExtractions();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadStats, loadRecentExtractions]);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const res = await callFn({ action: 'job_status', job_id: jobId });
    if (!res.ok) return;
    const data: JobProgress = await res.json();
    setJobProgress(data);
    if (data.status === 'completed' || data.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current);
      setJobStatus(data.status === 'completed' ? 'completed' : 'failed');
      loadStats();
      loadRecentExtractions();
      if (data.status === 'completed') {
        showToast('success', `Done! Extracted data for ${data.completed} listings (${data.failed} failed).`);
      }
    }
  }, [loadStats, loadRecentExtractions, showToast]);

  const handleStart = useCallback(async () => {
    setJobStatus('running');
    setJobProgress(null);
    try {
      const limit = mode === 'test' ? testLimit : 0;
      const res = await callFn({ action: 'start', limit, regenerate });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start');
      if (data.total === 0) {
        showToast('info', data.message ?? 'No eligible listings found.');
        setJobStatus('idle');
        return;
      }
      jobIdRef.current = data.job_id;
      setJobProgress({ id: data.job_id, status: 'running', total: data.total, completed: 0, failed: 0 });
      showToast('info', `Started — extracting data for ${data.total} listings.`);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(pollJob, 3000);
      pollJob();
    } catch (e) {
      showToast('error', (e as Error).message);
      setJobStatus('idle');
    }
  }, [mode, testLimit, regenerate, showToast, pollJob]);

  const handleCancel = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    await callFn({ action: 'cancel', job_id: jobId });
    setJobStatus('failed');
    showToast('info', 'Job cancelled.');
  }, [showToast]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    setJobStatus('idle');
    setJobProgress(null);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round(((jobProgress.completed + jobProgress.failed) / jobProgress.total) * 100))
    : 0;

  const eligibleCount = regenerate ? stats?.with_snapshot : stats?.eligible_for_extraction;

  function summarizeExtraction(data: Record<string, unknown> | null): string {
    if (!data) return '';
    const parts: string[] = [];
    const pkgs = data.wash_packages as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(pkgs) && pkgs.length > 0) parts.push(`${pkgs.length} wash packages`);
    const plans = data.membership_plans as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(plans) && plans.length > 0) parts.push(`${plans.length} membership plans`);
    const equip = data.equipment_technology as string[] | undefined;
    if (Array.isArray(equip) && equip.length > 0) parts.push(`${equip.length} equipment/tech`);
    const features = data.special_features as string[] | undefined;
    if (Array.isArray(features) && features.length > 0) parts.push(`${features.length} features`);
    if (data.review_highlights) parts.push('review highlights');
    return parts.join(' · ') || 'Extracted (no rich data found)';
  }

  return (
    <div className="min-h-screen bg-gray-50">

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
          <span className="text-sm font-medium text-[#0F2744]">Extract Rich Data</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <Database className="w-6 h-6 text-purple-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Extract Rich Data</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Uses Claude Haiku to mine detailed structured data from saved crawl snapshots — wash packages with pricing, membership plans, equipment/technology, special features, and customer review highlights.
        </p>

        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Total Touchless</p>
              <p className="text-2xl font-bold text-[#0F2744]">{stats.total_touchless.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Have Snapshot</p>
              <p className="text-2xl font-bold text-blue-600">{stats.with_snapshot.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Already Extracted</p>
              <p className="text-2xl font-bold text-green-600">{stats.with_extracted_data.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Ready to Extract</p>
              <p className="text-2xl font-bold text-purple-600">{stats.eligible_for_extraction.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">What gets extracted</p>
          <ul className="space-y-1.5 text-sm text-gray-600 list-disc list-inside">
            <li>Wash packages with pricing (e.g., Basic $8.99, Premium $18.99)</li>
            <li>Membership/unlimited plans with pricing and features</li>
            <li>Equipment and technology (e.g., LaserWash 360, spot-free RO system)</li>
            <li>Special features (24/7 access, RV/truck capable, pet wash)</li>
            <li>Customer review highlights and unique selling points</li>
            <li>Payment methods and detailed amenities</li>
          </ul>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Data Extraction</CardTitle>
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
                          ? 'bg-purple-50 border-purple-400 text-purple-800'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m === 'test' ? 'Test Mode' : 'Full Run'}
                      <span className="block text-xs font-normal mt-0.5 opacity-70">
                        {m === 'test' ? 'Small batch to review quality' : `All ~${eligibleCount?.toLocaleString() ?? '…'} eligible listings`}
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
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setRegenerate(r => !r)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      regenerate ? 'bg-purple-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      regenerate ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                  <span className="text-sm text-gray-600">
                    Re-extract existing data
                    <span className="block text-xs text-gray-400">Off = only listings without extracted_data</span>
                  </span>
                </div>

                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handleStart}
                >
                  <Database className="w-4 h-4 mr-2" />
                  {mode === 'test' ? `Extract Data for ${testLimit} Listings` : 'Start Full Extraction'}
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Extracting rich data...</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {jobProgress.completed + jobProgress.failed} / {jobProgress.total} processed
                      &nbsp;&middot;&nbsp; {jobProgress.completed} succeeded
                      {jobProgress.failed > 0 && <span className="text-red-400"> &middot; {jobProgress.failed} failed</span>}
                    </p>
                  </div>
                  <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-purple-500 h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
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

            {(jobStatus === 'completed' || jobStatus === 'failed') && jobProgress && (
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                  jobStatus === 'completed' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  {jobStatus === 'completed'
                    ? <CheckCircle2 className="w-5 h-5 text-purple-600 shrink-0" />
                    : <XCircle className="w-5 h-5 text-gray-400 shrink-0" />
                  }
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${jobStatus === 'completed' ? 'text-purple-800' : 'text-gray-600'}`}>
                      {jobStatus === 'completed' ? 'Extraction complete' : 'Job cancelled'}
                    </p>
                    <p className={`text-xs mt-0.5 ${jobStatus === 'completed' ? 'text-purple-600' : 'text-gray-400'}`}>
                      {jobProgress.completed} listings extracted
                      {jobProgress.failed > 0 && `, ${jobProgress.failed} failed`}
                      {' '}out of {jobProgress.total}.
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

        {recentExtractions.length > 0 && (
          <Card>
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Recent Extractions
                  <span className="ml-2 text-xs font-normal text-gray-400">— most recently processed</span>
                </CardTitle>
                <button onClick={loadRecentExtractions} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {recentExtractions.map(listing => (
                  <div key={listing.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F2744] truncate">{listing.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{listing.city}, {listing.state}</p>
                      </div>
                      {listing.extracted_at && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(listing.extracted_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-600">{summarizeExtraction(listing.extracted_data)}</p>
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
