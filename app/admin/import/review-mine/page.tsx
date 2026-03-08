'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Loader2, CheckCircle2, XCircle,
  Star, ExternalLink, Play, BarChart3, MessageSquare,
  RefreshCw, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface ScanResult {
  id: string;
  name: string;
  city: string;
  state: string;
  status: string;
  reviewCount: number;
  apiCalls: number;
}

interface ScanBatchResponse {
  scanned_this_batch: number;
  found_touchless: number;
  api_calls_used: number;
  total_scanned: number;
  total_remaining: number;
  total_touchless_found: number;
  complete: boolean;
  results: ScanResult[];
  message?: string;
}

interface ProgressResponse {
  total_car_wash_listings: number;
  total_scanned: number;
  total_remaining: number;
  total_touchless_found: number;
  complete: boolean;
  recent_finds: Array<{
    id: string;
    name: string;
    city: string;
    state: string;
    slug: string;
    touchless_review_count: number;
  }>;
}

interface ProspectResult {
  query: string;
  total_places_found: number;
  already_in_db: number;
  previously_rejected: number;
  new_places_checked: number;
  api_calls_used: number;
  imported: Array<{
    id: string;
    name: string;
    city: string;
    state: string;
    reviewCount: number;
    slug: string;
  }>;
  skipped: Array<{
    name: string;
    address: string;
    reason: string;
  }>;
}

