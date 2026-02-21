'use client';

import { useState, useRef } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Scan,
  Globe,
  Sparkles,
  Loader2,
  AlertCircle,
  Play,
  StopCircle,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, edgeFunctionUrl, edgeFunctionHeaders } from './utils';
import type { DashboardStats, ClassificationLabel, CrawlProgress, ClassifyProgress } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CRAWL_BATCH = 5;
const CLASSIFY_BATCH = 10;

interface Props {
  stats: DashboardStats;
  onComplete: () => void;
  onFilterReview: (filter: ClassificationLabel | 'all') => void;
}

interface ScanResult {
  touchless: number;
  likelyTouchless: number;
}

function StepHeader({
  number,
  title,
  status,
  expanded,
  onToggle,
  summary,
}: {
  number: string;
  title: string;
  status: 'done' | 'active' | 'idle';
  expanded: boolean;
  onToggle: () => void;
  summary?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-4 text-left group"
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
        status === 'done'
          ? 'bg-green-100 text-green-700 border-2 border-green-300'
          : status === 'active'
          ? 'bg-[#0F2744] text-white'
          : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
      }`}>
        {status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : number}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm ${
            status === 'done' ? 'text-green-800' : status === 'active' ? 'text-[#0F2744]' : 'text-gray-400'
          }`}>{title}</span>
          {status === 'done' && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Done</span>
          )}
        </div>
        {summary && <div className="text-xs text-gray-500 mt-0.5">{summary}</div>}
      </div>

      <div className={`text-gray-400 group-hover:text-gray-600 transition-colors ${status === 'idle' ? 'opacity-40' : ''}`}>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </div>
    </button>
  );
}

function StepConnector({ active }: { active: boolean }) {
  return (
    <div className="flex ml-4 my-1">
      <div className={`w-0.5 h-4 ${active ? 'bg-gray-300' : 'bg-gray-200'}`} />
    </div>
  );
}

