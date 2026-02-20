'use client';

import { useState, useRef } from 'react';
import { PlusCircle, Loader2, ChevronDown, ChevronUp, AlertCircle, X } from 'lucide-react';
import { NewVendorRow } from './types';
import { supabase } from '@/lib/supabase';

interface Props {
  rows: NewVendorRow[];
  filter: string;
  chainsOnly: boolean;
  onCreated: (domain: string, listingIds: string[], vendorId: number) => void;
  onNameChange: (domain: string, name: string) => void;
}

export function NewVendorsSection({ rows, filter, chainsOnly, onCreated, onNameChange }: Props) {
  const [creating, setCreating] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef(false);

  const visible = rows.filter(r => {
    if (chainsOnly && !r.isChain) return false;
    return r.domain.toLowerCase().includes(filter.toLowerCase());
  });

  const filteredForAction = visible.filter(r => !created.has(r.domain));

  function addError(domain: string, msg: string) {
    setErrors(prev => {
      const n = new Map(prev);
      n.set(domain, msg);
      return n;
    });
  }

  function clearError(domain: string) {
    setErrors(prev => {
      const n = new Map(prev);
      n.delete(domain);
      return n;
    });
  }

  async function createAndLink(row: NewVendorRow): Promise<boolean> {
    clearError(row.domain);
    setCreating(prev => new Set(prev).add(row.domain));
    try {
      const { data: vendor, error: vErr } = await supabase
        .from('vendors')
        .insert({
          canonical_name: row.editedName,
          domain: row.domain,
          is_chain: row.isChain,
        } as any)
        .select('id')
        .single();

      if (vErr || !vendor) {
        addError(row.domain, vErr?.message ?? 'Failed to create vendor');
        return false;
      }

      const CHUNK = 500;
      for (let i = 0; i < row.listingIds.length; i += CHUNK) {
        const chunk = row.listingIds.slice(i, i + CHUNK);
        const { error: lErr } = await supabase
          .from('listings')
          .update({ vendor_id: vendor.id })
          .in('id', chunk);

        if (lErr) {
          addError(row.domain, lErr.message);
          return false;
        }
      }

      setCreated(prev => new Set(prev).add(row.domain));
      onCreated(row.domain, row.listingIds, vendor.id);
      return true;
    } catch (e: any) {
      addError(row.domain, e?.message ?? 'Unknown error');
      return false;
    } finally {
      setCreating(prev => {
        const n = new Set(prev);
        n.delete(row.domain);
        return n;
      });
    }
  }

  async function createAll() {
    const snapshot = filteredForAction.slice();
    if (snapshot.length === 0) return;

    abortRef.current = false;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: snapshot.length });

    let done = 0;
    for (const row of snapshot) {
      if (abortRef.current) break;
      await createAndLink(row);
      done++;
      setBatchProgress({ done, total: snapshot.length });
    }

    setBatchRunning(false);
    setBatchProgress(null);
  }

  function stopBatch() {
    abortRef.current = true;
  }

  function toggleExpand(domain: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(domain)) n.delete(domain);
      else n.add(domain);
      return n;
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">New Vendors to Create</h2>
          <p className="text-sm text-gray-500 mt-0.5">Domains not yet in the vendors table</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {batchProgress && (
            <div className="flex items-center gap-2">
              <div className="w-36 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-200"
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
                onClick={createAll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Create & Link All ({filteredForAction.length})
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
              <th className="text-left px-6 py-3 font-medium text-gray-600">Sample Names</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Listings</th>
              <th className="text-center px-6 py-3 font-medium text-gray-600">Type</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map(row => {
              const isDone = created.has(row.domain);
              const busy = creating.has(row.domain);
              const err = errors.get(row.domain);
              const isExp = expanded.has(row.domain);
              return (
                <tr
                  key={row.domain}
                  className={`transition-colors align-top ${isDone ? 'opacity-40 bg-emerald-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-6 py-3 font-mono text-gray-700 whitespace-nowrap">{row.domain}</td>
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      value={row.editedName}
                      onChange={e => onNameChange(row.domain, e.target.value)}
                      disabled={isDone}
                      className="w-full min-w-[160px] border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                    />
                    {err && (
                      <div className="flex items-start gap-1 mt-1 text-xs text-red-600">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    <div>
                      {(isExp ? row.sampleNames : row.sampleNames.slice(0, 2)).map((n, i) => (
                        <div key={i} className="truncate max-w-[220px]">{n}</div>
                      ))}
                      {row.sampleNames.length > 2 && (
                        <button
                          onClick={() => toggleExpand(row.domain)}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                        >
                          {isExp ? (
                            <><ChevronUp className="w-3 h-3" />less</>
                          ) : (
                            <><ChevronDown className="w-3 h-3" />+{row.sampleNames.length - 2} more</>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 whitespace-nowrap">{row.listingCount}</td>
                  <td className="px-6 py-3 text-center">
                    {row.isChain ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Chain</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Standalone</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {isDone ? (
                      <span className="text-xs text-emerald-600 font-medium">Done</span>
                    ) : (
                      <button
                        onClick={() => createAndLink(row)}
                        disabled={busy || batchRunning}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                        Create & Link
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">
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
