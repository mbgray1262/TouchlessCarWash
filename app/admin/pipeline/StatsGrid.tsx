'use client';

import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, RefreshCcw, Globe } from 'lucide-react';
import type { PipelineStats } from './types';

interface Props {
  stats: PipelineStats;
}

export function StatsGrid({ stats }: Props) {
  const total = stats.total_with_websites > 0 ? stats.total_with_websites : stats.queue + stats.classified;
  const inconclusive = Math.max(0, stats.classified - stats.touchless - stats.not_touchless);
  const classifyPct = total > 0 ? Math.round((stats.classified / total) * 100) : 0;

  const cards = [
    {
      label: 'Touchless',
      value: stats.touchless,
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50 border-green-200',
    },
    {
      label: 'Not Touchless',
      value: stats.not_touchless,
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-50 border-red-200',
    },
    {
      label: 'Inconclusive',
      value: inconclusive,
      icon: HelpCircle,
      color: 'text-amber-500',
      bg: 'bg-amber-50 border-amber-200',
    },
    {
      label: 'Failed',
      value: stats.failed,
      icon: AlertTriangle,
      color: 'text-orange-500',
      bg: 'bg-orange-50 border-orange-200',
    },
    {
      label: 'Redirects',
      value: stats.redirects,
      icon: RefreshCcw,
      color: 'text-blue-500',
      bg: 'bg-blue-50 border-blue-200',
    },
    {
      label: 'Remaining',
      value: stats.queue,
      icon: Globe,
      color: 'text-gray-500',
      bg: 'bg-gray-50 border-gray-200',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Classifications Complete</p>
              <p className="text-2xl font-bold text-[#0F2744] mt-0.5">
                {stats.classified.toLocaleString()}
                <span className="text-sm font-normal text-gray-400 ml-1.5">/ {total.toLocaleString()} listings with websites</span>
              </p>
            </div>
            <p className="text-lg font-bold text-[#0F2744] tabular-nums">{classifyPct}%</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${classifyPct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span><span className="font-semibold text-green-600">{stats.touchless.toLocaleString()}</span> touchless</span>
            <span><span className="font-semibold text-red-500">{stats.not_touchless.toLocaleString()}</span> not touchless</span>
            {inconclusive > 0 && <span><span className="font-semibold text-amber-500">{inconclusive.toLocaleString()}</span> inconclusive</span>}
            <span className="ml-auto"><span className="font-semibold text-gray-600">{stats.queue.toLocaleString()}</span> still to process</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`border rounded-xl p-4 ${bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-xs font-medium text-gray-600">{label}</p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
