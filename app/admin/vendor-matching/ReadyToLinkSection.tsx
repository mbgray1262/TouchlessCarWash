'use client';

import { useState, useRef } from 'react';
import { CheckCircle, Loader2, Link2, AlertCircle, X } from 'lucide-react';
import { ReadyToLink } from './types';
import { supabase } from '@/lib/supabase';

interface Props {
  rows: ReadyToLink[];
  filter: string;
  onLinked: (listingIds: string[], vendorId: number, count: number) => void;
}

export function ReadyToLinkSection({ rows, filter, onLinked }: Props) {
  const [linking, setLinking] = useState<Set<string>>(new Set());
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef(false);

  const visible = rows.filter(r => r.domain.toLowerCase().includes(filter.toLowerCase()));
  const filteredForAction = visible.filter(r => !linked.has(r.domain));

  function addError(domain: string, msg: string) {
    setErrors(prev => { const n = new Map(prev); n.set(domain, msg); return n; });
  }

  function clearError(domain: string) {
    setErrors(prev => { const n = new Map(prev); n.delete(domain); return n; });
  }

  async function linkDomain(row: ReadyToLink): Promise<boolean> {
    clearError(row.domain);
    setLinking(prev => new Set(prev).add(row.domain));
    try {
      const CHUNK = 500;
      for (let i = 0; i < row.listingIds.length; i += CHUNK) {
        const chunk = row.listingIds.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('listings')
          .update({ vendor_id: row.vendorId })
          .in('id', chunk);

        if (error) {
          addError(row.domain, error.message);
          return false;
        }
      }

      setLinked(prev => new Set(prev).add(row.domain));
      onLinked(row.listingIds, row.vendorId, row.listingCount);
      return true;
    } catch (e: any) {
      addError(row.domain, e?.message ?? 'Unknown error');
      return false;
    } finally {
      setLinking(prev => { const n = new Set(prev); n.delete(row.domain); return n; });
    }
  }

  async function linkAll() {
    const snapshot = filteredForAction.slice();
    if (snapshot.length === 0) return;

    abortRef.current = false;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: snapshot.length });

    let done = 0;
    for (const row of snapshot) {
      if (abortRef.current) break;
      await linkDomain(row);
      done++;
      setBatchProgress({ done, total: snapshot.length });
    }

    setBatchRunning(false);
    setBatchProgress(null);
  }

  function stopBatch() {
    abortRef.current = true;
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ready to Link</h2>
          <p className="text-sm text-gray-500 mt-0.5">Domains that match existing vendors</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {batchProgress && (
            <div className="flex items-center gap-2">
              <div className="w-36 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                  style={{ width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{batchProgress.done}/{batchProgress.total}</span>
            </div>
          )}
          {batchRunning ? (
            <button
              onClick={stopBatch}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" />
              Stop
            </button>
          ) : (
            filteredForAction.length > 0 && (
              <button
                onClick={linkAll}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Link2 className="w-4 h-4" />
                Link All ({filteredForAction.length})
              </button>
            )
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-600">Domain</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Vendor Name</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Listings</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map(row => {
              const isDone = linked.has(row.domain);
              const busy = linking.has(row.domain);
              const err = errors.get(row.domain);
              return (
                <tr
                  key={row.domain}
                  className={`transition-colors ${isDone ? 'opacity-40 bg-emerald-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-6 py-3 font-mono text-gray-700">{row.domain}</td>
                  <td className="px-6 py-3 text-gray-900 font-medium">
                    {row.vendorName}
                    {err && (
                      <div className="flex items-start gap-1 mt-1 text-xs text-red-600 font-normal">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">{row.listingCount}</td>
                  <td className="px-6 py-3 text-right">
                    {isDone ? (
                      <span className="text-xs text-emerald-600 font-medium">Done</span>
                    ) : (
                      <button
                        onClick={() => linkDomain(row)}
                        disabled={busy || batchRunning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Link
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm">
                  No results match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
