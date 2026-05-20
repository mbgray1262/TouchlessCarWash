import { ProductCard } from './ProductCard';
import {
  getProducts,
  PLACEMENT_PRESETS,
  type PlacementPreset,
  type Product,
} from '@/lib/affiliate-products';

type Props = {
  preset?: PlacementPreset;
  productIds?: readonly string[];
  title?: string;
  subtitle?: string;
  variant?: 'card' | 'compact';
  bg?: 'gray' | 'transparent';
  className?: string;
};

const DEFAULT_TITLES: Record<PlacementPreset, string> = {
  listing: 'Touchless Car Care — Editor Picks',
  metroBest: 'Quick Car Care After Your Wash',
  equipment: 'Build Your Home Touchless Setup',
  chains: 'Between-Wash Care for Subscribers',
  unlimited: 'Get the Most from Your Membership',
  twentyFourHour: 'Quick Care for Late-Night Drivers',
  homepage: 'Touchless Essentials — From Our Editors',
};

export function ProductGrid({
  preset,
  productIds,
  title,
  subtitle,
  variant = 'card',
  bg = 'gray',
  className,
}: Props) {
  const ids = productIds ?? (preset ? PLACEMENT_PRESETS[preset] : []);
  const products: Product[] = getProducts(ids);
  if (products.length === 0) return null;

  const resolvedTitle =
    title ?? (preset ? DEFAULT_TITLES[preset] : 'Editor Picks');

  const wrapperClass =
    bg === 'gray'
      ? 'rounded-2xl bg-gray-50 border border-gray-200 px-6 py-6'
      : '';

  return (
    <section className={[wrapperClass, className].filter(Boolean).join(' ')}>
      <h3 className="text-lg font-bold text-[#0F2744] mb-1">
        {resolvedTitle}
      </h3>
      {subtitle && (
        <p className="text-sm text-gray-600 mb-2">{subtitle}</p>
      )}
      <p className="text-xs text-gray-400 italic mb-5">
        Affiliate links — as an Amazon Associate we earn from qualifying
        purchases, at no extra cost to you.
      </p>
      {variant === 'compact' ? (
        <div className="space-y-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} variant="card" />
          ))}
        </div>
      )}
    </section>
  );
}
