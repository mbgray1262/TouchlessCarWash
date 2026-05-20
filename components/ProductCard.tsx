import { amazonUrl, type Product } from '@/lib/affiliate-products';

type Variant = 'card' | 'compact';

export function ProductCard({
  product,
  variant = 'card',
}: {
  product: Product;
  variant?: Variant;
}) {
  const href = amazonUrl(product);

  if (variant === 'compact') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-start gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored nofollow"
          className="font-semibold text-[#0F2744] hover:underline shrink-0"
        >
          {product.brand} {product.name}
        </a>
        <span className="text-gray-600 text-sm sm:ml-1">
          <span className="text-yellow-500">&#11088; {product.rating}</span>
          <span className="text-gray-400 mx-1.5">·</span>
          <span className="font-medium text-gray-700">{product.priceRange}</span>
          <span className="text-gray-400 mx-1.5">·</span>
          {product.positioning}
        </span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored nofollow"
      className="group flex flex-col h-full rounded-xl border border-gray-200 bg-white p-5 hover:border-[#22C55E] hover:shadow-md transition-all"
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        {product.brand}
      </div>
      <h3 className="font-bold text-[#0F2744] mb-2 leading-snug">
        {product.name}
      </h3>
      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-yellow-500 font-medium">
          &#11088; {product.rating}
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-700 font-medium">{product.priceRange}</span>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed mb-4 flex-1">
        {product.positioning}
      </p>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F2744] group-hover:text-[#22C55E] transition-colors mt-auto">
        Shop on Amazon &rarr;
      </span>
    </a>
  );
}
