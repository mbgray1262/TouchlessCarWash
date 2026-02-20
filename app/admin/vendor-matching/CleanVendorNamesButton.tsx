'use client';

import { useState } from 'react';
import { Wand2, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface CleanResult {
  id: number;
  old_name: string;
  new_name: string;
  changed: boolean;
}

interface CleanSummary {
  total: number;
  changed: number;
  results: CleanResult[];
}

interface Props {
  onComplete: () => void;
}

export function CleanVendorNamesButton({ onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<CleanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setSummary(null);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/clean-vendor-names`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      setSummary(data);
      onComplete();
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  const changed = summary?.results.filter(r => r.changed) ?? [];

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
          <button
            onClick={run}
            disabled={running}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-[#0F2744] text-white text-sm font-medium rounded-lg hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Cleaning...</>
            ) : (
              <><Wand2 className="w-4 h-4" />Clean Up Names</>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <p className="text-xs text-gray-400">
          Example: <span className="font-mono text-gray-500">find.shell.com</span> → <span className="font-mono text-gray-500">Shell</span> &nbsp;·&nbsp; <span className="font-mono text-gray-500">chevronwithtechron.com</span> → <span className="font-mono text-gray-500">Chevron</span>
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {summary.changed} of {summary.total} vendors renamed
                  </p>
                  <p className="text-xs text-emerald-600">vendors table updated</p>
                </div>
              </div>
            </div>

            {changed.length > 0 && (
              <div>
                <button
                  onClick={() => setShowDetails(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showDetails ? 'Hide' : 'Show'} changes ({changed.length})
                </button>

                {showDetails && (
                  <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2 font-medium text-gray-500">ID</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Before</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {changed.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-400 font-mono">{r.id}</td>
                            <td className="px-4 py-2 text-gray-500 line-through">{r.old_name}</td>
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
