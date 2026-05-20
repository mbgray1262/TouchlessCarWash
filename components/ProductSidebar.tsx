import { amazonUrl, getProducts, PLACEMENT_PRESETS, type PlacementPreset } from '@/lib/affiliate-products';

type Props = {
  preset?: PlacementPreset;
  productIds?: readonly string[];
  title?: string;
  className?: string;
};

/**
 * Sticky right-rail sidebar for listing-page-style layouts.
 * Renders 2 product cards stacked vertically with `lg:sticky` so the unit
 * follows the user as they scroll through the longer main column.
 */
export function ProductSidebar({
  preset = 'listing',
  productIds,
  title = 'Editor Picks',
  className,
}: Props) {
  const ids = productIds ?? PLACEMENT_PRESETS[preset];
  const products = getProducts(ids).slice(0, 2);
  if (products.length === 0) return null;

  return (
    <aside
      className={[
        'lg:sticky lg:top-24 rounded-2xl bg-white border border-gray-200 p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide">
          {title}
        </h3>
        <span className="text-[10px] text-gray-400 italic">Affiliate</span>
      </div>
      <div className="space-y-3">
        {products.map((p) => (
          <a
            key={p.id}
            href={amazonUrl(p)}
            target="_blank"
            rel="noopener noreferrer sponsored nofollow"
            className="group block rounded-lg border border-gray-100 bg-gray-50 hover:bg-white hover:border-[#22C55E] p-3 transition-all"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
              {p.brand}
            </div>
            <div className="font-semibold text-sm text-[#0F2744] leading-snug mb-1.5">
              {p.name}
            </div>
            <div className="flex items-center gap-1.5 text-xs mb-1.5">
              <span className="text-yellow-500 font-medium">
                &#11088; {p.rating}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-700 font-medium">{p.priceRange}</span>
            </div>
            <p className="text-xs text-gray-600 leading-snug mb-2 line-clamp-3">
              {p.positioning}
            </p>
            <span className="inline-flex items-center text-xs font-semibold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
              Shop on Amazon &rarr;
            </span>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 italic mt-3 leading-tight">
        Amazon affiliate links — we earn from qualifying purchases at no extra cost.
      </p>
    </aside>
  );
}
