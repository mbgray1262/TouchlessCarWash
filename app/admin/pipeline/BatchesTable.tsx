'use client';

import { CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PipelineBatch } from './types';

interface Props {
  batches: PipelineBatch[];
  onPoll: (jobId: string) => void;
  polling: string | null;
}

function StatusBadge({ status }: { status: PipelineBatch['status'] }) {
  if (status === 'completed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Completed
    </span>
  );
  if (status === 'running') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
      <Loader2 className="w-3 h-3 animate-spin" /> Running
    </span>
  );
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

export function BatchesTable({ batches, onPoll, polling }: Props) {
  if (batches.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No batches submitted yet. Click "Start Batch" to begin.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Chunk</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Job ID</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Status</th>
            <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs">URLs</th>
            <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs">Done</th>
            <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs">Credits</th>
            <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs">Started</th>
            <th className="py-2.5 px-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {batches.map(batch => (
            <tr key={batch.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-2.5 px-3 font-mono text-xs text-gray-500">#{batch.chunk_index + 1}</td>
              <td className="py-2.5 px-3 font-mono text-xs text-gray-400 max-w-[140px] truncate">
                {batch.firecrawl_job_id ?? '—'}
              </td>
              <td className="py-2.5 px-3">
                <StatusBadge status={batch.status} />
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{batch.total_urls.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{batch.completed_count.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-500">{batch.credits_used.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-xs text-gray-400">
                {new Date(batch.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2.5 px-3">
                {batch.status === 'running' && batch.firecrawl_job_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onPoll(batch.firecrawl_job_id!)}
                    disabled={polling === batch.firecrawl_job_id}
                  >
                    {polling === batch.firecrawl_job_id ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Polling…</>
                    ) : 'Poll Results'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
