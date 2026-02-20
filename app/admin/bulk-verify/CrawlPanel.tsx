'use client';

import { useState, useRef } from 'react';
import { Loader2, Play, StopCircle, Globe, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, edgeFunctionUrl, edgeFunctionHeaders } from './utils';
import type { CrawlProgress } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CRAWL_BATCH = 5;

interface Props {
  onComplete: () => void;
}

export function CrawlPanel({ onComplete }: Props) {
  const [batchSize, setBatchSize] = useState(100);
  const [delayMs, setDelayMs] = useState(1000);
  const [progress, setProgress] = useState<CrawlProgress>({
    running: false, current: 0, total: 0, currentName: '', done: 0, failed: 0, batchIds: [],
  });
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef(false);

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-199), msg]);
  }

  async function fetchNextBatch(limit: number, chainsOnly = false) {
    let query = supabase
      .from('listings')
      .select('id, name, website, parent_chain')
      .not('website', 'is', null)
      .in('verification_status', ['unverified'])
      .order('created_at', { ascending: true })
      .limit(limit);

    if (chainsOnly) {
      query = query.not('parent_chain', 'is', null);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as Array<{ id: string; name: string; website: string | null; parent_chain: string | null }>;
  }

  async function fetchChainRepresentatives(limit: number) {
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
        if (reps.length >= limit) break;
      }
    }
    return reps;
  }

  async function startCrawl(listings: Array<{ id: string; name: string }>) {
    abortRef.current = false;
    const total = listings.length;
    setProgress({ running: true, current: 0, total, currentName: '', done: 0, failed: 0, batchIds: listings.map(l => l.id) });
    setLog([]);

    let done = 0;
    let failed = 0;

    for (let i = 0; i < listings.length; i += CRAWL_BATCH) {
      if (abortRef.current) { addLog('Cancelled.'); break; }

      const chunk = listings.slice(i, i + CRAWL_BATCH);
      const chunkIds = chunk.map(l => l.id);
      const chunkNames = chunk.map(l => l.name).join(', ');

      setProgress(p => ({ ...p, current: i + 1, currentName: chunkNames }));
      addLog(`Crawling batch ${Math.floor(i / CRAWL_BATCH) + 1}: ${chunkNames}`);

      try {
        const res = await fetch(edgeFunctionUrl('bulk-crawl'), {
          method: 'POST',
          headers: edgeFunctionHeaders(),
          body: JSON.stringify({ listingIds: chunkIds, delayMs }),
        });

        const json = await res.json();
        if (json.results) {
          for (const r of json.results) {
            if (r.status === 'crawled') {
              done++;
              addLog(`  OK: ${r.name} (${r.photos_found} photos)`);
            } else {
              failed++;
              addLog(`  FAIL: ${r.name} — ${r.error || r.status}`);
            }
          }
        }
      } catch (err) {
        failed += chunk.length;
        addLog(`  ERROR in batch: ${err instanceof Error ? err.message : String(err)}`);
      }

      setProgress(p => ({ ...p, done, failed }));
    }

    setProgress(p => ({ ...p, running: false }));
    addLog(`Done. ${done} crawled, ${failed} failed.`);
    onComplete();
  }

  async function handleStartCrawl() {
    const listings = await fetchNextBatch(batchSize);
    if (listings.length === 0) { addLog('No unverified listings with websites found.'); return; }
    await startCrawl(listings);
  }

  async function handleCrawlChains() {
    const reps = await fetchChainRepresentatives(200);
    if (reps.length === 0) { addLog('No unverified chain listings found.'); return; }
    addLog(`Found ${reps.length} unique chains. Crawling one rep each...`);
    await startCrawl(reps);
  }

  const pct = progress.total > 0 ? Math.round(((progress.current) / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
          <Globe className="w-4 h-4" /> Step 1: Firecrawl Snapshots
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Batch Size</label>
            <input
              type="number"
              min={1}
              max={500}
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={progress.running}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Delay Between Calls (ms)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))}
              className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={progress.running}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCrawlChains}
              disabled={progress.running}
              variant="outline"
              size="sm"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Crawl Chains First
            </Button>
            <Button
              onClick={handleStartCrawl}
              disabled={progress.running}
              size="sm"
              className="bg-[#0F2744] hover:bg-[#1a3a6b] text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" /> Start Crawling
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
                {progress.current}/{progress.total} &nbsp;·&nbsp; {progress.done} OK &nbsp;·&nbsp; {progress.failed} failed
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
