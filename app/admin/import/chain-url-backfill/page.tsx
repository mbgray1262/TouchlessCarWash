'use client';

import { useState, useEffect, useRef } from 'react';
import { Link2, Loader2, CheckCircle2, AlertCircle, Play, Square, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/AdminNav';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface Job {
  id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_chains: number;
  chains_processed: number;
  total_matched: number;
  total_unmatched: number;
  current_vendor_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  chain_url_backfill_results?: VendorResult[];
}

interface VendorResult {
  id: number;
  vendor_id: number;
  vendor_name: string;
  domain: string;
  locations_url_used: string | null;
  links_found: number;
  matched: number;
  unmatched: number;
  error_message: string | null;
  created_at: string;
}

function callFn(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/chain-url-backfill`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full bg-[#0F2744] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ChainUrlBackfillPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async (jobId?: number) => {
    try {
      const resp = await callFn({ action: 'status', job_id: jobId });
      const data = await resp.json();
      if (data.job) setJob(data.job);
    } catch {
    }
  };

  const startPolling = (jobId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const resp = await callFn({ action: 'status', job_id: jobId });
      const data = await resp.json();
      if (data.job) {
        setJob(data.job);
        if (['completed', 'failed', 'cancelled'].includes(data.job.status)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      }
    }, 3000);
  };

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (job?.status === 'running' && !pollRef.current) {
      startPolling(job.id);
    }
  }, [job?.status, job?.id]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const resp = await callFn({ action: 'start' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to start');
      await fetchStatus(data.job_id);
      startPolling(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      await callFn({ action: 'cancel', job_id: job.id });
      await fetchStatus(job.id);
    } finally {
      setCancelling(false);
    }
  };

  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'completed' || job?.status === 'cancelled' || job?.status === 'failed';
  const pct = job && job.total_chains > 0 ? Math.round((job.chains_processed / job.total_chains) * 100) : 0;
  const results = job?.chain_url_backfill_results || [];
  const errorResults = results.filter(r => r.error_message);
  const matchedResults = results.filter(r => r.matched > 0);
  const zeroResults = results.filter(r => r.matched === 0 && !r.error_message);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="container mx-auto px-4 max-w-4xl py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Link2 className="w-6 h-6 text-[#0F2744]" />
            <h1 className="text-2xl font-bold text-[#0F2744]">Chain URL Backfill</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Automatically discovers individual location URLs for all chain car washes and updates listings. Uses Firecrawl to map each chain&apos;s website and match locations by city and state.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                {!job || isDone ? (
                  <div className="text-center py-4">
                    {!job && (
                      <p className="text-gray-500 mb-6 text-sm">
                        No backfill has been run yet. Click the button below to start processing all chain vendors automatically.
                      </p>
                    )}
                    {job?.status === 'completed' && (
                      <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-center gap-2 text-green-700 font-medium mb-1">
                          <CheckCircle2 className="w-5 h-5" />
                          Last run completed
                        </div>
                        <p className="text-sm text-green-600">
                          {job.total_matched.toLocaleString()} URLs updated across {job.chains_processed} chains
                        </p>
                      </div>
                    )}
                    {job?.status === 'cancelled' && (
                      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
                        Last run was cancelled after processing {job.chains_processed} of {job.total_chains} chains ({job.total_matched} URLs updated).
                      </div>
                    )}
                    {job?.status === 'failed' && (
                      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        Last run failed: {job.error_message}
                      </div>
                    )}
                    {error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {error}
                      </div>
                    )}
                    <Button
                      size="lg"
                      className="bg-[#0F2744] hover:bg-[#1e3a8a] px-8"
                      onClick={handleStart}
                      disabled={starting}
                    >
                      {starting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" />{job ? 'Run Again' : 'Run Backfill'}</>
                      )}
                    </Button>
                    <p className="text-xs text-gray-400 mt-3">
                      This will process all chains in the background. You can close this page and come back.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#0F2744]" />
                        <span className="font-medium text-[#0F2744]">Running backfill...</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                        <span className="ml-1.5">Cancel</span>
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>
                          {job.current_vendor_name ? (
                            <>Processing: <span className="font-medium text-gray-700">{job.current_vendor_name}</span></>
                          ) : 'Starting...'}
                        </span>
                        <span>{job.chains_processed} / {job.total_chains} chains ({pct}%)</span>
                      </div>
                      <ProgressBar value={job.chains_processed} max={job.total_chains} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-700">{job.total_matched.toLocaleString()}</div>
                        <div className="text-xs text-green-600">URLs Updated</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-700">{job.total_unmatched.toLocaleString()}</div>
                        <div className="text-xs text-amber-600">Could Not Match</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {job && results.length > 0 && (
              <Card>
                <CardHeader className="pb-3 pt-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Results ({results.length} chains processed)</CardTitle>
                    <button
                      onClick={() => setShowResults(v => !v)}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {showResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {showResults ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  <div className="flex gap-3 text-sm mt-1">
                    <span className="text-green-600">{matchedResults.length} with matches</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{zeroResults.length} no matches found</span>
                    {errorResults.length > 0 && (
                      <><span className="text-gray-400">·</span><span className="text-red-600">{errorResults.length} errors</span></>
                    )}
                  </div>
                </CardHeader>
                {showResults && (
                  <CardContent className="pt-0">
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Chain</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">Links</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">Matched</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">Unmatched</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...results].sort((a, b) => b.matched - a.matched).map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-800">{r.vendor_name}</div>
                                <a
                                  href={`https://www.${r.domain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-0.5 w-fit"
                                >
                                  {r.domain} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-500">{r.links_found}</td>
                              <td className="px-3 py-2 text-right">
                                {r.matched > 0 ? (
                                  <span className="text-green-600 font-medium">{r.matched}</span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {r.unmatched > 0 ? (
                                  <span className="text-amber-600">{r.unmatched}</span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {r.error_message ? (
                                  <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50 text-xs">
                                    Error
                                  </Badge>
                                ) : r.matched > 0 ? (
                                  <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 text-xs">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />Updated
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-gray-200 text-gray-500 text-xs">
                                    No match
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