async function callEdgeFunction(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/review-mine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function ReviewMinePage() {
  // Progress state
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(true);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(50);
  const [autoScan, setAutoScan] = useState(false);

  // Prospect state
  const [prospectQuery, setProspectQuery] = useState('');
  const [prospecting, setProspecting] = useState(false);
  const [prospectResult, setProspectResult] = useState<ProspectResult | null>(null);
  const [prospectError, setProspectError] = useState<string | null>(null);

  // Cumulative stats for current session
  const [sessionStats, setSessionStats] = useState({
    batchesRun: 0,
    totalScanned: 0,
    totalFound: 0,
    totalApiCalls: 0,
  });

  const fetchProgress = useCallback(async () => {
    try {
      setLoadingProgress(true);
      const data: ProgressResponse = await callEdgeFunction('progress');
      setProgress(data);
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const runScanBatch = useCallback(async () => {
    setScanning(true);
    setScanError(null);

    try {
      const data: ScanBatchResponse = await callEdgeFunction('scan_batch', {
        batch_size: batchSize,
      });

      setScanResults((prev) => [...(data.results || []), ...prev]);
      setSessionStats((prev) => ({
        batchesRun: prev.batchesRun + 1,
        totalScanned: prev.totalScanned + data.scanned_this_batch,
        totalFound: prev.totalFound + data.found_touchless,
        totalApiCalls: prev.totalApiCalls + data.api_calls_used,
      }));

      // Refresh progress
      setProgress((prev) =>
        prev
          ? {
              ...prev,
              total_scanned: data.total_scanned,
              total_remaining: data.total_remaining,
              total_touchless_found: data.total_touchless_found,
              complete: data.complete,
            }
          : prev,
      );

      if (data.complete) {
        setAutoScan(false);
      }

      return data;
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setAutoScan(false);
      return null;
    } finally {
      setScanning(false);
    }
  }, [batchSize]);

  // Auto-scan effect
  useEffect(() => {
    if (autoScan && !scanning) {
      const timer = setTimeout(() => {
        runScanBatch();
      }, 1000); // 1 second delay between batches
      return () => clearTimeout(timer);
    }
  }, [autoScan, scanning, runScanBatch]);

  const runProspect = async () => {
    if (!prospectQuery.trim()) return;
    setProspecting(true);
    setProspectError(null);
    setProspectResult(null);

    try {
      const data: ProspectResult = await callEdgeFunction('prospect', {
        query: prospectQuery,
      });
      setProspectResult(data);
      // Refresh progress after prospecting
      fetchProgress();
    } catch (err) {
      setProspectError(err instanceof Error ? err.message : String(err));
    } finally {
      setProspecting(false);
    }
  };

  const progressPercent =
    progress && progress.total_scanned + progress.total_remaining > 0
      ? Math.round(
          (progress.total_scanned /
            (progress.total_scanned + progress.total_remaining)) *
            100,
        )
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/import"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Import
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Review Mining
            </h1>
            <p className="text-sm text-gray-500">
              Discover touchless car washes by scanning Google reviews via
              SerpAPI
            </p>
          </div>
        </div>

        {/* Progress Overview */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Scan Progress
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchProgress}
                disabled={loadingProgress}
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingProgress ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {progress ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-700">
                      {progress.total_scanned.toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">Scanned</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <div className="text-2xl font-bold text-gray-700">
                      {progress.total_remaining.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-600">Remaining</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-700">
                      {progress.total_touchless_found.toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600">
                      Touchless Found
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-purple-700">
                      {progressPercent}%
                    </div>
                    <div className="text-xs text-purple-600">Complete</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {progress.complete && (
                  <div className="mt-3 flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    All car wash listings have been scanned!
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading progress...
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Section 1: Scan Existing Listings */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Scan Existing Listings
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Scan non-touchless car wash listings in the database for
                  review evidence
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Batch size:</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={batchSize}
                      onChange={(e) =>
                        setBatchSize(
                          Math.min(100, Math.max(1, parseInt(e.target.value) || 50)),
                        )
                      }
                      className="w-20"
                    />
                  </div>
                  <Button
                    onClick={runScanBatch}
                    disabled={scanning || progress?.complete}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Batch
                      </>
                    )}
                  </Button>
                  <Button
                    variant={autoScan ? 'destructive' : 'outline'}
                    onClick={() => setAutoScan(!autoScan)}
                    disabled={progress?.complete}
                  >
                    {autoScan ? 'Stop Auto' : 'Auto Scan'}
                  </Button>
                </div>

                {/* Session stats */}
                {sessionStats.batchesRun > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                    <div className="font-medium text-gray-700 mb-1">
                      Session Stats
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                      <div>
                        Batches: {sessionStats.batchesRun}
                      </div>
                      <div>
                        Scanned: {sessionStats.totalScanned}
                      </div>
                      <div className="text-green-700 font-medium">
                        Found: {sessionStats.totalFound}
                      </div>
                      <div>
                        API Calls: {sessionStats.totalApiCalls}
                      </div>
                    </div>
                  </div>
                )}

                {scanError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {scanError}
                  </div>
                )}

                {/* Scan results */}
                {scanResults.length > 0 && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {scanResults.map((r, i) => (
                      <div
                        key={`${r.id}-${i}`}
                        className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                          r.status === 'touchless_found'
                            ? 'bg-green-50 border border-green-200'
                            : r.status === 'error'
                              ? 'bg-red-50 border border-red-200'
                              : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {r.status === 'touchless_found' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          ) : r.status === 'error' ? (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-gray-300 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-gray-500 ml-1">
                              {r.city}, {r.state}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {r.status === 'touchless_found' && (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              {r.reviewCount} review{r.reviewCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400">
                            {r.apiCalls} call{r.apiCalls !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Finds */}
            {progress?.recent_finds && progress.recent_finds.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    Recent Touchless Discoveries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {progress.recent_finds.map((find) => (
                      <div
                        key={find.id}
                        className="flex items-center justify-between p-2 bg-green-50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <div className="truncate">
                            <span className="font-medium">{find.name}</span>
                            <span className="text-gray-500 ml-1">
                              {find.city}, {find.state}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="secondary"
                            className="text-xs"
                          >
                            {find.touchless_review_count} review
                            {find.touchless_review_count !== 1 ? 's' : ''}
                          </Badge>
                          <Link
                            href={`/state/${find.state?.toLowerCase()}/${find.slug}`}
                            target="_blank"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Section 2: Prospect New Areas */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Prospect New Areas
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Search for car washes in a city/state and auto-import those
                  with touchless review evidence
                </p>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runProspect();
                  }}
                  className="flex gap-2 mb-4"
                >
                  <Input
                    placeholder="e.g. Portland, OR"
                    value={prospectQuery}
                    onChange={(e) => setProspectQuery(e.target.value)}
                    disabled={prospecting}
                  />
                  <Button
                    type="submit"
                    disabled={prospecting || !prospectQuery.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {prospecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Prospect
                      </>
                    )}
                  </Button>
                </form>

                {prospectError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {prospectError}
                  </div>
                )}

                {prospectResult && (
                  <div>
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                      <div className="font-medium text-gray-700 mb-2">
                        Results for &ldquo;{prospectResult.query}&rdquo;
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div>
                          Places found: {prospectResult.total_places_found}
                        </div>
                        <div>
                          Already in DB: {prospectResult.already_in_db}
                        </div>
                        <div>
                          New checked: {prospectResult.new_places_checked}
                        </div>
                        <div>
                          API calls: {prospectResult.api_calls_used}
                        </div>
                      </div>
                    </div>

                    {/* Imported */}
                    {prospectResult.imported.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          Auto-Imported ({prospectResult.imported.length})
                        </h4>
                        <div className="space-y-2">
                          {prospectResult.imported.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg text-sm"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {item.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.city}, {item.state} &middot;{' '}
                                  {item.reviewCount} touchless review
                                  {item.reviewCount !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <Link
                                href={`/${item.slug}`}
                                target="_blank"
                                className="text-blue-600 hover:text-blue-800 shrink-0 ml-2"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skipped */}
                    {prospectResult.skipped.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-2">
                          Skipped ({prospectResult.skipped.length})
                        </h4>
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                          {prospectResult.skipped.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {item.name}
                                </div>
                                <div className="text-gray-400 truncate">
                                  {item.address}
                                </div>
                              </div>
                              <span className="text-gray-400 shrink-0 ml-2">
                                {item.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {prospectResult.imported.length === 0 &&
                      prospectResult.skipped.length === 0 && (
                        <div className="text-sm text-gray-500 text-center py-4">
                          No new car washes found in this area.
                        </div>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
