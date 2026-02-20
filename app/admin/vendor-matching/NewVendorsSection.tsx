'use client';

import { useState } from 'react';
import { PlusCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = rows.filter(r => {
    if (created.has(r.domain)) return false;
    if (chainsOnly && !r.isChain) return false;
    return r.domain.toLowerCase().includes(filter.toLowerCase());
  });

  async function createAndLink(row: NewVendorRow) {
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

      if (vErr || !vendor) return;

      const { error: lErr } = await supabase
        .from('listings')
        .update({ vendor_id: vendor.id })
        .in('id', row.listingIds);

      if (!lErr) {
        setCreated(prev => new Set(prev).add(row.domain));
        onCreated(row.domain, row.listingIds, vendor.id);
      }
    } finally {
      setCreating(prev => {
        const n = new Set(prev);
        n.delete(row.domain);
        return n;
      });
    }
  }

  async function createAll() {
    for (const row of filtered) {
      await createAndLink(row);
    }
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900">New Vendors to Create</h2>
          <p className="text-sm text-gray-500 mt-0.5">Domains not yet in the vendors table</p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={createAll}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Create & Link All ({filtered.length})
          </button>
        )}
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
            {filtered.map(row => {
              const busy = creating.has(row.domain);
              const isExp = expanded.has(row.domain);
              return (
                <tr key={row.domain} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-6 py-3 font-mono text-gray-700 whitespace-nowrap">{row.domain}</td>
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      value={row.editedName}
                      onChange={e => onNameChange(row.domain, e.target.value)}
                      className="w-full min-w-[160px] border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
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
                            <><ChevronUp className="w-3 h-3" /> less</>
                          ) : (
                            <><ChevronDown className="w-3 h-3" /> +{row.sampleNames.length - 2} more</>
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
                    <button
                      onClick={() => createAndLink(row)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      Create & Link
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
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
