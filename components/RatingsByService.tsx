/**
 * Compact "Ratings by service" scorecard — shown on MULTI-SERVICE listings (2+ category
 * scores) in place of stacking several big circular gauges. Each service is one aligned row
 * (label · what it rates · slim tier bar · number + tier word), so the scores are scannable and
 * directly comparable without the visual weight of multiple donuts. Single-score listings never
 * render this — they keep their full gauge. Fed by getListingScores() (lib/listing-scores.ts).
 */
import { Gauge } from 'lucide-react';
import type { CategoryScore } from '@/lib/listing-scores';

export default function RatingsByService({ scores }: { scores: CategoryScore[] }) {
  if (scores.length < 2) return null;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
      <h2 className="text-[15px] font-extrabold text-[#0F2744] flex items-center gap-2 mb-1">
        <Gauge className="w-4.5 h-4.5 text-[#22C55E]" />
        Ratings by service
      </h2>
      <p className="text-[12px] text-slate-500 mb-3">
        This location offers several services — each is scored separately from its own customer reviews, on the same 0–100 scale.
      </p>
      <div className="divide-y divide-gray-100">
        {scores.map((s) => (
          <div key={s.key} className="flex items-center gap-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#0F2744]">{s.chipLabel}</div>
              <div className="text-[12px] text-slate-400">rates {s.measures}</div>
            </div>
            <div className="hidden sm:block w-28 h-[7px] rounded-full bg-gray-100 overflow-hidden shrink-0">
              <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: s.tier.arc }} />
            </div>
            <div className="w-[92px] flex items-baseline justify-end gap-1.5 shrink-0">
              <span className="text-[22px] font-extrabold leading-none" style={{ color: s.tier.color }}>{s.score}</span>
              <span className="text-[11px] font-bold" style={{ color: s.tier.color }}>{s.tier.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
