'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Loader2, CheckCircle2, AlertCircle,
  XCircle, Merge, Play, RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type JobStatus = 'idle' | 'running' | 'completed' | 'failed';

interface Stats {
  total_listings: number;
  duplicate_groups: number;
  same_vendor_groups: number;
  diff_vendor_groups: number;
  already_processed: number;
}

interface JobProgress {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  merged: number;
  skipped: number;
}

interface TaskResult {
  id: string;
  group_key: string;
  listing_names: string[];
  same_vendor: boolean;
  group_size: number;
  decision: string;
  ai_reasoning: string;
  confidence: string;
  survivor_id: string | null;
  duplicate_ids: string[] | null;
  fields_merged: string[] | null;
  child_records_moved: number;
}

async function callFunction(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/dedup-listings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  return { ok: res.ok, data: await res.json() };
}

export default function DedupListingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scope, setScope] = useState<'same_vendor' | 'all'>('same_vendor');
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const loadStats = useCallback(async () => {
    const { ok, data } = await callFunction('status');
    if (ok) setStats(data);
  }, []);

  const loadResults = useCallback(async (jobId?: string) => {
    const { ok, data } = await callFunction('results', { job_id: jobId, limit: 30 });
    if (ok && data.tasks) setResults(data.tasks);
  }, []);

  useEffect(() => {
    loadStats();
    loadResults();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadStats, loadResults]);

  const pollJob = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    const { ok, data } = await callFunction('job_status', { job_id: jobId });
    if (!ok) return;
    setJobProgress(data);
    if (data.status === 'completed' || data.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current);
      setJobStatus(data.status === 'completed' ? 'completed' : 'failed');
      loadStats();
      loadResults(jobId);
      if (data.status === 'completed') {
        showToast('success', `Done! Merged ${data.merged} groups, skipped ${data.skipped} (${data.failed} failed).`);
      }
    }
  }, [loadStats, loadResults, showToast]);

  const handleStart = useCallback(async () => {
    setJobStatus('running');
    setJobProgress(null);
    setResults([]);
    try {
      const { ok, data } = await callFunction('start', { scope });
      if (!ok) throw new Error(data.error ?? 'Failed to start');
      jobIdRef.current = data.job_id;
      setJobProgress({
        id: data.job_id, status: 'running', total: data.total,
        completed: 0, failed: 0, merged: 0, skipped: 0,
      });
      showToast('info', `Started dedup job — processing ${data.total} duplicate groups (${scope === 'same_vendor' ? 'same-vendor only' : 'all'}).`);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(pollJob, 3000);
      pollJob();
    } catch (e) {
      showToast('error', (e as Error).message);
      setJobStatus('idle');
    }
  }, [scope, showToast, pollJob]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    jobIdRef.current = null;
    setJobStatus('idle');
    setJobProgress(null);
  }, []);

  const pct = jobProgress && jobProgress.total > 0
    ? Math.min(100, Math.round(((jobProgress.completed + jobProgress.failed) / jobProgress.total) * 100))
    : 0;

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

      <div className="container mx-auto px-4 max-w-4xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Admin</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/admin/import" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Import</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Dedup Listings</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-1">
          <Merge className="w-6 h-6 text-purple-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Dedup Listings</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">
          Uses Claude AI to identify and merge duplicate listings sharing the same address.
          Same-vendor duplicates (e.g., &ldquo;Circle K&rdquo; + &ldquo;Circle K | Car Wash&rdquo;) are merged automatically.
          Different-vendor groups are evaluated by AI to distinguish true duplicates from co-located businesses.
        </p>

        {/* Stats Banner */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Duplicate Groups</p>
              <p className="text-2xl font-bold text-[#0F2744]">{stats.duplicate_groups.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">address matches</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Same Vendor</p>
              <p className="text-2xl font-bold text-purple-600">{stats.same_vendor_groups.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">likely true dupes</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Diff. Vendor</p>
              <p className="text-2xl font-bold text-amber-600">{stats.diff_vendor_groups.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">needs AI review</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">Already Processed</p>
              <p className="text-2xl font-bold text-green-600">{stats.already_processed.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">completed tasks</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Run Deduplication</CardTitle>
          </CardHeader>
          <CardContent>
            {jobStatus === 'idle' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScope('same_vendor')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        scope === 'same_vendor'
                          ? 'bg-purple-50 border-purple-300 text-purple-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Same Vendor Only ({stats?.same_vendor_groups ?? '...'})
                    </button>
                    <button
                      onClick={() => setScope('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        scope === 'all'
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      All Duplicates ({stats?.duplicate_groups ?? '...'})
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {scope === 'same_vendor'
                      ? 'Processes only groups where all listings share the same vendor. Safest option — these are almost always true duplicates.'
                      : 'Processes all duplicate address groups including different-vendor pairs. AI will decide whether to merge or skip each group.'}
                  </p>
                </div>
                <Button
                  onClick={handleStart}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start Dedup
                </Button>
              </div>
            )}

            {jobStatus === 'running' && jobProgress && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    Processing {jobProgress.completed + jobProgress.failed} / {jobProgress.total} groups...
                  </span>
                  <span className="text-gray-400 font-mono">{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" /> Merged: {jobProgress.merged}
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-gray-400" /> Skipped: {jobProgress.skipped}
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-red-400" /> Failed: {jobProgress.failed}
                  </span>
                </div>
              </div>
            )}

            {(jobStatus === 'completed' || jobStatus === 'failed') && jobProgress && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 text-sm font-medium ${
                  jobStatus === 'completed' ? 'text-green-700' : 'text-red-700'
                }`}>
                  {jobStatus === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                  {jobStatus === 'completed' ? 'Dedup complete!' : 'Job failed'}
                </div>
                <div className="flex gap-4 text-sm text-gray-600">
                  <span>Merged: <strong>{jobProgress.merged}</strong></span>
                  <span>Skipped: <strong>{jobProgress.skipped}</strong></span>
                  <span>Failed: <strong>{jobProgress.failed}</strong></span>
                  <span>Total: <strong>{jobProgress.total}</strong></span>
                </div>
                <Button onClick={handleReset} variant="outline" size="sm" className="gap-1">
                  <RotateCw className="w-3.5 h-3.5" /> Run Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        {results.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Recent Results
                <span className="ml-2 text-sm font-normal text-gray-400">({results.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Address</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Listings</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Decision</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">AI Reasoning</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((task) => {
                      const [addr, city, state] = task.group_key.split('|');
                      return (
                        <tr key={task.id} className="border-b last:border-0 hover:bg-gray-50/80">
                          <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[180px]">
                            <div className="truncate font-medium">{addr}</div>
                            <div className="text-gray-400">{city}, {state?.toUpperCase()}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            <div className="space-y-0.5 max-w-[200px]">
                              {(task.listing_names || []).map((name, i) => (
                                <div key={i} className="truncate text-gray-600">
                                  {task.decision === 'merge' && task.duplicate_ids?.includes(task.listing_names?.[i] as unknown as string)
                                    ? <span className="line-through text-gray-300">{name}</span>
                                    : name}
                                </div>
                              ))}
                            </div>
                            {task.same_vendor && (
                              <span className="text-[10px] text-purple-500 font-medium">SAME VENDOR</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {task.decision === 'merge' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle2 className="w-3 h-3" /> Merged
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                                <XCircle className="w-3 h-3" /> Skipped
                              </span>
                            )}
                            <div className={`text-[10px] mt-0.5 ${
                              task.confidence === 'high' ? 'text-green-500' :
                              task.confidence === 'medium' ? 'text-amber-500' : 'text-red-400'
                            }`}>
                              {task.confidence} confidence
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[250px]">
                            <p className="line-clamp-2">{task.ai_reasoning}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">
                            {task.decision === 'merge' && (
                              <div className="space-y-0.5">
                                {task.fields_merged && task.fields_merged.length > 0 && (
                                  <div>{task.fields_merged.length} fields merged</div>
                                )}
                                {task.child_records_moved > 0 && (
                                  <div>{task.child_records_moved} child records moved</div>
                                )}
                                {task.duplicate_ids && (
                                  <div>{task.duplicate_ids.length} listing(s) removed</div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
