'use client';

import { RefreshCw } from 'lucide-react';
import type { DashboardStats, ClassificationLabel } from './types';

interface Props {
  stats: DashboardStats;
  loading: boolean;
  onRefresh: () => void;
  onFilterReview: (filter: ClassificationLabel | 'all') => void;
}

interface ClickableStat {
  value: number;
  label: string;
  filter?: ClassificationLabel | 'all';
  dimColor: string;
  activeColor: string;
  tooltip: string;
}

export function PipelineStatusBar({ stats, loading, onRefresh, onFilterReview }: Props) {
  const items: ClickableStat[] = [
    {
      value: stats.total,
      label: 'total',
      dimColor: 'text-gray-500',
      activeColor: 'text-gray-800 font-semibold',
      tooltip: 'Total listings in the database',
    },
    {
      value: stats.unverified,
      label: 'unverified',
      dimColor: 'text-gray-500',
      activeColor: 'text-gray-700 font-semibold',
      tooltip: 'Listings not yet processed by any pipeline step',
    },
    {
      value: stats.approved,
      label: `approved (${stats.approved_pipeline} pipeline + ${stats.approved_legacy} legacy)`,
      filter: 'all',
      dimColor: 'text-green-600',
      activeColor: 'text-green-700 font-semibold',
      tooltip: `${stats.approved_pipeline} approved via this pipeline, ${stats.approved_legacy} pre-existing manual approvals`,
    },
    {
      value: stats.auto_classified,
      label: 'in review',
      filter: 'all',
      dimColor: 'text-amber-600',
      activeColor: 'text-amber-700 font-semibold',
      tooltip: 'Auto-classified listings awaiting human review. Click to jump to review list.',
    },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap shadow-sm">
      <div className="flex items-center gap-1.5 flex-wrap text-sm">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-300 select-none">·</span>}
            {item.filter !== undefined ? (
              <button
                onClick={() => onFilterReview(item.filter!)}
                className={`group relative inline-flex items-baseline gap-1 transition-colors hover:underline underline-offset-2 ${item.dimColor} hover:${item.activeColor}`}
                title={item.tooltip}
              >
                <span className="font-bold tabular-nums">{item.value.toLocaleString()}</span>
                <span className="text-xs">{item.label}</span>
              </button>
            ) : (
              <span
                className={`inline-flex items-baseline gap-1 cursor-default ${item.dimColor}`}
                title={item.tooltip}
              >
                <span className="font-bold tabular-nums">{item.value.toLocaleString()}</span>
                <span className="text-xs">{item.label}</span>
              </span>
            )}
          </span>
        ))}
      </div>

      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-gray-400 hover:text-[#0F2744] transition-colors disabled:opacity-40 shrink-0"
        title="Refresh stats"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
