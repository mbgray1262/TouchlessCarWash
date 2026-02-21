'use client';

import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, RefreshCcw, Image } from 'lucide-react';
import type { PipelineRun } from './types';

interface Props {
  runs: PipelineRun[];
}

function ClassificationBadge({ status, isTouchless }: { status: string; isTouchless: boolean | null }) {
  if (status === 'redirect') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
      <RefreshCcw className="w-3 h-3" /> Redirect
    </span>
  );
  if (status === 'failed' || status === 'timeout') return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
      <AlertTriangle className="w-3 h-3" /> {status === 'timeout' ? 'Timeout' : 'Failed'}
    </span>
  );
  if (status === 'no_content') return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      No Content
    </span>
  );
  if (isTouchless === true) return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Touchless
    </span>
  );
  if (isTouchless === false) return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Not Touchless
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <HelpCircle className="w-3 h-3" /> Inconclusive
    </span>
  );
}

export function RecentRunsTable({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No classifications yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Name</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Website</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Result</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Evidence</th>
            <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs">Photos</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Processed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {runs.map(run => (
            <tr key={run.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-2.5 px-3 font-medium text-[#0F2744] max-w-[160px] truncate">
                {run.listing?.name ?? '—'}
              </td>
              <td className="py-2.5 px-3 max-w-[160px] truncate">
                {run.listing?.website ? (
                  <a
                    href={run.listing.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline font-mono"
                  >
                    {run.listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                ) : '—'}
              </td>
              <td className="py-2.5 px-3">
                <ClassificationBadge status={run.crawl_status} isTouchless={run.is_touchless} />
              </td>
              <td className="py-2.5 px-3 text-xs text-gray-500 max-w-[200px] truncate">
                {run.touchless_evidence ?? '—'}
              </td>
              <td className="py-2.5 px-3 text-right">
                {run.images_found > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Image className="w-3 h-3" /> {run.images_found}
                  </span>
                ) : <span className="text-xs text-gray-300">0</span>}
              </td>
              <td className="py-2.5 px-3 text-xs text-gray-400">
                {new Date(run.processed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
