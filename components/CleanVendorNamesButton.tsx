'use client';

import { useState, useRef } from 'react';
import { Wand2, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, XCircle } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface NameChange {
  id: number;
  old_name: string;
  new_name: string;
  changed: boolean;
}

interface Progress {
  processed: number;
  total: number;
  changed: number;
  batch: number;
  total_batches: number;
  recentChanges: NameChange[];
}

interface Props {
  onComplete: () => void;
}

export function CleanVendorNamesButton({ onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const allChangesRef = useRef<NameChange[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    setRunning(true);
    setDone(false);
    setError(null);
    setProgress(null);
    setShowChanges(false);
    allChangesRef.current = [];

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/clean-vendor-names`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1];
          let payload: any;
          try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

          if (event === 'progress') {
            const newChanges: NameChange[] = (payload.updates ?? []).filter((u: NameChange) => u.changed);
            allChangesRef.current = [...allChangesRef.current, ...newChanges].slice(-200);
            setProgress({
              processed: payload.processed,
              total: payload.total,
              changed: payload.changed,
              batch: payload.batch,
              total_batches: payload.total_batches,
              recentChanges: allChangesRef.current,
            });
          } else if (event === 'done') {
            setProgress(prev => prev
              ? { ...prev, processed: payload.total, changed: payload.changed }
              : null
            );
            setDone(true);
            onComplete();
          } else if (event === 'batch_error') {
            console.warn(`Batch ${payload.batch} error: ${payload.error}`);
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setError(e?.message ?? 'Unknown error');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const pct = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Clean Up Vendor Names</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Uses Claude to infer the correct brand name from domain and listing names. Processes all vendors in batches of 20.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {running && (
              <button
                onClick={stop}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Stop
              </button>
            )}
            <button
              onClick={run}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2744] text-white text-sm font-medium rounded-lg hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Running...</>
              ) : (
                <><Wand2 className="w-4 h-4" />Clean Up Names</>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <p className="text-xs text-gray-400">
          Example: <span className="font-mono text-gray-500">find.shell.com</span> → <span className="font-mono text-gray-500">Shell</span>
          &nbsp;·&nbsp;
          <span className="font-mono text-gray-500">chevronwithtechron.com</span> → <span className="font-mono text-gray-500">Chevron</span>
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {(running || done) && progress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 font-medium">
                {done ? 'Complete' : `Batch ${progress.batch} of ${progress.total_batches}`}
              </span>
              <span className="text-gray-500 tabular-nums">
                {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} vendors
              </span>
            </div>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0F2744] rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-semibold tabular-nums">{progress.changed.toLocaleString()}</span>
                <span className="text-emerald-500">renamed</span>
              </div>
              <div className="text-gray-400 text-xs tabular-nums">{pct}%</div>
            </div>

            {progress.recentChanges.length > 0 && (
              <div>
                <button
                  onClick={() => setShowChanges(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showChanges ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showChanges ? 'Hide' : 'Show'} recent changes ({progress.recentChanges.length}{progress.recentChanges.length === 200 ? '+' : ''})
                </button>

                {showChanges && (
                  <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">ID</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Before</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {[...progress.recentChanges].reverse().map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-400 font-mono">{r.id}</td>
                            <td className="px-4 py-2 text-gray-400 line-through">{r.old_name}</td>
                            <td className="px-4 py-2 text-gray-900 font-medium">{r.new_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
