import Link from 'next/link';
import {
  affiliateUrl,
  amazonImageUrl,
  categoryGradient,
  getProducts,
  PLACEMENT_PRESETS,
  type PlacementPreset,
  type Product,
} from '@/lib/affiliate-products';
import { BuyButtons } from '@/components/BuyButtons';

type Props = {
  preset?: PlacementPreset;
  productIds?: readonly string[];
  title?: string;
  className?: string;
};

function isTouchless(p: Product): boolean {
  const s = `${p.brand} ${p.name}`.toLowerCase();
  return s.includes('touchless') || s.includes('touch free');
}

function Thumb({ product }: { product: Product }) {
  const imgUrl = amazonImageUrl(product);
  if (imgUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgUrl}
        alt={`${product.brand} ${product.name}`}
        loading="lazy"
        className="w-[72px] h-[72px] object-contain bg-white rounded-md border border-gray-200 shrink-0 p-1"
      />
    );
  }
  if (isTouchless(product)) {
    return (
      <div className="w-[72px] h-[72px] bg-gradient-to-br from-[#0F2744] to-[#22C55E] flex flex-col items-center justify-center rounded-md border border-gray-200 shrink-0 p-1 text-white text-center">
        <div className="text-[10px] font-black uppercase tracking-tight leading-none">
          Touchless
        </div>
        <div className="text-[8px] font-bold text-white/70 uppercase tracking-wider mt-0.5">
          {product.brand}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`w-[72px] h-[72px] bg-gradient-to-br ${categoryGradient(product)} flex items-center justify-center rounded-md border border-gray-200 shrink-0 p-1`}
    >
      <span className="text-[10px] font-bold text-[#0F2744] uppercase tracking-tight text-center leading-tight">
        {product.brand}
      </span>
    </div>
  );
}

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
          <div
            key={p.id}
            className="group rounded-lg border border-gray-100 bg-gray-50 hover:bg-white hover:border-[#22C55E] p-3 transition-all"
          >
            <a
              href={affiliateUrl(p)}
              target="_blank"
              rel="noopener noreferrer sponsored nofollow"
              className="block"
            >
              <div className="flex gap-3 items-start">
                <Thumb product={p} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
                    {p.brand}
                  </div>
                  <div className="font-semibold text-sm text-[#0F2744] leading-snug mb-1">
                    {p.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-yellow-500 font-medium">
                      &#11088; {p.rating}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-700 font-medium">
                      {p.priceRange}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 leading-snug mt-2 line-clamp-2">
                {p.positioning}
              </p>
            </a>
            <BuyButtons product={p} size="sm" className="mt-2.5" />
          </div>
        ))}
      </div>
      <Link
        href="/shop"
        className="block mt-3 text-xs font-semibold text-[#0F2744] hover:text-[#22C55E] transition-colors"
      >
        See our full touchless toolkit &rarr;
      </Link>
      <p className="text-[10px] text-gray-400 italic mt-2 leading-tight">
        Amazon &amp; Chemical Guys affiliate links — we earn from qualifying purchases at no extra cost.
      </p>
    </aside>
  );
}
