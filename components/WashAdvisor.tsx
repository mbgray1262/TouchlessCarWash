'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RotateCcw, CheckCircle2, ArrowRight, Droplet } from 'lucide-react';
import { ADVISOR_QUESTIONS, recommend, type AdvisorOption, type AdvisorResult } from '@/lib/advisor';

export default function WashAdvisor() {
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<(AdvisorOption | null)[]>(() => ADVISOR_QUESTIONS.map(() => null));
  const total = ADVISOR_QUESTIONS.length;
  const done = step >= total;
  const result: AdvisorResult | null = done ? recommend(chosen.filter(Boolean) as AdvisorOption[]) : null;

  function pick(opt: AdvisorOption) {
    setChosen((prev) => { const next = [...prev]; next[step] = opt; return next; });
    setStep((s) => s + 1);
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }
  function restart() { setChosen(ADVISOR_QUESTIONS.map(() => null)); setStep(0); }

  if (result) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-[#22C55E] text-sm font-semibold mb-2">
          <CheckCircle2 className="w-4.5 h-4.5" /> Your recommendation
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F2744]">{result.label}</h2>
        <p className="mt-2 text-gray-600 text-lg">{result.tagline}</p>

        <ul className="mt-5 space-y-2.5">
          {result.why.map((w, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] text-gray-700">
              <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0 mt-0.5" /><span>{w}</span>
            </li>
          ))}
        </ul>

        <Link
          href={result.href}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#22C55E] hover:bg-[#1ba34d] text-white font-semibold px-6 py-3.5 transition-colors"
        >
          {result.ctaLabel} <ArrowRight className="w-4.5 h-4.5" />
        </Link>

        <div className="mt-6 pt-5 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <button onClick={restart} className="inline-flex items-center gap-1.5 font-medium text-[#0F2744] hover:text-[#22C55E]">
            <RotateCcw className="w-4 h-4" /> Start over
          </button>
          <Link href="/blog/car-wash-types-compared" className="text-[#22C55E] hover:underline font-medium">
            Not sure? Read the full comparison →
          </Link>
        </div>
      </div>
    );
  }

  const q = ADVISOR_QUESTIONS[step];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
      {/* progress */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Question {step + 1} of {total}</span>
        {step > 0 && (
          <button onClick={back} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#0F2744]">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-6">
        <div className="h-full bg-[#22C55E] transition-all" style={{ width: `${(step / total) * 100}%` }} />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-[#0F2744] flex items-start gap-2.5 mb-5">
        <Droplet className="w-6 h-6 text-[#22C55E] shrink-0 mt-0.5" /> {q.question}
      </h2>

      <div className="grid gap-3">
        {q.options.map((opt) => {
          const selected = chosen[step]?.label === opt.label;
          return (
            <button
              key={opt.label}
              onClick={() => pick(opt)}
              className={`text-left rounded-xl border-2 px-5 py-4 text-[15px] font-medium transition-all ${
                selected ? 'border-[#22C55E] bg-[#22C55E]/5 text-[#0F2744]' : 'border-gray-200 text-[#0F2744] hover:border-[#22C55E] hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
