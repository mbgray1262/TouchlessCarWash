'use client';

/**
 * Hero promo for the Touchless Satisfaction Score — the flagship "why us" hook.
 * Bigger and more visual than the old one-line pill: a glassy card with an
 * animated circular gauge (same arc design as the real listing gauge) so the
 * feature lands with visual impact on desktop. The gauge shows an EXAMPLE score
 * and is clearly labelled as such — real per-listing scores live on each page.
 */

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { tssTier } from '@/lib/touchless-satisfaction';

const SAMPLE = 92; // illustrative "Excellent" score

export default function HeroScorePromo() {
  const tier = tssTier(SAMPLE);

  // Animate the arc up on mount.
  const R = 52;
  const C = 2 * Math.PI * R;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(SAMPLE), 250);
    return () => clearTimeout(t);
  }, []);
  const offset = C * (1 - drawn / 100);

  return (
    <a
      href="/touchless-satisfaction-score"
      className="group mt-6 flex items-center gap-5 sm:gap-6 bg-white/10 hover:bg-white/[0.14] border border-white/25 rounded-2xl p-4 sm:p-5 backdrop-blur-sm transition-colors max-w-xl"
    >
      {/* animated gauge */}
      <div className="relative w-[104px] h-[104px] sm:w-[124px] sm:h-[124px] shrink-0">
        <svg viewBox="0 0 128 128" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={tier.arc}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-[34px] sm:text-[40px] font-extrabold tracking-tight text-white">{SAMPLE}</span>
          <span className="text-[10px] font-bold text-white/55 mt-0.5">/ 100</span>
        </div>
      </div>

      {/* copy */}
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
          <Gauge className="w-3.5 h-3.5" /> New
        </span>
        <div className="text-lg sm:text-xl font-bold text-white mt-1 leading-snug">
          Touchless Satisfaction Score
        </div>
        <p className="text-sm text-white/80 mt-1 leading-snug">
          Every wash rated <b className="text-white">0–100</b> on its touchless experience, from thousands of real customer reviews.
        </p>
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
          <span className="text-[13px] font-semibold text-emerald-300 group-hover:underline">
            See how it works ›
          </span>
          <span className="text-[11px] text-white/45">Example shown — each wash has its own score</span>
        </span>
      </div>
    </a>
  );
}
