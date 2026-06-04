'use client';

/**
 * Paint-Safe module (detail page). Option B/A design:
 *  - PUBLIC = "Paint-Safe Verified" badge (positive endorsement) — NO public 0-100 number.
 *  - Three states: verified | has_data_unverified | not_enough.
 *  - Unified evidence drawer (absorbs the old standalone snippet section): sentiment split,
 *    prominent dual filter buttons, theme chips (All/Paint/Touchless/Cleanliness), snippet cards.
 * The internal granular score lives on the listing (paint_score) for ranking only — not shown here.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ShieldCheck, ChevronDown, ThumbsUp, AlertTriangle } from 'lucide-react';

export type PaintTheme = 'paint' | 'touchless' | 'cleanliness' | 'other';

export interface PaintSnippet {
  id: string;
  theme: PaintTheme;
  sentiment: 'positive' | 'negative' | 'neutral';
  text: string;
  reviewerName: string | null;
  credentials: string | null;
  isLocalGuide: boolean;
  rating: number | null;
  date: string | null;
  recencyDays?: number | null; // for "most recent" sort; lower = newer
}

export interface PaintSafeModuleProps {
  state: 'verified' | 'has_data_unverified' | 'not_enough';
  reviewCount: number;
  paintPos: number;
  paintNeg: number;
  snippets: PaintSnippet[];
  methodologyHref?: string;
}

const NAVY = '#0F2744';

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  const full = Math.round(n);
  return (
    <span className="ml-auto text-[#f59e0b] text-xs tracking-tight" aria-label={`${n} stars`}>
      {'★'.repeat(full)}{'☆'.repeat(Math.max(0, 5 - full))}
    </span>
  );
}

/**
 * Highlight paint/touchless phrases in a snippet. Negation-aware: a negated or
 * positive phrase ("no scratches", "doesn't scratch", "gentle", "touchless") is
 * matched FIRST (green) and consumes the span, so a bare damage word only gets
 * the red highlight when it isn't already part of a positive/negated phrase.
 */
