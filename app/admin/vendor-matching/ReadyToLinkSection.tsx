'use client';

import { useState } from 'react';
import { CheckCircle, Loader2, Link2 } from 'lucide-react';
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

  const filtered = rows.filter(
    r => !linked.has(r.domain) && r.domain.toLowerCase().includes(filter.toLowerCase())
  );

  async function linkDomain(row: ReadyToLink) {
    setLinking(prev => new Set(prev).add(row.domain));
    try {
      const { error } = await supabase
        .from('listings')
        .update({ vendor_id: row.vendorId })
        .in('id', row.listingIds);

      if (!error) {
        await supabase
          .from('vendors')
          .update({ listing_count: row.listingCount } as any)
          .eq('id', row.vendorId);

        setLinked(prev => new Set(prev).add(row.domain));
        onLinked(row.listingIds, row.vendorId, row.listingCount);
      }
    } finally {
      setLinking(prev => {
        const n = new Set(prev);
        n.delete(row.domain);
        return n;
      });
    }
  }

  async function linkAll() {
    for (const row of filtered) {
      await linkDomain(row);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ready to Link</h2>
          <p className="text-sm text-gray-500 mt-0.5">Domains that match existing vendors</p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={linkAll}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Link2 className="w-4 h-4" />
            Link All ({filtered.length})
          </button>
        )}
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
            {filtered.map(row => {
              const busy = linking.has(row.domain);
              return (
                <tr key={row.domain} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-mono text-gray-700">{row.domain}</td>
                  <td className="px-6 py-3 text-gray-900 font-medium">{row.vendorName}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{row.listingCount}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => linkDomain(row)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Link
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
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