export function PipelineStepper({ stats, onComplete, onFilterReview }: Props) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0, 1, 2]));

  const [scanRunning, setScanRunning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [crawlBatchSize, setCrawlBatchSize] = useState(100);
  const [crawlDelayMs, setCrawlDelayMs] = useState(1000);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress>({
    running: false, current: 0, total: 0, currentName: '', done: 0, failed: 0, batchIds: [],
  });
  const [crawlLog, setCrawlLog] = useState<string[]>([]);
  const crawlAbortRef = useRef(false);

  const [classifyBatchSize, setClassifyBatchSize] = useState(50);
  const [applyToChain, setApplyToChain] = useState(true);
  const [classifyProgress, setClassifyProgress] = useState<ClassifyProgress>({
    running: false, current: 0, total: 0, currentName: '', done: 0, failed: 0,
  });
  const [classifyLog, setClassifyLog] = useState<string[]>([]);
  const classifyAbortRef = useRef(false);

  function toggleStep(n: number) {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function addCrawlLog(msg: string) {
    setCrawlLog(prev => [...prev.slice(-199), msg]);
  }

  function addClassifyLog(msg: string) {
    setClassifyLog(prev => [...prev.slice(-199), msg]);
  }

  async function runNameScan() {
    setScanRunning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const res = await fetch('/api/name-pre-scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setScanResult({ touchless: data.touchless, likelyTouchless: data.likelyTouchless });
      onComplete();
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setScanRunning(false);
    }
  }

  async function fetchNextBatch(limit: number, chainsOnly = false) {
    let query = supabase
      .from('listings')
      .select('id, name, website, parent_chain')
      .not('website', 'is', null)
      .in('verification_status', ['unverified'])
      .order('created_at', { ascending: true })
      .limit(limit);
    if (chainsOnly) query = query.not('parent_chain', 'is', null);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as Array<{ id: string; name: string; website: string | null; parent_chain: string | null }>;
  }

  async function fetchChainRepresentatives() {
    const { data, error } = await supabase
      .from('listings')
      .select('id, name, website, parent_chain')
      .not('website', 'is', null)
      .not('parent_chain', 'is', null)
      .in('verification_status', ['unverified'])
      .order('parent_chain', { ascending: true });
    if (error || !data) return [];
    const seen = new Set<string>();
    const reps: typeof data = [];
    for (const row of data) {
      if (row.parent_chain && !seen.has(row.parent_chain)) {
        seen.add(row.parent_chain);
        reps.push(row);
        if (reps.length >= 200) break;
      }
    }
    return reps;
  }

  async function startCrawl(listings: Array<{ id: string; name: string }>) {
    crawlAbortRef.current = false;
    const total = listings.length;
    setCrawlProgress({ running: true, current: 0, total, currentName: '', done: 0, failed: 0, batchIds: listings.map(l => l.id) });
    setCrawlLog([]);
    let done = 0;
    let failed = 0;
    for (let i = 0; i < listings.length; i += CRAWL_BATCH) {
      if (crawlAbortRef.current) { addCrawlLog('Cancelled.'); break; }
      const chunk = listings.slice(i, i + CRAWL_BATCH);
      const chunkNames = chunk.map(l => l.name).join(', ');
      setCrawlProgress(p => ({ ...p, current: i + 1, currentName: chunkNames }));
      addCrawlLog(`Crawling batch ${Math.floor(i / CRAWL_BATCH) + 1}: ${chunkNames}`);
      try {
        const res = await fetch(edgeFunctionUrl('bulk-crawl'), {
          method: 'POST',
          headers: edgeFunctionHeaders(),
          body: JSON.stringify({ listingIds: chunk.map(l => l.id), delayMs: crawlDelayMs }),
        });
        const json = await res.json();
        if (json.results) {
          for (const r of json.results) {
            if (r.status === 'crawled') { done++; addCrawlLog(`  OK: ${r.name} (${r.photos_found} photos)`); }
            else { failed++; addCrawlLog(`  FAIL: ${r.name} — ${r.error || r.status}`); }
          }
        }
      } catch (err) {
        failed += chunk.length;
        addCrawlLog(`  ERROR in batch: ${err instanceof Error ? err.message : String(err)}`);
      }
      setCrawlProgress(p => ({ ...p, done, failed }));
    }
    setCrawlProgress(p => ({ ...p, running: false }));
    addCrawlLog(`Done. ${done} crawled, ${failed} failed.`);
    onComplete();
  }

  async function handleStartCrawl() {
    const listings = await fetchNextBatch(crawlBatchSize);
    if (listings.length === 0) { addCrawlLog('No unverified listings with websites found.'); return; }
    await startCrawl(listings);
  }

  async function handleCrawlChains() {
    const reps = await fetchChainRepresentatives();
    if (reps.length === 0) { addCrawlLog('No unverified chain listings found.'); return; }
    addCrawlLog(`Found ${reps.length} unique chains. Crawling one rep each...`);
    await startCrawl(reps);
  }

  async function startClassify() {
    const { data, error } = await supabase
      .from('listings')
      .select('id, name')
      .eq('verification_status', 'crawled')
      .not('crawl_snapshot', 'is', null)
      .order('last_crawled_at', { ascending: true })
      .limit(classifyBatchSize);
    if (error || !data || data.length === 0) {
      addClassifyLog('No crawled listings awaiting classification.');
      return;
    }
    const listings = data as Array<{ id: string; name: string }>;
    classifyAbortRef.current = false;
    const total = listings.length;
    setClassifyProgress({ running: true, current: 0, total, currentName: '', done: 0, failed: 0 });
    setClassifyLog([]);
    let done = 0;
    let failed = 0;
    for (let i = 0; i < listings.length; i += CLASSIFY_BATCH) {
      if (classifyAbortRef.current) { addClassifyLog('Cancelled.'); break; }
      const chunk = listings.slice(i, i + CLASSIFY_BATCH);
      const chunkNames = chunk.map(l => l.name).join(', ');
      setClassifyProgress(p => ({ ...p, current: i + 1, currentName: chunkNames }));
      addClassifyLog(`Classifying batch ${Math.floor(i / CLASSIFY_BATCH) + 1}: ${chunkNames}`);
      try {
        const res = await fetch(edgeFunctionUrl('bulk-classify'), {
          method: 'POST',
          headers: edgeFunctionHeaders(),
          body: JSON.stringify({ listingIds: chunk.map(l => l.id), applyToChain }),
        });
        const json = await res.json();
        if (json.results) {
          for (const r of json.results) {
            if (r.status === 'classified') {
              done++;
              addClassifyLog(`  OK: ${r.name} — ${r.classification} (${r.confidence}%)${r.chain_applied_to ? ` +${r.chain_applied_to} chain` : ''}`);
            } else {
              failed++;
              addClassifyLog(`  FAIL: ${r.name} — ${r.error || r.status}`);
            }
          }
        }
      } catch (err) {
        failed += chunk.length;
        addClassifyLog(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
      setClassifyProgress(p => ({ ...p, done, failed }));
    }
    setClassifyProgress(p => ({ ...p, running: false }));
    addClassifyLog(`Done. ${done} classified, ${failed} failed.`);
    onComplete();
  }

  const crawlPct = crawlProgress.total > 0 ? Math.round((crawlProgress.current / crawlProgress.total) * 100) : 0;
  const classifyPct = classifyProgress.total > 0 ? Math.round((classifyProgress.current / classifyProgress.total) * 100) : 0;

  const step0Done = (stats.name_match_high + stats.name_match_likely) > 0;
  const step1Done = stats.awaiting_classification > 0 || crawlProgress.done > 0;
  const step2Done = stats.auto_classified > 0 || classifyProgress.done > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Pipeline Steps</h2>
      </div>

      <div className="px-6 py-5 space-y-1">

        {/* Step 0: Name Pre-Scan */}
        <StepHeader
          number="0"
          title="Name Pre-Scan"
          status={step0Done ? 'done' : 'active'}
          expanded={expandedSteps.has(0)}
          onToggle={() => toggleStep(0)}
          summary={
            step0Done
              ? `${stats.name_match_high.toLocaleString()} auto-approved · ${stats.name_match_likely.toLocaleString()} flagged for review`
              : 'Instantly classify listings by keywords in their business name'
          }
        />

        {expandedSteps.has(0) && (
          <div className="ml-12 mt-3 mb-2 space-y-3">
            <p className="text-xs text-gray-400">
              Matches <span className="font-mono text-gray-500 bg-gray-50 px-1 rounded">touchless, touch free, brushless, laserwash, no touch, friction free</span> at 95% confidence and{' '}
              <span className="font-mono text-gray-500 bg-gray-50 px-1 rounded">laser</span> at 70% confidence (flagged for review).
            </p>

            {step0Done ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onFilterReview('confirmed_touchless')}
                  className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3.5 py-2.5 hover:bg-green-100 transition-colors text-left group"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800 group-hover:underline underline-offset-2">
                      {stats.name_match_high.toLocaleString()} auto-approved as touchless
                    </p>
                    <p className="text-xs text-green-600">95% confidence · name_match</p>
                  </div>
                </button>
                <button
                  onClick={() => onFilterReview('likely_touchless')}
                  className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5 hover:bg-amber-100 transition-colors text-left group"
                >
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 group-hover:underline underline-offset-2">
                      {stats.name_match_likely.toLocaleString()} flagged for review
                    </p>
                    <p className="text-xs text-amber-600">70% confidence · needs review in Step 3</p>
                  </div>
                </button>
              </div>
            ) : (
              <div>
                {scanError && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{scanError}</span>
                  </div>
                )}
                {scanResult && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg px-3.5 py-2.5">
                      {scanResult.touchless.toLocaleString()} auto-classified as touchless
                    </div>
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5">
                      {scanResult.likelyTouchless.toLocaleString()} flagged for review
                    </div>
                  </div>
                )}
                <button
                  onClick={runNameScan}
                  disabled={scanRunning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2744] text-white text-sm font-medium rounded-lg hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
                >
                  {scanRunning ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>
                  ) : (
                    <><Scan className="w-4 h-4" />Run Name Pre-Scan</>
                  )}
                </button>
              </div>
            )}

            {step0Done && (
              <button
                onClick={runNameScan}
                disabled={scanRunning}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors disabled:opacity-40"
              >
                {scanRunning ? 'Running...' : 'Re-run scan'}
              </button>
            )}
          </div>
        )}

        <StepConnector active={step0Done} />

        {/* Step 1: Firecrawl */}
        <StepHeader
          number="1"
          title="Firecrawl Website Snapshots"
          status={step1Done ? 'done' : step0Done ? 'active' : 'idle'}
          expanded={expandedSteps.has(1)}
          onToggle={() => toggleStep(1)}
          summary={
            step1Done
              ? `${stats.awaiting_classification.toLocaleString()} crawled · awaiting AI classification`
              : `${stats.chains.toLocaleString()} chains · ${stats.standalone.toLocaleString()} standalone listings to crawl`
          }
        />

        {expandedSteps.has(1) && (
          <div className="ml-12 mt-3 mb-2 space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Batch Size</label>
                <input
                  type="number" min={1} max={500} value={crawlBatchSize}
                  onChange={e => setCrawlBatchSize(Number(e.target.value))}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={crawlProgress.running}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Delay (ms)</label>
                <input
                  type="number" min={0} max={10000} step={100} value={crawlDelayMs}
                  onChange={e => setCrawlDelayMs(Number(e.target.value))}
                  className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={crawlProgress.running}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleCrawlChains} disabled={crawlProgress.running} variant="outline" size="sm"
                  className="border-orange-200 text-orange-700 hover:bg-orange-50">
                  <Link2 className="w-3.5 h-3.5 mr-1.5" /> Crawl Chains First ({stats.chains})
                </Button>
                <Button onClick={handleStartCrawl} disabled={crawlProgress.running} size="sm"
                  className="bg-[#0F2744] hover:bg-[#1a3a6b] text-white">
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Start Crawling
                </Button>
                {crawlProgress.running && (
                  <Button onClick={() => { crawlAbortRef.current = true; }} variant="outline" size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50">
                    <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
                  </Button>
                )}
              </div>
            </div>

            {crawlProgress.running && (
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span className="truncate max-w-xs">{crawlProgress.currentName}</span>
                  </span>
                  <span className="tabular-nums shrink-0">
                    {crawlProgress.current}/{crawlProgress.total} · {crawlProgress.done} OK · {crawlProgress.failed} failed
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${crawlPct}%` }} />
                </div>
              </div>
            )}

            {crawlLog.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-3 max-h-36 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
                {crawlLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
          </div>
        )}

        <StepConnector active={step1Done} />

        {/* Step 2: Classify */}
        <StepHeader
          number="2"
          title="Claude AI Classification"
          status={step2Done ? 'done' : step1Done ? 'active' : 'idle'}
          expanded={expandedSteps.has(2)}
          onToggle={() => toggleStep(2)}
          summary={
            stats.awaiting_classification > 0
              ? `${stats.awaiting_classification.toLocaleString()} crawled listings ready to classify`
              : step2Done
              ? `${stats.auto_classified.toLocaleString()} classified · awaiting review in Step 3`
              : 'Run after crawling to classify with AI'
          }
        />

        {expandedSteps.has(2) && (
          <div className="ml-12 mt-3 mb-2 space-y-4">
            {stats.awaiting_classification === 0 && !classifyProgress.running && classifyLog.length === 0 && (
              <p className="text-xs text-gray-400">
                No crawled listings ready for classification. Run Step 1 first.
              </p>
            )}
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Batch Size</label>
                <input
                  type="number" min={1} max={200} value={classifyBatchSize}
                  onChange={e => setClassifyBatchSize(Number(e.target.value))}
                  className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={classifyProgress.running}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
                <input
                  type="checkbox" checked={applyToChain}
                  onChange={e => setApplyToChain(e.target.checked)}
                  disabled={classifyProgress.running}
                  className="rounded"
                />
                Apply chain results to all locations
              </label>
              <div className="flex gap-2">
                <Button onClick={startClassify} disabled={classifyProgress.running || stats.awaiting_classification === 0} size="sm"
                  className="bg-[#0F2744] hover:bg-[#1a3a6b] text-white">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Classify Crawled Listings ({stats.awaiting_classification})
                </Button>
                {classifyProgress.running && (
                  <Button onClick={() => { classifyAbortRef.current = true; }} variant="outline" size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50">
                    <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
                  </Button>
                )}
              </div>
            </div>

            {classifyProgress.running && (
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    <span className="truncate max-w-xs">{classifyProgress.currentName}</span>
                  </span>
                  <span className="tabular-nums shrink-0">
                    {classifyProgress.current}/{classifyProgress.total} · {classifyProgress.done} done · {classifyProgress.failed} failed
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${classifyPct}%` }} />
                </div>
              </div>
            )}

            {classifyLog.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-3 max-h-36 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
                {classifyLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
          </div>
        )}

        <StepConnector active={step2Done} />

        {/* Step 3 indicator (links to review panel below) */}
        <button
          onClick={() => onFilterReview('all')}
          className="w-full flex items-center gap-4 group"
        >
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
            stats.auto_classified > 0
              ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
              : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
          }`}>
            {stats.auto_classified > 0 ? stats.auto_classified : '3'}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-sm ${stats.auto_classified > 0 ? 'text-amber-800 group-hover:underline underline-offset-2' : 'text-gray-400'}`}>
                Human Review
              </span>
              {stats.auto_classified > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                  {stats.auto_classified} waiting
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.auto_classified > 0
                ? 'Items ready for your review — click to scroll down'
                : 'Review queue is empty'}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </button>

      </div>
    </div>
  );
}
