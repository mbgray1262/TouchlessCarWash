import {
  affiliateUrl,
  secondaryAmazonUrl,
  vendorLabel,
  type Product,
} from '@/lib/affiliate-products';

const REL = 'noopener noreferrer sponsored nofollow';

/**
 * Renders the buy CTA(s) for a product. Chemical Guys items (sold on both
 * chemicalguys.com via CJ and Amazon) get a primary "Shop at Chemical Guys"
 * button (10% commission) plus a secondary "Also on Amazon" button. Amazon-only
 * products show just the single primary button.
 *
 * NOTE: contains <a> elements, so it must NOT be rendered inside another <a>.
 */
export function BuyButtons({
  product,
  size = 'md',
  className,
}: {
  product: Product;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const primary = affiliateUrl(product);
  const amazonAlt = secondaryAmazonUrl(product);
  const pad = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm';

  return (
    <div
      className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}
    >
      <a
        href={primary}
        target="_blank"
        rel={REL}
        className={`inline-flex items-center justify-center gap-1 rounded-lg bg-[#0F2744] text-white font-semibold ${pad} hover:bg-[#22C55E] transition-colors`}
      >
        Shop at {vendorLabel(product)}
      </a>
      {amazonAlt && (
        <a
          href={amazonAlt}
          target="_blank"
          rel={REL}
          className={`inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 text-[#0F2744] font-semibold ${pad} hover:border-[#22C55E] hover:text-[#22C55E] transition-colors`}
        >
          Also on Amazon
        </a>
      )}
    </div>
  );
}
