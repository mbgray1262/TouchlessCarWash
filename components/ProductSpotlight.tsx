import {
  amazonUrl,
  amazonImageUrl,
  categoryGradient,
  getProduct,
  type Product,
} from '@/lib/affiliate-products';

type Props = {
  productId: string;
  eyebrow?: string;
  className?: string;
};

function SpotlightVisual({ product }: { product: Product }) {
  const imgUrl = amazonImageUrl(product);
  if (imgUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgUrl}
        alt={`${product.brand} ${product.name}`}
        loading="lazy"
        className="w-32 h-32 object-contain bg-white rounded-xl border border-gray-200 shrink-0 p-2"
      />
    );
  }
  return (
    <div
      className={`w-32 h-32 bg-gradient-to-br ${categoryGradient(product)} flex items-center justify-center rounded-xl border border-gray-200 shrink-0 p-3`}
    >
      <span className="text-lg font-black text-[#0F2744] uppercase tracking-tight text-center leading-tight">
        {product.brand}
      </span>
    </div>
  );
}

export function ProductSpotlight({
  productId,
  eyebrow = 'Editor Pick',
  className,
}: Props) {
  const product: Product | undefined = getProduct(productId);
  if (!product) return null;

  return (
    <a
      href={amazonUrl(product)}
      target="_blank"
      rel="noopener noreferrer sponsored nofollow"
      className={[
        'group flex flex-col sm:flex-row gap-5 items-start sm:items-center rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-blue-50/40 p-5 hover:border-[#22C55E] hover:shadow-md transition-all',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SpotlightVisual product={product} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded">
            {eyebrow}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {product.brand}
          </span>
          <span className="text-[10px] text-gray-400 italic">· affiliate</span>
        </div>
        <h3 className="font-bold text-[#0F2744] mb-1.5 leading-snug">
          {product.name}
        </h3>
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span className="text-yellow-500 font-medium">
            &#11088; {product.rating}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-700 font-medium">
            {product.priceRange}
          </span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          {product.positioning}
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-[#0F2744] text-white font-semibold text-sm px-5 py-2.5 group-hover:bg-[#22C55E] transition-colors whitespace-nowrap">
        Shop on Amazon &rarr;
      </span>
    </a>
  );
}
