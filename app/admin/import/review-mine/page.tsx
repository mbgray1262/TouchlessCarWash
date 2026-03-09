'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Loader2, CheckCircle2, XCircle,
  Star, ExternalLink, Play, BarChart3, MessageSquare,
  RefreshCw, MapPin, ChevronDown, ChevronUp, Map, ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface ReviewSnippet {
  text: string;
  rating: number | null;
  reviewer: string | null;
  keywords: string[];
  // From progress endpoint
  reviewer_name?: string;
  review_text?: string;
  touchless_keywords?: string[];
}

interface ScanResult {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
  google_place_id: string;
  google_maps_url: string | null;
  status: string;
  reviewCount: number;
  apiCalls: number;
  aiVerdict?: string;
  reviews: ReviewSnippet[];
}

interface ScanBatchResponse {
  scanned_this_batch: number;
  found_touchless: number;
  ai_rejected?: number;
  api_calls_used: number;
  total_scanned: number;
  total_remaining: number;
  total_touchless_found: number;
  complete: boolean;
  results: ScanResult[];
  message?: string;
}

interface RecentFind {
  id: string;
  name: string;
  city: string;
  state: string;
  slug: string;
  google_place_id: string;
  google_maps_url: string | null;
  touchless_review_count: number;
  reviews: Array<{
    reviewer_name: string | null;
    rating: number | null;
    review_text: string;
    touchless_keywords: string[];
  }>;
}

