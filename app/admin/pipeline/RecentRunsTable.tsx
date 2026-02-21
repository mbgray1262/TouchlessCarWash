'use client';

import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, WifiOff } from 'lucide-react';
import type { RecentListing } from './types';

interface Props {
  listings: RecentListing[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total: number;
}

function ResultBadge({ listing }: { listing: RecentListing }) {
  const { is_touchless, crawl_status } = listing;

  if (crawl_status === 'failed') return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      <WifiOff className="w-3 h-3" /> Fetch Failed
    </span>
  );
  if (crawl_status === 'classify_failed') return (
    <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Classify Failed
    </span>
  );
  if (crawl_status === 'unknown' || (is_touchless === null && crawl_status)) return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <HelpCircle className="w-3 h-3" /> Unknown
    </span>
  );
  if (is_touchless === true) return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Touchless
    </span>
  );
  if (is_touchless === false) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Not Touchless
    </span>
  );
  return <span className="text-xs text-gray-300">—</span>;
}

export function RecentRunsTable({ listings, page, totalPages, onPageChange, total }: Props) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No classifications yet. Start classification to see results here.
      </div>
    );
  }

  const from = page * 50 + 1;
  const to = Math.min((page + 1) * 50, total);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Name</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs hidden sm:table-cell">Location</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Result</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs hidden md:table-cell">Evidence</th>
              <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs hidden lg:table-cell">Classified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {listings.map(listing => (
              <tr key={listing.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="py-2.5 px-3 max-w-[180px]">
                  <div className="font-medium text-[#0F2744] truncate">{listing.name}</div>
                  {listing.website && (
                    <a
                      href={listing.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline font-mono truncate block max-w-[160px]"
                    >
                      {listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-500 hidden sm:table-cell whitespace-nowrap">
                  {[listing.city, listing.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="py-2.5 px-3">
                  <ResultBadge listing={listing} />
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-500 max-w-[240px] truncate hidden md:table-cell">
                  {listing.touchless_evidence ?? '—'}
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-400 whitespace-nowrap hidden lg:table-cell">
                  {listing.last_crawled_at
                    ? new Date(listing.last_crawled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500 px-1">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
