'use client';

import { RefreshCw } from 'lucide-react';
import type { DashboardStats } from './types';

interface Props {
  stats: DashboardStats;
  onRefresh: () => void;
  loading: boolean;
}

function Stat({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export function DashboardStatsPanel({ stats, onRefresh, loading }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Pipeline Overview</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-[#0F2744] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Total" value={stats.total} color="bg-gray-50 border-gray-200 text-gray-800" />
        <Stat label="Unverified" value={stats.unverified} sub="no snapshot" color="bg-gray-50 border-gray-200 text-gray-700" />
        <Stat label="Crawled" value={stats.awaiting_classification} sub="needs classify" color="bg-teal-50 border-teal-200 text-teal-800" />
        <Stat label="Auto-classified" value={stats.auto_classified} sub="needs review" color="bg-blue-50 border-blue-200 text-blue-800" />
        <Stat label="Approved" value={stats.approved} color="bg-emerald-50 border-emerald-200 text-emerald-800" />
        <Stat label="Chains" value={stats.chains} color="bg-orange-50 border-orange-200 text-orange-800" />
        <Stat label="Standalone" value={stats.standalone} color="bg-slate-50 border-slate-200 text-slate-700" />
      </div>
    </div>
  );
}
