'use client';

import Link from 'next/link';
import { CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, Tag, Clock, MapPin, MessageSquare, ArrowRight } from 'lucide-react';

export interface CompletenessStats {
  total: number;
  missing_description: number;
  missing_hero: number;
  missing_amenities: number;
  missing_hours: number;
  missing_maps_url: number;
  missing_reviews: number;
  incomplete: number;
}

export default function CompletenessCard({ stats }: { stats: CompletenessStats }) {
  // Hero is shown but flagged separately: it's fixed via the curated Hero Audit
  // tool, not the free enrichment run.
  const rows = [
    { key: 'missing_description', label: 'AI description', icon: FileText, value: stats.missing_description, autoFix: true },
    { key: 'missing_maps_url', label: 'Google Maps link', icon: MapPin, value: stats.missing_maps_url, autoFix: true },
    { key: 'missing_reviews', label: 'Review snippets', icon: MessageSquare, value: stats.missing_reviews, autoFix: true },
    { key: 'missing_amenities', label: 'Amenities', icon: Tag, value: stats.missing_amenities, autoFix: true },
    { key: 'missing_hours', label: 'Hours', icon: Clock, value: stats.missing_hours, autoFix: true },
    { key: 'missing_hero', label: 'No image shown', icon: ImageIcon, value: stats.missing_hero, autoFix: false },
  ];

  const allComplete = stats.incomplete === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 sm:col-span-2 lg:col-span-3">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${allComplete ? 'bg-green-50' : 'bg-amber-50'}`}>
            {allComplete ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F2744]">Listing Completeness</h2>
            <p className="text-sm text-gray-500">
              {allComplete
                ? 'Every touchless listing is fully complete.'
                : `${stats.incomplete.toLocaleString()} of ${stats.total.toLocaleString()} touchless listings are missing something`}
            </p>
          </div>
        </div>
        {!allComplete && (
          <Link
            href="/admin/completeness"
            className="inline-flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 bg-[#0F2744] hover:bg-[#1E3A8A] text-white transition-colors shrink-0"
          >
            Review &amp; fix listings <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map(({ key, label, icon: Icon, value, autoFix }) => (
          <div
            key={key}
            className={`rounded-lg border p-3 ${value === 0 ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50/40'}`}
          >
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
            <p className="text-xl font-bold text-[#0F2744]">
              {value.toLocaleString()}
              <span className="text-xs font-normal text-gray-400 ml-1">missing</span>
            </p>
            {!autoFix && value > 0 && (
              <p className="text-[11px] text-gray-400 mt-0.5">Use Hero Audit tool</p>
            )}
          </div>
        ))}
      </div>

      {!allComplete && (
        <p className="text-xs text-gray-400 mt-4">
          Click <span className="font-medium text-gray-500">Review &amp; fix listings</span> to see each listing and watch exactly what gets filled in.
        </p>
      )}
    </div>
  );
}
