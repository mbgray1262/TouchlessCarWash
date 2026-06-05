import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { getStateSlug, slugify } from '@/lib/constants';
import { tssTier } from '@/lib/touchless-satisfaction';

export type ScoreRankItem = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  score: number;
};

/**
 * "Touchless Satisfaction vs. nearby washes" ranked mini-bar list (from the
 * locked mockup). Server component — pure render. Shows the current wash in
 * context against others in the same city, ranked by score.
 */
export function TouchlessScoreComparison({
  items,
  currentId,
  cityLabel,
  cityHref,
}: {
  items: ScoreRankItem[];
  currentId: string;
  cityLabel: string;
  cityHref: string;
}) {
  if (!items || items.length < 2) return null;
  const top = items.slice(0, 6);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-lg font-bold text-[#0F2744] mb-3 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />
        Touchless Satisfaction vs. nearby washes
      </h2>
      <div className="space-y-1.5">
        {top.map((it, i) => {
          const t = tssTier(it.score);
          const me = it.id === currentId;
          const href = `/state/${getStateSlug(it.state)}/${slugify(it.city)}/${it.slug}`;
          const row = (
            <div
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${me ? 'bg-slate-50 border border-gray-200' : 'hover:bg-slate-50'}`}
            >
              <span className="w-5 text-center text-sm font-bold text-gray-400 shrink-0">{i + 1}</span>
              <span className="flex-1 text-sm text-[#0F2744] truncate">
                {it.name}
                {me && <em className="not-italic text-gray-400 font-medium"> (this wash)</em>}
              </span>
              <span className="hidden sm:block w-24 h-2 rounded-full bg-gray-100 overflow-hidden shrink-0">
                <span className="block h-full rounded-full" style={{ width: `${it.score}%`, background: t.arc }} />
              </span>
              <span className="w-7 text-right text-sm font-extrabold shrink-0" style={{ color: t.color }}>
                {it.score}
              </span>
            </div>
          );
          return me ? (
            <div key={it.id}>{row}</div>
          ) : (
            <Link key={it.id} href={href} className="block">
              {row}
            </Link>
          );
        })}
      </div>
      <Link href={cityHref} className="inline-block mt-3 text-sm text-[#22C55E] hover:underline font-medium">
        See all touchless washes in {cityLabel} ranked ›
      </Link>
    </section>
  );
}