interface ProgressResponse {
  total_car_wash_listings: number;
  total_scanned: number;
  total_remaining: number;
  total_touchless_found: number;
  complete: boolean;
  recent_finds: RecentFind[];
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

/** Highlight touchless keywords in review text */
function HighlightedReview({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords.length) return <span>{text}</span>;

  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, i) =>
        keywords.some(k => k.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

/** Google Maps link for a place */
function GoogleMapsLink({ url, placeId }: { url: string | null; placeId: string }) {
  const href = url || `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline">
      <Map className="w-3 h-3" />
      Google Maps
    </a>
  );
}

/** Expandable review list for a single listing */
function ReviewList({ reviews, type }: {
  reviews: ReviewSnippet[] | RecentFind['reviews'];
  type: 'scan' | 'progress';
}) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? reviews : reviews.slice(0, 2);

  return (
    <div className="mt-2 space-y-1.5">
      {display.map((r, i) => {
        const text = type === 'scan' ? (r as ReviewSnippet).text : (r as RecentFind['reviews'][0]).review_text;
        const reviewer = type === 'scan' ? (r as ReviewSnippet).reviewer : (r as RecentFind['reviews'][0]).reviewer_name;
        const rating = r.rating;
        const keywords = type === 'scan' ? (r as ReviewSnippet).keywords : (r as RecentFind['reviews'][0]).touchless_keywords;

        return (
          <div key={i} className="bg-white rounded p-2 text-xs border border-gray-100">
            <div className="flex items-center gap-2 mb-0.5 text-gray-500">
              {reviewer && <span className="font-medium text-gray-700">{reviewer}</span>}
              {rating && (
                <span className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  {rating}
                </span>
              )}
            </div>
            <div className="text-gray-600 leading-relaxed">
              <HighlightedReview text={text} keywords={keywords || []} />
            </div>
          </div>
        );
      })}
      {reviews.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> Show less</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> Show {reviews.length - 2} more review{reviews.length - 2 > 1 ? 's' : ''}</>
          )}
        </button>
      )}
    </div>
  );
}

export default function ReviewMinePage() {
  // View state
  const [activeView, setActiveView] = useState<'scanner' | 'found'>('scanner');

  // Progress state
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(true);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(25);
  const [autoScan, setAutoScan] = useState(false);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // Prospect state
  const [prospectQuery, setProspectQuery] = useState('');
  const [prospecting, setProspecting] = useState(false);
  const [prospectResult, setProspectResult] = useState<ProspectResult | null>(null);
  const [prospectError, setProspectError] = useState<string | null>(null);

  // Reject state
  const [rejectingIds, setRejectingIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  // Cumulative stats for current session
  const [sessionStats, setSessionStats] = useState({
    batchesRun: 0,
    totalScanned: 0,
    totalFound: 0,
    totalAiRejected: 0,
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

      // Replace previous results with new batch results (clear old batch)
      setScanResults(data.results || []);
      setSessionStats((prev) => ({
        batchesRun: prev.batchesRun + 1,
        totalScanned: prev.totalScanned + data.scanned_this_batch,
        totalFound: prev.totalFound + data.found_touchless,
        totalAiRejected: prev.totalAiRejected + (data.ai_rejected || 0),
        totalApiCalls: prev.totalApiCalls + data.api_calls_used,
      }));

      // Refresh progress from the dedicated progress endpoint (reliable)
      // Don't use inline counts from batch response — they return zeros
      // due to known edge function service-role key bug
      await fetchProgress();

      // Only stop auto-scan when the batch returned zero results,
      // meaning there are genuinely no more listings to scan.
      // Don't rely on data.complete — it uses getTotalScannedCount()
      // which can return zeros due to the service-role key bug,
      // causing auto-scan to stop prematurely.
      if (data.scanned_this_batch === 0) {
        setAutoScan(false);
      }

      // Reset error counter on success
      setConsecutiveErrors(0);

      return data;
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      // Don't stop auto-scan on errors — edge functions can timeout
      // on large batches. The next batch will pick up where it left off.
      // But stop after 5 consecutive errors to avoid infinite retries
      // (e.g. SerpAPI out of credits, auth failure, etc.)
      setConsecutiveErrors((prev) => {
        const next = prev + 1;
        if (next >= 5) {
          setAutoScan(false);
        }
        return next;
      });
      return null;
    } finally {
      setScanning(false);
    }
  }, [batchSize]);

  // Auto-scan effect — keeps running batches until no listings remain
  useEffect(() => {
    if (autoScan && !scanning) {
      // Wait longer after errors to give the server time to recover
      const delay = consecutiveErrors > 0 ? 5000 : 1000;
      const timer = setTimeout(() => {
        runScanBatch();
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [autoScan, scanning, runScanBatch, consecutiveErrors]);

  const rejectTouchless = async (listingId: string) => {
    setRejectingIds((prev) => new Set(prev).add(listingId));
    try {
      await callEdgeFunction('reject_touchless', { listing_id: listingId });
      setRejectedIds((prev) => new Set(prev).add(listingId));
      // Update scan results to reflect rejection
      setScanResults((prev) =>
        prev.map((r) =>
          r.id === listingId ? { ...r, status: 'rejected_by_user' } : r,
        ),
      );
      // Refresh progress to update counts
      fetchProgress();
    } catch (err) {
      console.error('Failed to reject listing:', err);
    } finally {
      setRejectingIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  };

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

  const touchlessFoundFromScan = scanResults.filter((r) => r.status === 'touchless_found');

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
            <h1 className="text-2xl font-bold text-gray-900">Review Mining</h1>
            <p className="text-sm text-gray-500">
              Discover touchless car washes by scanning Google reviews via SerpAPI
            </p>
          </div>
        </div>

        {/* Progress Overview — metric cards are clickable filters */}
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
                <RefreshCw className={`w-4 h-4 ${loadingProgress ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {progress ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <button
                    onClick={() => setActiveView('scanner')}
                    className={`rounded-lg p-3 text-left transition-all ${
                      activeView === 'scanner'
                        ? 'bg-blue-100 ring-2 ring-blue-400'
                        : 'bg-blue-50 hover:bg-blue-100'
                    }`}
                  >
                    <div className="text-2xl font-bold text-blue-700">
                      {progress.total_scanned.toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">Scanned</div>
                  </button>
                  <div className="rounded-lg p-3 bg-gray-50 border">
                    <div className="text-2xl font-bold text-gray-700">
                      {progress.total_remaining.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-600">Remaining</div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveView('found');
                      if (!progress.recent_finds?.length) fetchProgress();
                    }}
                    className={`rounded-lg p-3 text-left transition-all ${
                      activeView === 'found'
                        ? 'bg-green-100 ring-2 ring-green-400'
                        : 'bg-green-50 hover:bg-green-100'
                    }`}
                  >
                    <div className="text-2xl font-bold text-green-700">
                      {progress.total_touchless_found.toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600">
                      Touchless Found
                      {activeView !== 'found' && (
                        <span className="ml-1 text-green-500">&rarr; click to view</span>
                      )}
                    </div>
                  </button>
                  <div className="rounded-lg p-3 bg-purple-50">
                    <div className="text-2xl font-bold text-purple-700">{progressPercent}%</div>
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

        {/* ================================================================ */}
        {/* VIEW: Scanner — scan batches + prospect */}
        {/* ================================================================ */}
        {activeView === 'scanner' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Scan Existing Listings */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Scan Existing Listings
                  </CardTitle>
                  <p className="text-sm text-gray-500">
                    Scan non-touchless car wash listings for review evidence
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Batch:</label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={batchSize}
                        onChange={(e) =>
                          setBatchSize(Math.min(100, Math.max(1, parseInt(e.target.value) || 50)))
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
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Scanning...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" />Run Batch</>
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
                      <div className="font-medium text-gray-700 mb-1">Session Stats</div>
                      <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <div>Batches: {sessionStats.batchesRun}</div>
                        <div>Scanned: {sessionStats.totalScanned}</div>
                        <div className="text-green-700 font-medium">Found: {sessionStats.totalFound}</div>
                        {sessionStats.totalAiRejected > 0 && (
                          <div className="text-amber-700">AI Rejected: {sessionStats.totalAiRejected}</div>
                        )}
                        <div>API Calls: {sessionStats.totalApiCalls}</div>
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
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {scanResults.map((r, i) => (
                        <div
                          key={`${r.id}-${i}`}
                          className={`p-3 rounded-lg text-sm ${
                            r.status === 'touchless_found'
                              ? 'bg-green-50 border border-green-200'
                              : r.status === 'ai_rejected'
                                ? 'bg-amber-50 border border-amber-200'
                                : r.status === 'error'
                                  ? 'bg-red-50 border border-red-200'
                                  : 'bg-gray-50 border border-gray-200'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              {r.status === 'touchless_found' ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                              ) : r.status === 'rejected_by_user' ? (
                                <ThumbsDown className="w-4 h-4 text-red-500 shrink-0" />
                              ) : r.status === 'ai_rejected' ? (
                                <XCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              ) : r.status === 'error' ? (
                                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-gray-300 shrink-0" />
                              )}
                              <span className="font-medium truncate">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.status === 'touchless_found' && !rejectedIds.has(r.id) && (
                                <button
                                  onClick={() => rejectTouchless(r.id)}
                                  disabled={rejectingIds.has(r.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                                  title="Mark as not touchless"
                                >
                                  {rejectingIds.has(r.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ThumbsDown className="w-3 h-3" />
                                  )}
                                  Not Touchless
                                </button>
                              )}
                              {r.status === 'rejected_by_user' && (
                                <Badge className="bg-red-100 text-red-800 text-xs">
                                  Rejected
                                </Badge>
                              )}
                              {r.status === 'touchless_found' && (
                                <Badge className="bg-green-100 text-green-800 text-xs">
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  {r.reviewCount} review{r.reviewCount !== 1 ? 's' : ''}
                                </Badge>
                              )}
                              {r.status === 'ai_rejected' && (
                                <Badge className="bg-amber-100 text-amber-800 text-xs">
                                  AI Rejected
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* AI verdict */}
                          {r.aiVerdict && (
                            <div className={`ml-6 text-xs px-2 py-1 rounded mb-1 ${
                              r.status === 'touchless_found'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {r.aiVerdict}
                            </div>
                          )}

                          {/* Location + links */}
                          <div className="flex items-center gap-3 text-xs text-gray-500 ml-6">
                            <span>{r.city}, {r.state}</span>
                            {r.slug && (
                              <Link
                                href={`/state/${r.state?.toLowerCase()}/${r.city?.toLowerCase().replace(/\s+/g, '-')}/${r.slug}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View listing
                              </Link>
                            )}
                            <GoogleMapsLink url={r.google_maps_url} placeId={r.google_place_id} />
                          </div>

                          {/* Review evidence */}
                          {r.reviews.length > 0 && (
                            <div className="ml-6">
                              <ReviewList reviews={r.reviews} type="scan" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Prospect New Areas */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Prospect New Areas
                  </CardTitle>
                  <p className="text-sm text-gray-500">
                    Search for car washes in a city/state and auto-import those with touchless
                    review evidence
                  </p>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => { e.preventDefault(); runProspect(); }}
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
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" />Searching...</>
                      ) : (
                        <><Search className="w-4 h-4 mr-2" />Prospect</>
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
                      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                        <div className="font-medium text-gray-700 mb-2">
                          Results for &ldquo;{prospectResult.query}&rdquo;
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-gray-600">
                          <div>Places found: {prospectResult.total_places_found}</div>
                          <div>Already in DB: {prospectResult.already_in_db}</div>
                          <div>New checked: {prospectResult.new_places_checked}</div>
                          <div>API calls: {prospectResult.api_calls_used}</div>
                        </div>
                      </div>

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
                                  <div className="font-medium truncate">{item.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {item.city}, {item.state} &middot; {item.reviewCount} touchless
                                    review{item.reviewCount !== 1 ? 's' : ''}
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
                                  <div className="font-medium truncate">{item.name}</div>
                                  <div className="text-gray-400 truncate">{item.address}</div>
                                </div>
                                <span className="text-gray-400 shrink-0 ml-2">{item.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {prospectResult.imported.length === 0 && prospectResult.skipped.length === 0 && (
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
        )}

        {/* ================================================================ */}
        {/* VIEW: Found — all touchless discoveries with reviews */}
        {/* ================================================================ */}
        {activeView === 'found' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  All Touchless Discoveries ({progress?.total_touchless_found || 0})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchProgress} disabled={loadingProgress}>
                  <RefreshCw className={`w-4 h-4 ${loadingProgress ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Car washes reclassified as touchless based on Google review evidence.
                Click links to verify on your site or Google Maps.
              </p>
            </CardHeader>
            <CardContent>
              {loadingProgress ? (
                <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading discoveries...
                </div>
              ) : progress?.recent_finds && progress.recent_finds.length > 0 ? (
                <div className="space-y-4">
                  {progress.recent_finds.map((find) => (
                    <div
                      key={find.id}
                      className="bg-green-50 border border-green-200 rounded-lg p-4"
                    >
                      {/* Listing header */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{find.name}</h3>
                          <div className="text-sm text-gray-500">
                            {find.city}, {find.state}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!rejectedIds.has(find.id) ? (
                            <button
                              onClick={() => rejectTouchless(find.id)}
                              disabled={rejectingIds.has(find.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                              title="Mark as not touchless"
                            >
                              {rejectingIds.has(find.id) ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <ThumbsDown className="w-3 h-3" />
                              )}
                              Not Touchless
                            </button>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 text-xs">
                              Rejected
                            </Badge>
                          )}
                          <Badge className="bg-green-100 text-green-800">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {find.touchless_review_count} review
                            {find.touchless_review_count !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>

                      {/* Verification links */}
                      <div className="flex items-center gap-4 mb-3 text-xs">
                        {find.slug && (
                          <Link
                            href={`/state/${find.state?.toLowerCase()}/${find.city?.toLowerCase().replace(/\s+/g, '-')}/${find.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View on site
                          </Link>
                        )}
                        <GoogleMapsLink url={find.google_maps_url} placeId={find.google_place_id} />
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${find.google_place_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 hover:underline"
                        >
                          <Search className="w-3 h-3" />
                          Search reviews
                        </a>
                      </div>

                      {/* Review evidence */}
                      {find.reviews.length > 0 ? (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">
                            Review evidence ({find.reviews.length} matching):
                          </div>
                          <ReviewList reviews={find.reviews} type="progress" />
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic">
                          Review snippets not loaded — refresh to see evidence
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No touchless discoveries yet. Run a scan batch to start finding them!
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
