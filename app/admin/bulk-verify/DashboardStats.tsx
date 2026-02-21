'use client';

import { RefreshCw, Info } from 'lucide-react';
import type { DashboardStats } from './types';

interface Props {
  stats: DashboardStats;
  onRefresh: () => void;
  loading: boolean;
}

function Stat({
  label,
  value,
  sub,
  color,
  tooltip,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  tooltip?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${color} relative group`}>
      {tooltip && (
        <>
          <div className="absolute top-2.5 right-2.5 text-current opacity-30 group-hover:opacity-60 transition-opacity">
            <Info className="w-3 h-3" />
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
            {tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        </>
      )}
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider col-span-full mt-2 first:mt-0">
      {children}
    </p>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SectionLabel>Database</SectionLabel>
        <Stat
          label="Total Listings"
          value={stats.total}
          color="bg-gray-50 border-gray-200 text-gray-800"
          tooltip="Total number of car wash listings in the database."
        />
        <Stat
          label="Unverified"
          value={stats.unverified}
          sub="not yet processed"
          color="bg-gray-50 border-gray-200 text-gray-700"
          tooltip="Listings that haven't been touched by any pipeline step yet."
        />
        <Stat
          label="Chains"
          value={stats.chains}
          sub="unique chain brands"
          color="bg-orange-50 border-orange-200 text-orange-800"
          tooltip="Number of distinct chain brands (e.g. 'Mister Car Wash') with at least one location."
        />
        <Stat
          label="Standalone"
          value={stats.standalone}
          sub="no chain affiliation"
          color="bg-slate-50 border-slate-200 text-slate-700"
          tooltip="Listings that don't belong to any chain."
        />

        <SectionLabel>Step 0 — Name Pre-Scan</SectionLabel>
        <Stat
          label="High Confidence"
          value={stats.name_match_high}
          sub="95% · name_match"
          color="bg-emerald-50 border-emerald-200 text-emerald-800"
          tooltip="Names containing 'touchless', 'brushless', 'laserwash', 'no touch', etc. Auto-approved at 95% confidence."
        />
        <Stat
          label="Needs Review"
          value={stats.name_match_likely}
          sub="70% · name_match_likely"
          color="bg-amber-50 border-amber-200 text-amber-800"
          tooltip="Names containing 'laser' — likely touchless but not certain. These appear in Step 3: Human Review."
        />

        <SectionLabel>Step 1–2 — Crawl & Classify</SectionLabel>
        <Stat
          label="Crawled"
          value={stats.awaiting_classification}
          sub="needs AI classify"
          color="bg-teal-50 border-teal-200 text-teal-800"
          tooltip="Listings whose website was crawled successfully, but haven't been classified by AI yet."
        />
        <Stat
          label="Auto-Classified"
          value={stats.auto_classified}
          sub="needs human review"
          color="bg-blue-50 border-blue-200 text-blue-800"
          tooltip="Listings classified by AI or name scan that are waiting for a human to approve or reject in Step 3."
        />

        <SectionLabel>Approved</SectionLabel>
        <Stat
          label="Pre-Pipeline"
          value={stats.approved_legacy}
          sub="manually set"
          color="bg-violet-50 border-violet-200 text-violet-800"
          tooltip="Listings marked 'approved' before this pipeline existed — imported manually. Some may not have is_touchless set."
        />
        <Stat
          label="Pipeline Approved"
          value={stats.approved_pipeline}
          sub="verified via pipeline"
          color="bg-green-50 border-green-200 text-green-800"
          tooltip="Listings that went through this pipeline and were approved by a human reviewer."
        />
      </div>
    </div>
  );
}