function highlightPaint(text: string): ReactNode[] {
  const re = /(\b(?:no|not|never|without|zero|didn'?t|doesn'?t|won'?t|wasn'?t|hasn'?t|haven'?t)\b[\w\s,'-]{0,18}?\b(?:scratch\w*|swirl\w*|damage\w*|mark\w*|harm\w*)|\b(?:gentle|scratch[\s-]?free|swirl[\s-]?free|flawless|pristine|spotless|immaculate|touch[\s-]?free|touchless|brushless)\b|\bno (?:brushes|scratches|swirls|damage|marks)\b|\bpaint (?:looks|is|stayed|came out|still)\w*\s+(?:great|perfect|amazing|fine|good|flawless|immaculate|pristine))|(\b(?:scratch\w*|swirl\w*|damage\w*|chip\w*|scuff\w*|ruin\w*|dent\w*|peel\w*)\b)/gi;
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

function SnippetCard({ s }: { s: PaintSnippet }) {
  const tagStyle =
    s.sentiment === 'negative'
      ? 'bg-red-50 text-red-700'
      : s.theme === 'touchless'
      ? 'bg-blue-50 text-blue-700'
      : s.theme === 'cleanliness'
      ? 'bg-violet-50 text-violet-700'
      : 'bg-emerald-50 text-emerald-700';
  const tagLabel =
    s.sentiment === 'negative'
      ? 'Paint concern'
      : s.theme === 'touchless'
      ? 'Touchless'
      : s.theme === 'cleanliness'
      ? 'Cleanliness'
      : 'Paint safety';
  return (
    <div className="border border-gray-200 rounded-xl p-3.5 animate-[fadeIn_.3s_ease]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm shrink-0">
          {(s.reviewerName || 'G').charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-[13px] font-bold text-[#0F2744]">{s.reviewerName || 'Google reviewer'}</div>
          {s.credentials && (
            <div className={`text-[11px] font-semibold ${s.isLocalGuide ? 'text-blue-500' : 'text-gray-400'}`}>
              {s.isLocalGuide ? '★ ' : ''}{s.credentials}
            </div>
          )}
        </div>
        <Stars n={s.rating} />
      </div>
      <p className="text-[13.5px] text-slate-800 mt-2 leading-relaxed">{highlightPaint(s.text)}</p>
      <div className="flex items-center gap-2 mt-2.5">
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${tagStyle}`}>{tagLabel}</span>
        {s.date && <span className="text-[11px] text-gray-400 ml-auto">{s.date}</span>}
      </div>
    </div>
  );
}

export default function PaintSafeModule({
  state,
  reviewCount,
  paintPos,
  paintNeg,
  snippets,
  methodologyHref = '/paint-safe',
}: PaintSafeModuleProps) {
  const [open, setOpen] = useState(state === 'has_data_unverified'); // open by default when there's no badge to click
  const [theme, setTheme] = useState<'all' | PaintTheme>('all');
  const [sent, setSent] = useState<null | 'positive' | 'negative'>(null);
  const [sort, setSort] = useState<'helpful' | 'recent'>('helpful');

  const clear = paintPos + paintNeg;
  const pctPos = clear > 0 ? Math.round((paintPos / clear) * 100) : 0;
  const pctNeg = clear > 0 ? 100 - pctPos : 0;

  const counts = useMemo(() => {
    const c = { all: snippets.length, paint: 0, touchless: 0, cleanliness: 0 } as Record<string, number>;
    for (const s of snippets) if (s.theme in c) c[s.theme]++;
    return c;
  }, [snippets]);

  const rows = useMemo(() => {
    let r = snippets.filter((s) => (theme === 'all' ? true : s.theme === theme));
    if (sent === 'positive') r = r.filter((s) => s.theme === 'paint' && s.sentiment === 'positive');
    if (sent === 'negative') r = r.filter((s) => s.theme === 'paint' && s.sentiment === 'negative');
    r = [...r].sort((a, b) =>
      sort === 'recent'
        ? (a.recencyDays ?? 9e9) - (b.recencyDays ?? 9e9)
        : (b.rating ?? 0) + (b.isLocalGuide ? 2 : 0) - ((a.rating ?? 0) + (a.isLocalGuide ? 2 : 0)),
    );
    return r.slice(0, 40);
  }, [snippets, theme, sent, sort]);

  // ----- STATE: not enough reviews -----
  if (state === 'not_enough') {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
        <div className="flex gap-3.5 items-center bg-slate-50 border border-dashed border-gray-200 rounded-xl p-4">
          <div className="w-12 h-12 rounded-xl bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[15px] font-extrabold text-slate-600">Paint-safety: not enough reviews yet</div>
            <div className="text-[12.5px] text-gray-400 mt-0.5">
              We verify paint safety from real customer reviews — this wash doesn&apos;t have enough paint mentions yet.
            </div>
          </div>
        </div>
      </section>
    );
  }

  const verified = state === 'verified';

  return (
    <section className={`bg-white rounded-2xl p-5 mb-4 ${verified ? 'border-2 border-emerald-200' : 'border border-gray-200'}`}>
      {/* ---- headline ---- */}
      {verified ? (
        <div className="flex gap-4 items-center bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-xl p-4">
          <div className="w-12 h-12 rounded-xl bg-[#22C55E] text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-300">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-extrabold text-emerald-700 flex items-center gap-1.5">Paint-Safe Verified ✓</div>
            <div className="text-[13px] text-slate-600 mt-0.5">
              <b className="text-[#0F2744]">{pctPos}% positive</b> on paint · {reviewCount.toLocaleString()} reviews · based on real customer feedback
            </div>
            <a href={methodologyHref} className="inline-block mt-1.5 text-[12px] text-blue-600 hover:underline">How we verify this ›</a>
          </div>
        </div>
      ) : (
        <h2 className="text-[17px] font-extrabold text-[#0F2744] flex items-center gap-2 mb-1">
          💬 What customers say about paint &amp; finish
        </h2>
      )}

      {/* ---- drawer toggle (verified only) ---- */}
      {verified && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 inline-flex items-center gap-2 bg-[#0F2744] hover:bg-[#1e3a5f] text-white rounded-[10px] px-4 py-2.5 text-[13.5px] font-bold transition-colors"
        >
          See what customers say about paint safety
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* ---- evidence drawer ---- */}
      {(open || !verified) && clear > 0 && (
        <div className={verified ? 'mt-4 pt-4 border-t border-gray-200' : 'mt-3'}>
          {/* split bar */}
          <div className="flex h-4 rounded-full overflow-hidden border border-gray-200">
            <div className="bg-[#22C55E]" style={{ width: `${pctPos}%` }} />
            <div className="bg-red-400" style={{ width: `${pctNeg}%` }} />
          </div>
          {/* dual filter buttons */}
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => setSent((s) => (s === 'positive' ? null : 'positive'))}
              className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition ${
                sent === 'positive' ? 'ring-2 ring-emerald-300' : ''
              } border-emerald-300 bg-emerald-50 hover:bg-emerald-100`}
            >
              <ThumbsUp className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-[11px] text-slate-600 leading-tight">
                <b className="block text-[14px] text-[#0F2744]">{pctPos}% gentle on paint</b>tap to see these
              </span>
              <span className="ml-auto text-[10.5px] font-extrabold uppercase text-emerald-700">Filter ›</span>
            </button>
            <button
              onClick={() => setSent((s) => (s === 'negative' ? null : 'negative'))}
              className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition ${
                sent === 'negative' ? 'ring-2 ring-red-300' : ''
              } border-red-300 bg-red-50 hover:bg-red-100`}
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-[11px] text-slate-600 leading-tight">
                <b className="block text-[14px] text-[#0F2744]">{pctNeg}% raised concerns</b>tap to read
              </span>
              <span className="ml-auto text-[10.5px] font-extrabold uppercase text-red-600">Filter ›</span>
            </button>
          </div>
          {/* theme chips + sort */}
          <div className="flex flex-wrap gap-2 items-center mt-3.5">
            {([['all', 'All'], ['paint', 'Paint safety'], ['touchless', 'Touchless'], ['cleanliness', 'Cleanliness']] as const)
              .filter(([k]) => k === 'all' || (counts[k] ?? 0) > 0) // hide themes we have no data for (e.g. Cleanliness until that harvest)
              .map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => { setTheme(k); setSent(null); }}
                  className={`text-[12px] font-bold px-3 py-1.5 rounded-full border transition ${
                    theme === k && !sent ? 'bg-[#0F2744] text-white border-[#0F2744]' : 'bg-slate-100 text-slate-600 border-gray-200 hover:bg-slate-200'
                  }`}
                >
                  {label} <span className="opacity-60">{counts[k] ?? 0}</span>
                </button>
              ),
            )}
            <label className="ml-auto text-[12px] text-slate-500 flex items-center gap-1">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'helpful' | 'recent')}
                className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                <option value="helpful">Most helpful</option>
                <option value="recent">Most recent</option>
              </select>
            </label>
          </div>
          {/* cards */}
          <div className="flex flex-col gap-2.5 mt-2.5">
            {rows.length > 0 ? (
              rows.map((s) => <SnippetCard key={s.id} s={s} />)
            ) : (
              <div className="text-[13px] text-gray-400 py-3 text-center">No matching reviews in this filter.</div>
            )}
          </div>
          {/* footer note for has-data-unverified */}
          {!verified && (
            <p className="mt-3 text-[11.5px] text-gray-400 italic">
              Paint-Safe Verified is awarded to washes with consistently positive paint feedback. We show every wash&apos;s
              real reviews — verified or not — so you can decide.{' '}
              <a href={methodologyHref} className="text-blue-600 not-italic hover:underline">How it works ›</a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
