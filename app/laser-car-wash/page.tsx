import Link from 'next/link';
import { ChevronRight, Zap, Search, ShieldCheck, Droplets } from 'lucide-react';
import { getApprovedTouchlessCount } from '@/lib/listing-queries';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/laser-car-wash';

export async function generateMetadata(): Promise<Metadata> {
  const year = new Date().getFullYear();
  const title = `Laser Car Wash vs Touchless: Are They the Same? (${year})`;
  const description =
    'Yes — a laser car wash is a touchless car wash. Learn where the "laser" name comes from, how a no-touch laser wash actually cleans your car, and find a verified laser/touchless car wash near you.';
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${PAGE_PATH}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${PAGE_PATH}`,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function LaserCarWashGuide() {
  const total = await getApprovedTouchlessCount();
  const totalStr = total > 0 ? total.toLocaleString() : '3,000';

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Laser Car Wash', item: `${SITE_URL}${PAGE_PATH}` },
    ],
  };

  const faqs = [
    {
      q: 'Is a laser car wash the same as a touchless car wash?',
      a: 'Yes. "Laser car wash" and "touchless car wash" describe the same thing — an automated in-bay wash that cleans your vehicle with high-pressure water jets and detergents instead of brushes or cloth. They\'re also called touch-free or no-touch washes. The cleaning method is identical; "laser" is just another name for it.',
    },
    {
      q: 'Why is it called a laser car wash if there are no lasers?',
      a: 'The name comes from the laser and infrared sensors the machine uses to detect your vehicle\'s exact shape, height, and position. Those sensors let the spray arms follow the contours of your car closely for an even clean. No actual laser light does any cleaning — water pressure and chemistry do all the work. The term also spread because "LaserWash," a popular touch-free system built by PDQ, became a household name, much like "Kleenex" stands in for tissues.',
    },
    {
      q: 'Is a laser car wash safe for my paint?',
      a: 'Yes — it\'s one of the safest automated options. Because nothing physically touches your paint, a laser (touchless) wash eliminates the brush-induced scratches and swirl marks that soft-touch tunnels can leave behind. That makes it a popular choice for new cars, ceramic coatings, paint protection film (PPF), and luxury vehicles like Tesla, BMW, and Porsche.',
    },
    {
      q: 'How well does a laser car wash clean compared to a brush wash?',
      a: 'For regular maintenance washing, a laser/touchless wash gets the vast majority of road dirt, dust, and grime off using high-pressure water and stronger detergents. Very heavy, baked-on mud or bug splatter may need a pre-soak or a second pass, since there\'s no physical scrubbing. For most drivers keeping a car clean week to week, the trade-off — slightly less scrubbing power in exchange for zero scratch risk — is well worth it.',
    },
    {
      q: 'How do I find a laser car wash near me?',
      a: `Use the search bar on our homepage, or browse by state. Every one of the ${totalStr}+ locations in our directory is a verified touchless (laser / touch-free) car wash — we exclude soft-touch tunnels and brush-based washes, so every result is genuinely no-touch.`,
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* Hero */}
      <div className="bg-[#0F2744]">
        <div className="container mx-auto px-4 max-w-6xl py-12 md:py-16">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Laser Car Wash</span>
          </nav>
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-[#22C55E]" />
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Laser Car Wash vs Touchless: Are They the Same?
            </h1>
          </div>
          <p className="text-lg text-blue-100 max-w-3xl">
            Short answer: <strong className="text-white">yes — a laser car wash <em>is</em> a touchless car wash.</strong>{' '}
            Same no-touch, brushless cleaning, just a different name. Here&apos;s where the &ldquo;laser&rdquo; label
            comes from, how it works, and how to find one near you.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl py-10">

        {/* Direct answer */}
        <div className="bg-blue-50 rounded-xl p-6 mb-10">
          <h2 className="text-xl font-bold text-[#0F2744] mb-3">Laser car wash = touchless car wash</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            &ldquo;Laser car wash,&rdquo; &ldquo;touchless,&rdquo; &ldquo;touch-free,&rdquo; and &ldquo;no-touch&rdquo;
            all describe the exact same kind of wash: an automated in-bay machine that cleans your vehicle using
            high-pressure water jets and specialized detergents — <strong>with no brushes, cloth, or foam pads ever
            touching your paint.</strong> The cleaning method is identical. The only difference is the name.
          </p>
          <p className="text-gray-700 leading-relaxed">
            So if you searched for a &ldquo;laser car wash near me,&rdquo; what you&apos;re really looking for is a
            touchless car wash — and that&apos;s exactly what this directory verifies.
          </p>
        </div>

        {/* Where the name comes from */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-3">Where does the &ldquo;laser&rdquo; name come from?</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            There are no actual lasers cleaning your car. The name comes from the <strong>laser and infrared
            sensors</strong> the machine uses to map your vehicle&apos;s shape, height, and position as you pull in.
            Those sensors let the spray arms follow the contours of your car closely, so every panel gets an even
            blast of water and soap.
          </p>
          <p className="text-gray-700 leading-relaxed">
            The term also caught on because of <strong>LaserWash</strong>, a popular touch-free wash system originally
            built by{' '}
            <Link href="/equipment/pdq" className="text-[#0F2744] font-medium hover:underline">PDQ</Link>. It became so
            common that &ldquo;laser wash&rdquo; turned into a generic name for any touchless wash — the same way
            &ldquo;Kleenex&rdquo; stands in for tissue. When you see a sign for a laser wash, it&apos;s a touchless wash.
          </p>
        </div>

        {/* How it works */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">How a laser (touchless) car wash works</h2>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Search className="w-6 h-6 text-[#22C55E] flex-shrink-0 mt-0.5" />
              <p className="text-gray-700 leading-relaxed">
                <strong>1. Sensors scan your car.</strong> As you pull into the bay, laser/infrared sensors detect
                the size and shape of your vehicle so the equipment knows exactly where to aim.
              </p>
            </div>
            <div className="flex gap-3">
              <Droplets className="w-6 h-6 text-[#22C55E] flex-shrink-0 mt-0.5" />
              <p className="text-gray-700 leading-relaxed">
                <strong>2. Pre-soak &amp; high-pressure rinse.</strong> Specialized detergents are applied to break
                down dirt and road film, then high-pressure water jets blast it away — no scrubbing needed.
              </p>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="w-6 h-6 text-[#22C55E] flex-shrink-0 mt-0.5" />
              <p className="text-gray-700 leading-relaxed">
                <strong>3. Spot-free rinse &amp; dry.</strong> A final rinse and powerful blowers finish the job —
                all without a single brush ever touching your paint, which is why there&apos;s no scratch or swirl-mark
                risk.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="p-6 bg-[#0F2744] rounded-2xl text-center mb-10">
          <p className="text-white font-semibold text-lg mb-2">Find a verified laser car wash near you</p>
          <p className="text-white/70 text-sm mb-4">
            Browse {totalStr}+ verified touchless (laser / touch-free) car washes across all 50 states + DC.
            Every listing is confirmed no-touch — never a soft-touch tunnel.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/states"
              className="inline-flex items-center gap-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Browse by state →
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Search near me
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map(({ q, a }) => (
              <div key={q} className="border border-gray-200 rounded-lg p-5 bg-white">
                <h3 className="font-semibold text-[#0F2744] mb-2 text-sm">{q}</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related guides */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Related guides</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/24-hour-touchless-car-wash" className="text-sm text-[#0F2744] font-medium hover:text-[#22C55E] transition-colors">
              24-hour touchless car washes →
            </Link>
            <span className="text-gray-300">·</span>
            <Link href="/unlimited-touchless-car-wash" className="text-sm text-[#0F2744] font-medium hover:text-[#22C55E] transition-colors">
              Unlimited wash plans →
            </Link>
            <span className="text-gray-300">·</span>
            <Link href="/best" className="text-sm text-[#0F2744] font-medium hover:text-[#22C55E] transition-colors">
              Best-rated by metro →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
