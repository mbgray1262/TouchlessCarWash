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

import { useMemo, useState, type ReactNode } from 'react';
import { ThumbsUp, AlertTriangle, Droplets } from 'lucide-react';
import type { SelfServeSnippet } from '@/app/state/[state]/[city]/[slug]/listing-data';
import { tssTier } from '@/lib/touchless-satisfaction';

// Evidence vocabulary highlighted per variant (the reason the snippet was mined), plus shared
// quality sentiment. Mirrors highlightTouchless in TouchlessSatisfactionGauge: group 1 → green
// (positive / negated-negative / wash-type evidence), group 2 → red (bare negative).
const HL_EVIDENCE = {
  'touchless': String.raw`touch[\s-]?less|touch[\s-]?free|no[\s-]?touch|brush[\s-]?less|no\s+brush\w*|laser\s+wash|high[\s-]?pressure`,
  'self-serve': String.raw`self[\s-]?serv\w*|\bwand\b|foam[\s-]?brush|\bcoins?\b|\btokens?\b|wash[\s-]?bays?`,
  'hand-wash': String.raw`hand(?:[\s-]?car)?[\s-]?wash\w*|washed?\s+(?:it\s+|my\s+car\s+|the\s+car\s+)?by\s+hand|\bby\s+hand\b|hand[\s-]?dr(?:y|ied|ies)|hand[\s-]?wax\w*|\bdetail(?:ing|ed|er)?\b|wiped?\s+(?:it\s+|the\s+car\s+|everything\s+)?down|full[\s-]?serv\w*|attendant\w*`,
  // Detailing evidence — the services/terms that mark real detailing work. `detail` is matched
  // only in suffixed forms (detail(ing|ed|er|ers)) to skip the "attention to detail" idiom, which
  // HL_POS already highlights green anyway.
  'detailing': String.raw`\bdetail(?:ing|ed|er|ers)\b|ceramic\s+coat\w*|paint\s+correction|clay[\s-]?bar\w*|\bppf\b|paint\s+protection(?:\s+film)?|buff\w*|polish\w*|swirl\w*|\bwax\w*|interior\s+detail\w*|full\s+detail\w*|paint[\s-]?job|showroom`,
} as const;
const HL_POS = String.raw`spotless|sparkl\w*|shin(?:e|y|ing)|gleaming|immaculate|pristine|flawless|thorough\w*|careful\w*|meticulous|amazing|excellent|fantastic|great\s+job|perfect|attention\s+to\s+detail|highly\s+recommend`;
const HL_NEG_NEGATED = String.raw`(?:no|not|never|without|didn'?t|couldn'?t|wasn'?t|zero)\b[\w\s,'-]{0,15}?\b(?:scratch\w*|streak\w*|spot\w*|dirt\w*|damage\w*|residue|mark\w*|swirl\w*|miss\w*|smear\w*|fault\w*|complaint\w*)`;
const HL_NEG_BARE = String.raw`dirty|filthy|streak\w*|smear\w*|grimy|scratch\w*|swirl\w*|damage\w*|broke\w*|broken|residue|missed|rushed|sloppy|disappoint\w*|terrible|awful`;

function highlightWashType(text: string, variant: 'touchless' | 'self-serve' | 'hand-wash' | 'detailing'): ReactNode[] {
  const re = new RegExp(`(${HL_NEG_NEGATED}|${HL_POS}|${HL_EVIDENCE[variant]})|(${HL_NEG_BARE})`, 'gi');
  const nodes: ReactNode[] = [];
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; } // guard against zero-length matches
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

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  const full = Math.round(n);
  return (
    <span className="ml-auto text-[#f59e0b] text-xs tracking-tight" aria-label={`${n} stars`}>
      {'★'.repeat(full)}{'☆'.repeat(Math.max(0, 5 - full))}
    </span>
  );
}

function SnippetCard({ s, variant }: { s: SelfServeSnippet; variant: 'touchless' | 'self-serve' | 'hand-wash' | 'detailing' }) {
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
      <p className="text-[13.5px] text-slate-800 mt-2 leading-relaxed">{highlightWashType(s.text, variant)}</p>
      <div className="flex items-center gap-2 mt-2.5">
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${neg ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {neg ? 'Concern' : 'Praise'}
        </span>
        {s.date && <span className="text-[11px] text-gray-400 ml-auto">{s.date}</span>}
      </div>
    </div>
  );
}

// Same evidence-drawer, one per non-touchless wash type. Heading + score label differ; the
// mechanics (sentiment split, filters, sort) are identical. `scoreLabel` names the number shown
// in the header — self-serve is scored on FACILITY quality (the customer washes their own car),
// so its copy says "facility", not "wash".
const VARIANT_COPY = {
  'touchless': { heading: 'What customers say about the touchless wash', mention: 'mention the touchless wash', scoreLabel: 'Touchless Score' },
  'self-serve': { heading: 'What customers say about the self-serve facility', mention: 'mention the bays or equipment', scoreLabel: 'Facility Score' },
  'hand-wash': { heading: 'What customers say about the hand wash', mention: 'mention the hand wash', scoreLabel: 'Hand Wash Score' },
  'detailing': { heading: 'What customers say about the detailing', mention: 'mention the detailing work', scoreLabel: 'Detailing Score' },
} as const;

export default function SelfServeReviewsModule({
  snippets,
  reviewCount,
  googlePlaceId,
  variant = 'self-serve',
  score = null,
  hideScore = false,
}: {
  snippets: SelfServeSnippet[];
  reviewCount: number;
  googlePlaceId: string | null;
  variant?: 'touchless' | 'self-serve' | 'hand-wash' | 'detailing';
  /** The 0-100 category score (self_service_score / hand_wash_score / detailing_score), or null
   *  if under the 3-mention gate. Shown as a compact gauge in the header when present. */
  score?: number | null;
  /** Suppress the in-header score gauge — used inside the multi-service tabs, where the
   *  RatingsByService scorecard already shows every score (so it isn't shown twice). */
  hideScore?: boolean;
}) {
  const copy = VARIANT_COPY[variant];
  const tier = score != null && !hideScore ? tssTier(score) : null;
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
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-[17px] font-extrabold text-[#0F2744] flex items-center gap-2">
          <Droplets className="w-5 h-5 text-[#22C55E]" />
          {copy.heading}
        </h2>
        {score != null && tier != null && (
          <div
            className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-1.5 border"
            style={{ backgroundColor: tier.bg, borderColor: tier.arc }}
            title={`${copy.scoreLabel}: ${score}/100 (${tier.label}) — from customer reviews`}
          >
            <span className="text-2xl font-extrabold leading-none" style={{ color: tier.color }}>{score}</span>
            <span className="text-[10px] font-bold uppercase leading-tight" style={{ color: tier.color }}>
              {copy.scoreLabel.split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
            </span>
          </div>
        )}
      </div>
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
          rows.slice(0, expanded ? rows.length : INITIAL).map((s) => <SnippetCard key={s.id} s={s} variant={variant} />)
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
