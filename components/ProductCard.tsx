import {
  amazonUrl,
  amazonImageUrl,
  categoryGradient,
  type Product,
} from '@/lib/affiliate-products';

type Variant = 'card' | 'compact';

function ImageOrFallback({
  product,
  size,
  className,
}: {
  product: Product;
  size: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const imgUrl = amazonImageUrl(product);
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-[72px] h-[72px]',
    lg: 'aspect-square w-full',
  }[size];

  if (imgUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgUrl}
        alt={`${product.brand} ${product.name}`}
        loading="lazy"
        className={[
          sizeClasses,
          'object-contain bg-white rounded-md border border-gray-200 shrink-0 p-1',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }

  // Fallback — category-color gradient with brand initials. Looks intentional.
  return (
    <div
      className={[
        sizeClasses,
        `bg-gradient-to-br ${categoryGradient(product)} flex flex-col items-center justify-center rounded-md border border-gray-200 shrink-0 p-2 text-center`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={
          size === 'lg'
            ? 'text-xl font-black text-[#0F2744] uppercase tracking-tight leading-tight'
            : 'text-[10px] font-bold text-[#0F2744] uppercase tracking-tight leading-tight'
        }
      >
        {product.brand}
      </div>
    </div>
  );
}

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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer sponsored nofollow"
        className="group flex items-start gap-3 hover:bg-white rounded-lg p-2 -mx-2 transition-colors"
      >
        <ImageOrFallback product={product} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[#0F2744] group-hover:underline text-sm leading-snug">
            {product.brand} {product.name}
          </div>
          <div className="text-sm text-gray-600 mt-0.5">
            <span className="text-yellow-500 font-medium">
              &#11088; {product.rating}
            </span>
            <span className="text-gray-400 mx-1.5">·</span>
            <span className="font-medium text-gray-700">
              {product.priceRange}
            </span>
            <span className="text-gray-400 mx-1.5">·</span>
            <span className="text-gray-600">{product.positioning}</span>
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored nofollow"
      className="group flex flex-col h-full rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-[#22C55E] hover:shadow-md transition-all"
    >
      <ImageOrFallback
        product={product}
        size="lg"
        className="border-0 border-b border-gray-100 rounded-none"
      />
      <div className="flex flex-col flex-1 p-5">
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
          <span className="text-gray-700 font-medium">
            {product.priceRange}
          </span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-4 flex-1">
          {product.positioning}
        </p>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F2744] group-hover:text-[#22C55E] transition-colors mt-auto">
          Shop on Amazon &rarr;
        </span>
      </div>
    </a>
  );
}
