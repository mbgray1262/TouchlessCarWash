'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronRight, Sparkles, Loader2, CheckCircle2, Zap, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function EnrichPhotosPage() {
  const [touchlessCount, setTouchlessCount] = useState<number | null>(null);
  const [enrichMode, setEnrichMode] = useState<'test' | 'full'>('test');
  const [enrichTestLimit, setEnrichTestLimit] = useState(20);
  const [enrichSubmitting, setEnrichSubmitting] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);
  const [enrichPolling, setEnrichPolling] = useState(false);
  const [enrichAllDone, setEnrichAllDone] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ classified: number; total: number; status: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const enrichProgressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(() => {
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .then(({ count }) => setTouchlessCount(count ?? 0));
  }, []);

  useEffect(() => {
    return () => { if (enrichProgressTimerRef.current) clearInterval(enrichProgressTimerRef.current); };
  }, []);

  const pollEnrichProgress = useCallback(async (jobId: string) => {
    const { data } = await supabase
      .from('pipeline_batches')
      .select('firecrawl_job_id, classify_status, classified_count, total_urls')
      .eq('firecrawl_job_id', jobId)
      .maybeSingle();

    if (!data) return;
    setEnrichProgress({
      classified: data.classified_count ?? 0,
      total: data.total_urls ?? 0,
      status: data.classify_status ?? 'running',
    });

    if (data.classify_status === 'completed' || data.classify_status === 'expired') {
      if (enrichProgressTimerRef.current) clearInterval(enrichProgressTimerRef.current);
      setEnrichPolling(false);
      setEnrichAllDone(true);
      showToast('success', `Enrichment complete — ${data.classified_count ?? 0} listings updated with photos & amenities.`);
    }
  }, [showToast]);

  const handleEnrichSubmit = useCallback(async () => {
    setEnrichSubmitting(true);
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
      setEnrichJobId(data.job_id);
      setEnrichProgress({ classified: 0, total: data.urls_submitted ?? 0, status: 'running' });
      setEnrichAllDone(false);
      setEnrichPolling(false);
      showToast('success', `Submitted ${data.urls_submitted} URLs to Firecrawl for enrichment.`);
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setEnrichSubmitting(false);
    }
  }, [enrichMode, enrichTestLimit, showToast]);

  const handleEnrichAutoPoll = useCallback(async () => {
    if (!enrichJobId) return;
    if (enrichProgressTimerRef.current) clearInterval(enrichProgressTimerRef.current);
    setEnrichPolling(true);
    setEnrichAllDone(false);

    await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'enrich_auto_poll', job_id: enrichJobId }),
    }).catch(() => {});

    enrichProgressTimerRef.current = setInterval(() => pollEnrichProgress(enrichJobId), 5000);
    pollEnrichProgress(enrichJobId);
  }, [enrichJobId, pollEnrichProgress]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
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
          <span className="text-sm font-medium text-[#0F2744]">Enrich Photos & Amenities</span>
        </div>

        <div className="flex items-center gap-2.5 mt-4 mb-2">
          <Sparkles className="w-6 h-6 text-teal-600" />
          <h1 className="text-3xl font-bold text-[#0F2744]">Enrich Photos & Amenities</h1>
        </div>
        <p className="text-gray-500 mb-8">
          Crawls all touchless listings to backfill <strong>website photos</strong> and <strong>amenities</strong>. Never changes touchless status — purely additive.
        </p>

        <Card>
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-[#0F2744]">Run Enrichment</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {enrichAllDone ? (
              <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-teal-800">Enrichment complete</p>
                  <p className="text-xs text-teal-600 mt-0.5">{enrichProgress?.classified ?? 0} listings updated with photos & amenities.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-teal-300 text-teal-700 hover:bg-teal-50 shrink-0"
                  onClick={() => { setEnrichAllDone(false); setEnrichJobId(null); setEnrichProgress(null); }}
                >
                  Run Again
                </Button>
              </div>
            ) : enrichJobId && enrichProgress ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">
                    {enrichPolling ? 'Enriching listings…' : 'Firecrawl batch submitted'}
                  </span>
                  <span className="text-xs text-gray-400 font-mono tabular-nums">
                    {enrichProgress.classified} / {enrichProgress.total} processed
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: enrichProgress.total > 0 ? `${Math.min(99, Math.round((enrichProgress.classified / enrichProgress.total) * 100))}%` : '0%' }}
                  />
                </div>
                {enrichPolling ? (
                  <div className="flex items-center gap-2 text-sm text-teal-600">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
                    </span>
                    Running on server — safe to close this tab
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                      <span>Firecrawl is scraping the sites. Click below when ready to process results. Wait 1–2 minutes first.</span>
                    </div>
                    <Button
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                      onClick={handleEnrichAutoPoll}
                      disabled={enrichPolling}
                    >
                      <Zap className="w-4 h-4 mr-2" /> Fetch & Apply Enrichment Results
                    </Button>
                  </div>
                )}
              </div>
            ) : (
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
                  onClick={handleEnrichSubmit}
                  disabled={enrichSubmitting}
                >
                  {enrichSubmitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting to Firecrawl…</>
                    : <><Sparkles className="w-4 h-4 mr-2" /> {enrichMode === 'test' ? `Run Test (${enrichTestLimit} listings)` : 'Start Full Enrichment'}</>
                  }
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 space-y-2">
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
