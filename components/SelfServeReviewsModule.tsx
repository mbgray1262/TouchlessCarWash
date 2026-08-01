'use client';

/**
 * Self-serve review module (listing detail page) — the self-serve twin of the touchless
 * evidence drawer in PaintSafeModule. Shows what customers say about the SELF-SERVE wash
 * (wand bays, water pressure, coin machines): a positive/negative split bar, two tap-to-read
 * filter buttons, snippet cards, and a "read all on Google" CTA. No numeric score (by design).
 *
 * Fed by getSelfServeReviewSnippets() — snippets keyword-mined then AI sentiment-labeled.
 * Renders for any self-serve-public listing (self-serve-only AND the self-serve side of a
 * mixed touchless+self-serve facility), so a visitor from the self-serve directory sees
 * self-serve reviews instead of only the touchless ones.
 */

import { useMemo, useState } from 'react';
import { ThumbsUp, AlertTriangle, Droplets } from 'lucide-react';
import type { SelfServeSnippet } from '@/app/state/[state]/[city]/[slug]/listing-data';

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  const full = Math.round(n);
  return (
    <span className="ml-auto text-[#f59e0b] text-xs tracking-tight" aria-label={`${n} stars`}>
      {'★'.repeat(full)}{'☆'.repeat(Math.max(0, 5 - full))}
    </span>
  );
}

function SnippetCard({ s }: { s: SelfServeSnippet }) {
  const neg = s.sentiment === 'negative';
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
      <p className="text-[13.5px] text-slate-800 mt-2 leading-relaxed">{s.text}</p>
      <div className="flex items-center gap-2 mt-2.5">
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${neg ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {neg ? 'Concern' : 'Praise'}
        </span>
        {s.date && <span className="text-[11px] text-gray-400 ml-auto">{s.date}</span>}
      </div>
    </div>
  );
}

// Same evidence-drawer, two wash types: 'self-serve' (default) and 'hand-wash'. Only the
// two heading strings differ; the mechanics (sentiment split, filters, sort) are identical.
const VARIANT_COPY = {
  'self-serve': { heading: 'What customers say about the self-serve wash', mention: 'mention the self-serve bays' },
  'hand-wash': { heading: 'What customers say about the hand wash', mention: 'mention the hand wash' },
} as const;

export default function SelfServeReviewsModule({
  snippets,
  reviewCount,
  googlePlaceId,
  variant = 'self-serve',
}: {
  snippets: SelfServeSnippet[];
  reviewCount: number;
  googlePlaceId: string | null;
  variant?: 'self-serve' | 'hand-wash';
}) {
  const copy = VARIANT_COPY[variant];
  const [sent, setSent] = useState<null | 'positive' | 'negative'>(null);
  const [sort, setSort] = useState<'helpful' | 'recent'>('helpful');
  const [expanded, setExpanded] = useState(false);
  const INITIAL = 2;

  const pos = snippets.filter((s) => s.sentiment === 'positive').length;
  const neg = snippets.filter((s) => s.sentiment === 'negative').length;
  const clear = pos + neg;
  const pctPos = clear > 0 ? Math.round((pos / clear) * 100) : 0;

  const rows = useMemo(() => {
    let r = sent ? snippets.filter((s) => s.sentiment === sent) : snippets;
    r = [...r].sort((a, b) =>
      sort === 'recent'
        ? (a.recencyDays ?? 9e9) - (b.recencyDays ?? 9e9)
        : (b.rating ?? 0) + (b.isLocalGuide ? 2 : 0) - ((a.rating ?? 0) + (a.isLocalGuide ? 2 : 0)),
    );
    return r.slice(0, 40);
  }, [snippets, sent, sort]);

  if (clear === 0) return null;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
      <h2 className="text-[17px] font-extrabold text-[#0F2744] flex items-center gap-2 mb-1">
        <Droplets className="w-5 h-5 text-[#22C55E]" />
        {copy.heading}
      </h2>
      <p className="text-[12.5px] text-slate-500 mb-2">
        Of <b className="text-slate-700">{reviewCount.toLocaleString()}</b> total reviews,{' '}
        <b className="text-slate-700">{clear}</b> {copy.mention}:
      </p>

      <div className="flex h-3 rounded-full overflow-hidden border border-gray-200">
        <div className="bg-[#22C55E]" style={{ width: `${pctPos}%` }} />
        <div className="bg-red-400" style={{ width: `${100 - pctPos}%` }} />
      </div>

      {/* dual filter buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
        <button
          onClick={() => { setSent((s) => (s === 'positive' ? null : 'positive')); setExpanded(false); }}
          className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition ${
            sent === 'positive' ? 'ring-2 ring-emerald-300' : ''
          } border-emerald-300 bg-emerald-50 hover:bg-emerald-100`}
        >
          <ThumbsUp className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="text-[11px] text-slate-600 leading-tight">
            <b className="block text-[14px] text-[#0F2744]">{pos} positive</b>tap to read
          </span>
          <span className="ml-auto text-[10.5px] font-extrabold uppercase text-emerald-700">Filter ›</span>
        </button>
        <button
          onClick={() => { setSent((s) => (s === 'negative' ? null : 'negative')); setExpanded(false); }}
          className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition ${
            sent === 'negative' ? 'ring-2 ring-red-300' : ''
          } border-red-300 bg-red-50 hover:bg-red-100`}
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-[11px] text-slate-600 leading-tight">
            <b className="block text-[14px] text-[#0F2744]">{neg} {neg === 1 ? 'concern' : 'concerns'}</b>tap to read
          </span>
          <span className="ml-auto text-[10.5px] font-extrabold uppercase text-red-600">Filter ›</span>
        </button>
      </div>

      {sent && (
        <div className="mt-2.5">
          <button
            onClick={() => setSent(null)}
            className="text-[12px] font-bold px-3 py-1.5 rounded-full border bg-[#0F2744] text-white border-[#0F2744]"
          >
            Showing {sent === 'positive' ? 'positive' : 'concerns'} · clear ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-end mt-3">
        <label className="text-[12px] text-slate-500 flex items-center gap-1">
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

      <div className="flex flex-col gap-2.5 mt-2.5">
        {rows.length > 0 ? (
          rows.slice(0, expanded ? rows.length : INITIAL).map((s) => <SnippetCard key={s.id} s={s} />)
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

      {googlePlaceId && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <a
            href={`https://search.google.com/local/reviews?placeid=${googlePlaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#22C55E] hover:underline font-medium inline-flex items-center gap-1.5"
          >
            Read all reviews on Google →
          </a>
        </div>
      )}
    </section>
  );
}
