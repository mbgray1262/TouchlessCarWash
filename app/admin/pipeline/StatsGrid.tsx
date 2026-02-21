'use client';

import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, WifiOff, Globe, Trash2 } from 'lucide-react';
import type { ClassifyStats } from './types';

interface Props {
  stats: ClassifyStats;
  onDismissFetchFailed?: () => void;
  dismissingFetchFailed?: boolean;
}

export function StatsGrid({ stats, onDismissFetchFailed, dismissingFetchFailed }: Props) {
  const classified = stats.touchless + stats.not_touchless;
  const total = stats.total;
  const classifyPct = total > 0 ? Math.round((classified / total) * 100) : 0;

  const cards = [
    { label: 'Touchless', value: stats.touchless, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
    { label: 'Not Touchless', value: stats.not_touchless, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
    { label: 'Unknown', value: stats.unknown, icon: HelpCircle, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
    { label: 'Fetch Failed', value: stats.fetch_failed, icon: WifiOff, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
    { label: 'Classify Failed', value: stats.classify_failed, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-50 border-rose-200' },
    { label: 'No Website', value: stats.unclassified_no_website, icon: Globe, color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Classifications Complete</p>
            <p className="text-2xl font-bold text-[#0F2744] mt-0.5">
              {classified.toLocaleString()}
              <span className="text-sm font-normal text-gray-400 ml-1.5">/ {total.toLocaleString()} total listings</span>
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
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
          <span><span className="font-semibold text-green-600">{stats.touchless.toLocaleString()}</span> touchless</span>
          <span><span className="font-semibold text-red-500">{stats.not_touchless.toLocaleString()}</span> not touchless</span>
          {stats.unknown > 0 && <span><span className="font-semibold text-amber-500">{stats.unknown.toLocaleString()}</span> unknown</span>}
          <span className="ml-auto"><span className="font-semibold text-gray-600">{stats.unclassified_with_website.toLocaleString()}</span> still to process</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`border rounded-xl p-4 ${bg} relative`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-xs font-medium text-gray-600">{label}</p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
            {label === 'Fetch Failed' && value > 0 && onDismissFetchFailed && (
              <button
                onClick={onDismissFetchFailed}
                disabled={dismissingFetchFailed}
                title="Mark all fetch-failed listings as no-website so they're excluded from future runs"
                className="absolute top-3 right-3 text-orange-400 hover:text-orange-600 disabled:opacity-40 transition-colors"
              >
                <Trash2 className={`w-3.5 h-3.5 ${dismissingFetchFailed ? 'animate-pulse' : ''}`} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
