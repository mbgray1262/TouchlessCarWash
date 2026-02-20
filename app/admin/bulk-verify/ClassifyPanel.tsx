'use client';

import { useState, useRef } from 'react';
import { Loader2, Play, StopCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, edgeFunctionUrl, edgeFunctionHeaders } from './utils';
import type { ClassifyProgress } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CLASSIFY_BATCH = 10;

interface Props {
  onComplete: () => void;
}

export function ClassifyPanel({ onComplete }: Props) {
  const [batchSize, setBatchSize] = useState(50);
  const [applyToChain, setApplyToChain] = useState(true);
  const [progress, setProgress] = useState<ClassifyProgress>({
    running: false, current: 0, total: 0, currentName: '', done: 0, failed: 0,
  });
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef(false);

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-199), msg]);
  }

  async function fetchCrawledListings(limit: number) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, name')
      .eq('verification_status', 'crawled')
      .not('crawl_snapshot', 'is', null)
      .order('last_crawled_at', { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as Array<{ id: string; name: string }>;
  }

  async function startClassify() {
    const listings = await fetchCrawledListings(batchSize);
    if (listings.length === 0) {
      addLog('No crawled listings awaiting classification.');
      return;
    }

    abortRef.current = false;
    const total = listings.length;
    setProgress({ running: true, current: 0, total, currentName: '', done: 0, failed: 0 });
    setLog([]);

    let done = 0;
    let failed = 0;

    for (let i = 0; i < listings.length; i += CLASSIFY_BATCH) {
      if (abortRef.current) { addLog('Cancelled.'); break; }

      const chunk = listings.slice(i, i + CLASSIFY_BATCH);
      const chunkIds = chunk.map(l => l.id);
      const chunkNames = chunk.map(l => l.name).join(', ');

      setProgress(p => ({ ...p, current: i + 1, currentName: chunkNames }));
      addLog(`Classifying batch ${Math.floor(i / CLASSIFY_BATCH) + 1}: ${chunkNames}`);

      try {
        const res = await fetch(edgeFunctionUrl('bulk-classify'), {
          method: 'POST',
          headers: edgeFunctionHeaders(),
          body: JSON.stringify({ listingIds: chunkIds, applyToChain }),
        });

        const json = await res.json();
        if (json.results) {
          for (const r of json.results) {
            if (r.status === 'classified') {
              done++;
              const chainNote = r.chain_applied_to ? ` (+${r.chain_applied_to} chain)` : '';
              addLog(`  OK: ${r.name} — ${r.classification} (${r.confidence}%)${chainNote}`);
            } else {
              failed++;
              addLog(`  FAIL: ${r.name} — ${r.error || r.status}`);
            }
          }
        }
      } catch (err) {
        failed += chunk.length;
        addLog(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }

      setProgress(p => ({ ...p, done, failed }));
    }

    setProgress(p => ({ ...p, running: false }));
    addLog(`Done. ${done} classified, ${failed} failed.`);
    onComplete();
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Step 2: Claude AI Classification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Batch Size</label>
            <input
              type="number"
              min={1}
              max={200}
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={progress.running}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
            <input
              type="checkbox"
              checked={applyToChain}
              onChange={e => setApplyToChain(e.target.checked)}
              disabled={progress.running}
              className="rounded"
            />
            Apply chain results to all chain locations
          </label>
          <div className="flex gap-2">
            <Button
              onClick={startClassify}
              disabled={progress.running}
              size="sm"
              className="bg-[#0F2744] hover:bg-[#1a3a6b] text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" /> Classify Crawled Listings
            </Button>
            {progress.running && (
              <Button
                onClick={() => { abortRef.current = true; }}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
              </Button>
            )}
          </div>
        </div>

        {progress.running && (
          <div>
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="flex items-center gap-2 text-gray-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                {progress.currentName}
              </span>
              <span className="tabular-nums text-gray-500">
                {progress.current}/{progress.total} &nbsp;·&nbsp; {progress.done} done &nbsp;·&nbsp; {progress.failed} failed
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-gray-300 space-y-0.5">
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
