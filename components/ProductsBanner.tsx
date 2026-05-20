import Link from 'next/link';

/**
 * Native content banner promoting the affiliate product guide.
 * Styled to match the site brand — not a display ad, but an editorial CTA.
 * Drop this anywhere you want to drive traffic to /blog/recommended-products.
 */
export function ProductsBanner() {
  return (
    <div className="rounded-2xl bg-[#0F2744] px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="text-3xl select-none" aria-hidden="true">🛡️</div>
      <div className="flex-1">
        <p className="text-white font-bold text-base leading-snug mb-0.5">
          Keep Your Paint Protected Between Washes
        </p>
        <p className="text-white/70 text-sm leading-relaxed">
          Microfiber towels, spray wax, and quick detailers our editors actually use and recommend.
        </p>
      </div>
      <Link
        href="/shop"
        className="shrink-0 inline-block rounded-xl bg-white text-[#0F2744] font-semibold text-sm px-5 py-2.5 hover:bg-blue-50 transition-colors whitespace-nowrap"
      >
        See Our Top Picks →
      </Link>
    </div>
  );
}
