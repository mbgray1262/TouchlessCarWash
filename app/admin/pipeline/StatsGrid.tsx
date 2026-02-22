'use client';

import { CheckCircle2, XCircle, HelpCircle, AlertTriangle, WifiOff, Globe, Trash2, Clock, AlertCircle } from 'lucide-react';
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

  const accountedFor =
    stats.touchless +
    stats.not_touchless +
    stats.no_website +
    stats.fetch_failed +
    stats.classify_failed +
    stats.unknown +
    stats.never_attempted +
    stats.null_result +
    stats.other_unclassified;

  const unaccounted = total - accountedFor;

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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">All {total.toLocaleString()} Listings Breakdown</p>
        </div>
        <div className="divide-y divide-gray-50">
          <Row
            icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
            label="Touchless"
            value={stats.touchless}
            total={total}
            colorClass="text-green-600"
            barColor="bg-green-500"
          />
          <Row
            icon={<XCircle className="w-4 h-4 text-red-400" />}
            label="Not Touchless"
            value={stats.not_touchless}
            total={total}
            colorClass="text-red-500"
            barColor="bg-red-400"
          />
          <Row
            icon={<Globe className="w-4 h-4 text-gray-400" />}
            label="No Website"
            value={stats.no_website}
            total={total}
            colorClass="text-gray-500"
            barColor="bg-gray-300"
            sublabel="Skipped — no URL to crawl"
          />
          <Row
            icon={<WifiOff className="w-4 h-4 text-orange-400" />}
            label="Fetch Failed"
            value={stats.fetch_failed}
            total={total}
            colorClass="text-orange-500"
            barColor="bg-orange-400"
            sublabel="Site was unreachable"
            action={
              stats.fetch_failed > 0 && onDismissFetchFailed ? (
                <button
                  onClick={onDismissFetchFailed}
                  disabled={dismissingFetchFailed}
                  title="Mark all fetch-failed as no-website to exclude from future runs"
                  className="text-orange-400 hover:text-orange-600 disabled:opacity-40 transition-colors"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${dismissingFetchFailed ? 'animate-pulse' : ''}`} />
                </button>
              ) : undefined
            }
          />
          <Row
            icon={<HelpCircle className="w-4 h-4 text-amber-400" />}
            label="Unknown"
            value={stats.unknown}
            total={total}
            colorClass="text-amber-500"
            barColor="bg-amber-400"
            sublabel="Crawled but AI couldn't determine"
          />
          {stats.null_result > 0 && (
            <Row
              icon={<AlertCircle className="w-4 h-4 text-rose-400" />}
              label="Classified — No Result Saved"
              value={stats.null_result}
              total={total}
              colorClass="text-rose-500"
              barColor="bg-rose-400"
              sublabel="crawl_status=classified but is_touchless is NULL"
            />
          )}
          <Row
            icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
            label="Classify Failed"
            value={stats.classify_failed}
            total={total}
            colorClass="text-rose-500"
            barColor="bg-rose-400"
            sublabel="Crawled but AI call failed"
          />
          <Row
            icon={<Clock className="w-4 h-4 text-teal-500" />}
            label="Never Attempted"
            value={stats.never_attempted}
            total={total}
            colorClass="text-teal-600"
            barColor="bg-teal-400"
            sublabel="Has website, hasn't been crawled yet"
          />
          {stats.other_unclassified > 0 && (
            <Row
              icon={<AlertCircle className="w-4 h-4 text-gray-400" />}
              label="Other Unclassified"
              value={stats.other_unclassified}
              total={total}
              colorClass="text-gray-500"
              barColor="bg-gray-400"
              sublabel="Has website but unexpected crawl_status"
            />
          )}
          {unaccounted !== 0 && (
            <Row
              icon={<AlertCircle className="w-4 h-4 text-gray-300" />}
              label="Unaccounted"
              value={unaccounted}
              total={total}
              colorClass="text-gray-400"
              barColor="bg-gray-200"
              sublabel="Should be 0 — contact support if not"
            />
          )}
        </div>
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">Sum of all categories</span>
          <span className="text-xs font-semibold text-[#0F2744] tabular-nums">{accountedFor.toLocaleString()} / {total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  total,
  colorClass,
  barColor,
  sublabel,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  colorClass: string;
  barColor: string;
  sublabel?: string;
  action?: React.ReactNode;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-700 truncate">{label}</span>
            {sublabel && <span className="text-xs text-gray-400 hidden sm:inline truncate">{sublabel}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-bold tabular-nums ${colorClass}`}>{value.toLocaleString()}</span>
            <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
            {action}
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
          <div
            className={`h-1 rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(pct, value > 0 ? 0.3 : 0)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
