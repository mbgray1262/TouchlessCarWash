'use client';

/**
 * Touchless Satisfaction Score gauge card (listing detail centerpiece).
 * Reuses the locked mockup design: animated circular gauge + tier label +
 * "based on N reviews of the touchless wash" + an evidence drawer that splits
 * the touchless reviews into positive/critical and lists them. The number is
 * public; tier wording is positive-leaning. Reviews about other bays are already
 * excluded upstream (touchless_about != 'other_service').
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ThumbsUp, AlertTriangle, Gauge as GaugeIcon } from 'lucide-react';
import { tssTier } from '@/lib/touchless-satisfaction';

export interface TssSnippet {
  id: string;
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  reviewerName: string | null;
  rating: number | null;
  date: string | null;
}

/**
 * Highlight touchless/cleanliness phrases in a snippet. Negation-aware: a
 * negated negative ("no streaks", "didn't scratch") or a positive descriptor
 * ("spotless", "touchless", "came out clean") is matched FIRST and shown green;
 * a bare negative word ("dirty", "streaks", "scratched") falls through to red.
 */
function highlightTouchless(text: string): ReactNode[] {
  const re = /(\b(?:no|not|never|without|zero|didn'?t|doesn'?t|won'?t|wasn'?t|hasn'?t|haven'?t)\b[\w\s,'-]{0,15}?\b(?:scratch\w*|streak\w*|spot\w*|dirt\w*|damage\w*|residue|mark\w*|swirl\w*|miss\w*|smear\w*)|\b(?:spotless|sparkl\w*|shin(?:e|y|ing)|gleaming|immaculate|pristine|flawless|gentle|scratch[\s-]?free|spot[\s-]?free|streak[\s-]?free|touch[\s-]?free|touchless|brushless|clean\w*)\b|\b(?:came?|comes?|come)\s+out\s+(?:so\s+|really\s+|super\s+)?(?:clean\w*|great|perfect|spotless|amazing|nice|shiny|new))|(\b(?:dirty|filthy|streak\w*|streaky|smear\w*|grimy|grime|scratch\w*|swirl\w*|damage\w*|broke\w*|broken|residue|missed)\b)/gi;
  const nodes: ReactNode[] = [];
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const green = m[1] !== undefined;
    nodes.push(
      <mark key={key++} className={green ? 'bg-emerald-100 text-emerald-800 rounded px-0.5' : 'bg-red-100 text-red-800 rounded px-0.5'}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function TouchlessSatisfactionGauge({
  score,
  pos,
  neg,
  mentions,
  snippets,
  methodologyHref = '/touchless-satisfaction-score',
}: {
  score: number;
  pos: number;
  neg: number;
  mentions: number;
  snippets: TssSnippet[];
  methodologyHref?: string;
}) {
  const tier = tssTier(score);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<null | 'positive' | 'negative'>(null);
  const [expanded, setExpanded] = useState(false);
  const INITIAL = 6;

  // Animate the arc up on mount.
  const R = 50;
  const C = 2 * Math.PI * R; // ~314.16
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(score), 180);
    return () => clearTimeout(t);
  }, [score]);
  const offset = C * (1 - drawn / 100);

  const clear = pos + neg;
  const pctPos = clear > 0 ? Math.round((pos / clear) * 100) : 0;

  const rows = useMemo(() => {
    let r = snippets.filter((s) => s.sentiment === 'positive' || s.sentiment === 'negative');
    if (filter) r = r.filter((s) => s.sentiment === filter);
    // most helpful-ish: higher star + longer text first
    return [...r].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [snippets, filter]);

  return (
    <section className="bg-white rounded-2xl border-2 p-5 mb-4" style={{ borderColor: tier.arc + '55' }}>
      <div className="flex gap-5 items-center">
        {/* gauge */}
        <div className="relative w-[116px] h-[116px] shrink-0">
          <svg width="116" height="116" viewBox="0 0 116 116" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="58" cy="58" r={R} fill="none" stroke="#e2e8f0" strokeWidth="12" />
            <circle
              cx="58"
              cy="58"
              r={R}
              fill="none"
              stroke={tier.arc}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1.1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[32px] font-extrabold tracking-tight text-[#0F2744] leading-none">{score}</span>
            <span className="text-[10px] font-bold text-gray-400 mt-0.5">/ 100</span>
          </div>
        </div>

        {/* label + sub */}
        <div className="flex-1">
          <div className="text-[13px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <GaugeIcon className="w-4 h-4" /> Touchless Satisfaction Score
          </div>
          <div className="text-[22px] font-extrabold mt-0.5" style={{ color: tier.color }}>
            {tier.label}
          </div>
          <div className="text-[13px] text-slate-600 mt-1">
            Based on <b className="text-[#0F2744]">{mentions}</b> customer {mentions === 1 ? 'review' : 'reviews'} of the
            touchless wash specifically.
          </div>
          <a href={methodologyHref} className="inline-block mt-1 text-[12px] text-blue-600 hover:underline">
            How is this calculated? ›
          </a>
        </div>
      </div>

      {clear > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-4 inline-flex items-center gap-2 bg-[#0F2744] hover:bg-[#1e3a5f] text-white rounded-[10px] px-4 py-2.5 text-[13.5px] font-bold transition-colors"
        >
          See what customers say about the touchless wash
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && clear > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex h-3 rounded-full overflow-hidden border border-gray-200">
            <div className="bg-[#22C55E]" style={{ width: `${pctPos}%` }} />
            <div className="bg-red-400" style={{ width: `${100 - pctPos}%` }} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
            <button
              onClick={() => { setFilter((f) => (f === 'positive' ? null : 'positive')); setExpanded(false); }}
              className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition border-emerald-300 bg-emerald-50 hover:bg-emerald-100 ${filter === 'positive' ? 'ring-2 ring-emerald-300' : ''}`}
            >
              <ThumbsUp className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-[11px] text-slate-600 leading-tight">
                <b className="block text-[14px] text-[#0F2744]">{pos} positive</b>tap to read
              </span>
            </button>
            <button
              onClick={() => { setFilter((f) => (f === 'negative' ? null : 'negative')); setExpanded(false); }}
              className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition border-red-300 bg-red-50 hover:bg-red-100 ${filter === 'negative' ? 'ring-2 ring-red-300' : ''}`}
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-[11px] text-slate-600 leading-tight">
                <b className="block text-[14px] text-[#0F2744]">{neg} concerns</b>tap to read
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-2.5 mt-3">
            {rows.length > 0 ? (
              rows.slice(0, expanded ? rows.length : INITIAL).map((s) => (
                <div key={s.id} className="border border-gray-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm shrink-0">
                      {(s.reviewerName || 'G').charAt(0).toUpperCase()}
                    </div>
                    <div className="text-[13px] font-bold text-[#0F2744]">{s.reviewerName || 'Google reviewer'}</div>
                    {s.rating != null && (
                      <span className="ml-auto text-[#f59e0b] text-xs">
                        {'★'.repeat(Math.round(s.rating))}{'☆'.repeat(Math.max(0, 5 - Math.round(s.rating)))}
                      </span>
                    )}
                  </div>
                  <p className="text-[13.5px] text-slate-800 mt-2 leading-relaxed">{highlightTouchless(s.text)}</p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${s.sentiment === 'negative' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {s.sentiment === 'negative' ? 'Critical' : 'Positive'}
                    </span>
                    {s.date && <span className="text-[11px] text-gray-400 ml-auto">{s.date}</span>}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[13px] text-gray-400 py-3 text-center">No matching reviews in this filter.</div>
            )}
          </div>
          {rows.length > INITIAL && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 w-full text-center text-[13px] font-bold text-[#0F2744] bg-slate-50 hover:bg-slate-100 border border-gray-200 rounded-xl py-2.5 transition-colors"
            >
              {expanded ? 'Show fewer reviews' : `Show all ${rows.length} reviews ›`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
