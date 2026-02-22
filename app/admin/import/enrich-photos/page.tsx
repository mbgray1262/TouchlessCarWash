'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Sparkles, Loader2, CheckCircle2, Zap, AlertCircle,
  ImageIcon, ExternalLink, RefreshCw, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type FirecrawlStatus = 'idle' | 'scraping' | 'scrape_done' | 'applying' | 'done' | 'error';

interface ScrapingProgress {
  completed: number;
  total: number;
  status: string;
}

interface EnrichedListing {
  id: string;
  name: string;
  city: string;
  state: string;
  website: string | null;
  photos: string[];
  amenities: string[];
}

export default function EnrichPhotosPage() {
  const [touchlessCount, setTouchlessCount] = useState<number | null>(null);
  const [enrichMode, setEnrichMode] = useState<'test' | 'full'>('test');
  const [enrichTestLimit, setEnrichTestLimit] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<FirecrawlStatus>('idle');
  const [scrapeProgress, setScrapeProgress] = useState<ScrapingProgress | null>(null);
  const [applyProgress, setApplyProgress] = useState<{ classified: number; total: number } | null>(null);
  const [enrichedListings, setEnrichedListings] = useState<EnrichedListing[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [readyBanner, setReadyBanner] = useState(false);
  const scrapeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const applyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const batchIdRef = useRef<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 8000);
  }, []);

  useEffect(() => {
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .then(({ count }) => setTouchlessCount(count ?? 0));
  }, []);

  useEffect(() => {
    return () => {
      if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current);
      if (applyTimerRef.current) clearInterval(applyTimerRef.current);
    };
  }, []);

  const pollFirecrawlStatus = useCallback(async (jId: string) => {
    try {
      const res = await fetch(`/api/pipeline/firecrawl-status?job_id=${jId}`);
      if (!res.ok) return;
      const data = await res.json();
      const completed = data.completed ?? 0;
      const total = data.total ?? 0;
      const fcStatus = data.status ?? 'scraping';

      setScrapeProgress({ completed, total, status: fcStatus });

      if (fcStatus === 'completed') {
        if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current);
        setStatus('scrape_done');
        setReadyBanner(true);
        showToast('success', `Firecrawl finished scraping ${total} pages. Click "Fetch & Apply" to enrich your listings.`);
      }
    } catch {
    }
  }, [showToast]);

  const startScrapePoll = useCallback((jId: string) => {
    if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current);
    scrapeTimerRef.current = setInterval(() => pollFirecrawlStatus(jId), 4000);
    pollFirecrawlStatus(jId);
  }, [pollFirecrawlStatus]);

  const pollApplyProgress = useCallback(async () => {
    const bId = batchIdRef.current;
    if (!bId) return;

    const { data } = await supabase
      .from('pipeline_batches')
      .select('classify_status, classified_count, total_urls')
      .eq('id', bId)
      .maybeSingle();

    if (!data) return;
    setApplyProgress({ classified: data.classified_count ?? 0, total: data.total_urls ?? 0 });

    if (data.classify_status === 'completed' || data.classify_status === 'expired') {
      if (applyTimerRef.current) clearInterval(applyTimerRef.current);
      setStatus('done');
      showToast('success', `Done! ${data.classified_count ?? 0} listings enriched with photos & amenities.`);
      loadPreview();
    }
  }, [showToast]);

  const loadPreview = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('id, name, city, state, website, photos, amenities')
      .eq('is_touchless', true)
      .not('photos', 'eq', '{}')
      .order('last_crawled_at', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      setEnrichedListings(data.map(r => ({
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        website: r.website,
        photos: Array.isArray(r.photos) ? r.photos : [],
        amenities: Array.isArray(r.amenities) ? r.amenities : [],
      })));
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setReadyBanner(false);
    setScrapeProgress(null);
    setApplyProgress(null);
    setEnrichedListings([]);
    try {
      const limit = enrichMode === 'test' ? enrichTestLimit : 0;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'enrich_touchless', limit, app_url: window.location.origin }),
      });
      const data = await res.json();
      if (res.status === 409 && data.already_running) {
        showToast('error', 'A Firecrawl batch is already running. Wait for it to finish first.');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit enrichment batch');
      setJobId(data.job_id);
      batchIdRef.current = data.batch_id ?? null;
      setScrapeProgress({ completed: 0, total: data.urls_submitted ?? 0, status: 'scraping' });
      setStatus('scraping');
      showToast('info', `Submitted ${data.urls_submitted} URLs to Firecrawl. Polling for progress…`);
      startScrapePoll(data.job_id);
    } catch (e) {
      showToast('error', (e as Error).message);
      setStatus('idle');
    } finally {
      setSubmitting(false);
    }
  }, [enrichMode, enrichTestLimit, showToast, startScrapePoll]);

  const handleApply = useCallback(async () => {
    if (!jobId) return;
    setStatus('applying');
    setReadyBanner(false);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'enrich_auto_poll', job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply enrichment');

      if (data.batch_id) batchIdRef.current = data.batch_id;

      if (applyTimerRef.current) clearInterval(applyTimerRef.current);
      applyTimerRef.current = setInterval(pollApplyProgress, 4000);
      pollApplyProgress();
    } catch (e) {
      showToast('error', (e as Error).message);
      setStatus('scrape_done');
    }
  }, [jobId, showToast, pollApplyProgress]);

  const reset = useCallback(() => {
    if (scrapeTimerRef.current) clearInterval(scrapeTimerRef.current);
    if (applyTimerRef.current) clearInterval(applyTimerRef.current);
    setJobId(null);
    setStatus('idle');
    setScrapeProgress(null);
    setApplyProgress(null);
    setEnrichedListings([]);
    setReadyBanner(false);
    batchIdRef.current = null;
  }, []);

  const scrapePct = scrapeProgress && scrapeProgress.total > 0
    ? Math.min(100, Math.round((scrapeProgress.completed / scrapeProgress.total) * 100))
    : 0;

  const applyPct = applyProgress && applyProgress.total > 0
    ? Math.min(100, Math.round((applyProgress.classified / applyProgress.total) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg text-sm font-medium transition-all animate-in slide-in-from-right-4 ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : toast.type === 'info'
            ? 'bg-blue-50 border-blue-200 text-blue-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.msg}
        </div>
      )}

      {readyBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0F2744] text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-400" />
          </span>
          <Bell className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="font-semibold text-sm">Firecrawl is done scraping!</span>
          <span className="text-white/60 text-sm">Click "Fetch & Apply" to process results.</span>
          <button
            onClick={() => setReadyBanner(false)}
            className="ml-2 text-white/40 hover:text-white text-xs leading-none"
          >
            ✕
          </button>
        </div>
      )}

      <div className="container mx-auto px-4 max-w-3xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Admin</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link href="/admin/import" className="text-sm text-gray-500 hover:text-[#0F2744] transition-colors">Import</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Enrich Photos & Amenities</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-2">
          <Sparkles className="w-6 h-6 text-teal-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Enrich Photos & Amenities</h1>
        </div>
        <p className="text-gray-500 mb-8">
          Crawls all touchless listings to backfill <strong>website photos</strong> and <strong>amenities</strong>. Never changes touchless status — purely additive.
        </p>

        <Card className="mb-4">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Enrichment</CardTitle>
          </CardHeader>
          <CardContent className="p-5">

            {status === 'idle' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEnrichMode('test')}
                    className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all text-left ${
                      enrichMode === 'test'
                        ? 'bg-teal-50 border-teal-400 text-teal-800'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Test Mode
                    <span className="block text-xs font-normal mt-0.5 opacity-70">Small batch to verify it works</span>
                  </button>
                  <button
                    onClick={() => setEnrichMode('full')}
                    className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-all text-left ${
                      enrichMode === 'full'
                        ? 'bg-teal-50 border-teal-400 text-teal-800'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Full Run
                    <span className="block text-xs font-normal mt-0.5 opacity-70">
                      All {touchlessCount !== null ? touchlessCount.toLocaleString() : '…'} touchless listings
                    </span>
                  </button>
                </div>

                {enrichMode === 'test' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">Number of listings to test</label>
                    <div className="flex items-center gap-2">
                      {[10, 20, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => setEnrichTestLimit(n)}
                          className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                            enrichTestLimit === n
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      Will crawl the first {enrichTestLimit} touchless listings and add photos/amenities if found.
                    </p>
                  </div>
                )}

                {enrichMode === 'full' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-800 font-medium">Full run uses Firecrawl credits</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Will submit all {touchlessCount !== null ? touchlessCount.toLocaleString() : '…'} touchless listings. Run a test first to confirm enrichment is working.
                    </p>
                  </div>
                )}

                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting to Firecrawl…</>
                    : <><Sparkles className="w-4 h-4 mr-2" /> {enrichMode === 'test' ? `Run Test (${enrichTestLimit} listings)` : 'Start Full Enrichment'}</>
                  }
                </Button>
              </div>
            )}

            {(status === 'scraping' || status === 'scrape_done') && scrapeProgress && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">
                      {status === 'scrape_done' ? 'Scraping complete — ready to apply!' : 'Firecrawl is scraping websites…'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {scrapeProgress.completed} / {scrapeProgress.total} pages scraped
                    </p>
                  </div>
                  {status === 'scraping' && (
                    <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
                    </span>
                  )}
                  {status === 'scrape_done' && (
                    <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
                  )}
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${scrapePct}%` }}
                  />
                </div>

                {status === 'scrape_done' && (
                  <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 flex items-start gap-2.5">
                    <Bell className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-teal-800">
                      All pages scraped. Click below to extract photos & amenities and save them to your listings.
                    </p>
                  </div>
                )}

                {status === 'scraping' && (
                  <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Firecrawl is scraping in the background. This page auto-updates. You'll be notified when it's ready.</span>
                  </div>
                )}

                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleApply}
                  disabled={status !== 'scrape_done'}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {status === 'scraping' ? 'Waiting for Firecrawl to finish…' : 'Fetch & Apply Enrichment Results'}
                </Button>

                {status === 'scrape_done' && (
                  <button onClick={reset} className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    Cancel & start over
                  </button>
                )}
              </div>
            )}

            {status === 'applying' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">Applying enrichment data…</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Extracting photos & amenities from scraped pages
                      {applyProgress ? ` — ${applyProgress.classified} / ${applyProgress.total} done` : ''}
                    </p>
                  </div>
                  <Loader2 className="w-4 h-4 text-teal-500 animate-spin shrink-0 mt-0.5" />
                </div>
                {applyProgress && applyProgress.total > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-500 h-2 rounded-full transition-all duration-700"
                      style={{ width: `${applyPct}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-teal-600">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
                  </span>
                  Running on server — safe to wait here or come back later
                </div>
              </div>
            )}

            {status === 'done' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-teal-800">Enrichment complete</p>
                    <p className="text-xs text-teal-600 mt-0.5">
                      {applyProgress?.classified ?? 0} listings updated with photos & amenities.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-teal-300 text-teal-700 hover:bg-teal-50 shrink-0"
                    onClick={reset}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Again
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {enrichedListings.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-[#0F2744]">
                  Results Preview
                  <span className="ml-2 text-xs font-normal text-gray-400">— recently enriched touchless listings with photos</span>
                </CardTitle>
                <button
                  onClick={loadPreview}
                  className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {enrichedListings.map(listing => (
                  <div key={listing.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#0F2744] truncate">{listing.name}</p>
                          {listing.website && (
                            <a
                              href={listing.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-teal-600 transition-colors shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{listing.city}, {listing.state}</p>
                        {listing.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {listing.amenities.slice(0, 6).map(a => (
                              <span key={a} className="px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-full border border-teal-100">
                                {a}
                              </span>
                            ))}
                            {listing.amenities.length > 6 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                                +{listing.amenities.length - 6} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {listing.photos.slice(0, 3).map((photo, i) => (
                          <a key={i} href={photo} target="_blank" rel="noopener noreferrer">
                            <img
                              src={photo}
                              alt=""
                              className="w-16 h-12 object-cover rounded-md border border-gray-200 hover:border-teal-400 transition-colors"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </a>
                        ))}
                        {listing.photos.length === 0 && (
                          <div className="w-16 h-12 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-gray-300" />
                          </div>
                        )}
                        {listing.photos.length > 3 && (
                          <div className="w-16 h-12 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center text-xs text-gray-500 font-medium">
                            +{listing.photos.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">What this does</p>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>Crawls each touchless listing's website using Firecrawl</li>
            <li>Extracts photos and adds them to the listing's photo gallery</li>
            <li>Extracts amenity data (self-serve, full-serve, detailing, etc.) and merges into existing amenities</li>
            <li>Never removes or overwrites existing data — only adds new data found</li>
            <li>Never changes the touchless classification status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
