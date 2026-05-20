import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug } from '@/lib/constants';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductSpotlight } from '@/components/ProductSpotlight';
import type { Metadata } from 'next';

export const revalidate = 3600;

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PAGE_PATH = '/24-hour-touchless-car-wash';

type StateCount = { stateCode: string; stateName: string; slug: string; count: number };

async function get24hCountsByState(): Promise<StateCount[]> {
  // Paginate past the 1000-row cap
  const all: { state: string; hours: Record<string, string> | null }[] = [];
  const BATCH = 1000;
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('listings')
      .select('state, hours')
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .not('hours', 'is', null)
      .range(offset, offset + BATCH - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  const counts: Record<string, number> = {};
  for (const l of all) {
    const h = (l.hours ?? {}) as Record<string, unknown>;
    const vals = Object.values(h).filter((v): v is string => typeof v === 'string');
    if (vals.some(v => v.toLowerCase().includes('open 24 hours'))) {
      counts[l.state] = (counts[l.state] ?? 0) + 1;
    }
  }

  return US_STATES
    .filter(s => (counts[s.code] ?? 0) > 0)
    .map(s => ({
      stateCode: s.code,
      stateName: getStateName(s.code),
      slug: getStateSlug(s.code),
      count: counts[s.code] ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function generateMetadata(): Promise<Metadata> {
  const year = new Date().getFullYear();
  const title = `24 Hour Touchless Car Wash Near Me — Open Now (${year})`;
  const description =
    '630+ touchless car washes open 24 hours a day, 7 days a week across 47 states. Find a no-touch automatic car wash near you that\'s open right now — brushless, scratch-free, available anytime.';
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

export default async function TwentyFourHourHub() {
  const stateCounts = await get24hCountsByState();
  const total = stateCounts.reduce((s, c) => s + c.count, 0);
  const year = new Date().getFullYear();

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: '24 Hour Touchless Car Wash', item: `${SITE_URL}${PAGE_PATH}` },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Are touchless car washes really open 24 hours?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes — many touchless in-bay automatic car washes operate 24/7 because they are fully automated and require no staff. You pay at the kiosk, pull into the bay, and the wash runs on its own. Unlike staffed tunnel washes, there\'s nobody who needs to clock out.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why are touchless car washes more likely to be open 24 hours than tunnel washes?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Touchless in-bay automatics are self-contained machines — a customer drives in, pays at a kiosk, and the equipment runs without any staff involvement. Tunnel washes require attendants to guide cars onto the conveyor and manage the line, so they must close when staff leave. That\'s why 24/7 car wash access is almost exclusively found at touchless (and self-serve) locations.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is it safe to use a touchless car wash late at night?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most 24-hour touchless bays at gas stations and standalone locations are well-lit and monitored by security cameras. They are generally safe to use at any hour. As with any late-night errand, use common sense — choose busy locations and keep your vehicle doors locked during the wash cycle.',
        },
      },
    ],
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
            <span className="text-white">24 Hour Touchless Car Wash</span>
          </nav>
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-8 h-8 text-[#22C55E]" />
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              24 Hour Touchless Car Wash
            </h1>
          </div>
          <p className="text-lg text-blue-100 max-w-3xl">
            {total.toLocaleString()}+ touchless car washes open 24/7 across {stateCounts.length} states.
            Fully automated — no staff required, no brushes, no scratches. Find one near you right now.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">

        {/* Why 24h touchless */}
        <div className="bg-blue-50 rounded-xl p-6 mb-10">
          <h2 className="text-xl font-bold text-[#0F2744] mb-3">Why touchless car washes can run 24/7</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Touchless in-bay automatics are fully self-contained — you pull in, pay at the kiosk, and the wash runs without any staff. Unlike tunnel washes that need attendants to guide cars onto the conveyor, touchless bays operate the same at 2am as they do at 2pm.
          </p>
          <p className="text-gray-700 leading-relaxed">
            That makes them the go-to option if you work nights, travel early, or just need a wash outside normal business hours. Many are located at 24-hour gas stations (Holiday Stationstores, Kwik Trip, Sheetz) where the surrounding location is lit and monitored around the clock.
          </p>
        </div>

        {/* Mid-content product spotlight */}
        <div className="mb-10">
          <ProductSpotlight
            productId="chemguys-interior-wipes"
            eyebrow="Late-Night Essential"
          />
        </div>

        {/* State grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-foreground mb-2">Browse 24-hour touchless car washes by state</h2>
          <p className="text-gray-600 text-sm mb-6">
            Select your state to see verified locations with confirmed 24-hour hours.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {stateCounts.map(s => (
              <Link
                key={s.stateCode}
                href={`${PAGE_PATH}/${s.slug}`}
                className="group block bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="text-2xl font-bold text-[#0F2744] mb-1 group-hover:text-blue-600 transition-colors">
                  {s.stateCode}
                </div>
                <div className="text-xs font-medium text-gray-700 mb-1">{s.stateName}</div>
                <div className="text-xs text-gray-500">{s.count} open 24/7</div>
              </Link>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-4">Frequently asked questions</h2>
          <div className="space-y-3">
            {[
              {
                q: 'Are touchless car washes really open 24 hours?',
                a: 'Yes — many touchless in-bay automatics run 24/7 because they are fully automated. You pay at the kiosk, pull into the bay, and the wash runs on its own. No staff needed, so no closing time.',
              },
              {
                q: 'Why are touchless washes more likely to be 24-hour than tunnels?',
                a: 'Tunnel washes require attendants to guide cars and manage the line, so they must close when staff leave. Touchless bays have no staffing requirement — that\'s why 24/7 car wash access is almost exclusively found at touchless and self-serve locations.',
              },
              {
                q: 'Is it safe to use a touchless car wash late at night?',
                a: 'Most 24-hour touchless bays at gas stations and standalone sites are well-lit and monitored by security cameras. Many are attached to 24-hour convenience stores. Use common sense — choose busy locations and keep doors locked during the wash cycle.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-gray-200 rounded-lg p-5 bg-white">
                <h3 className="font-semibold text-[#0F2744] mb-2 text-sm">{q}</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Affiliate Products — late-night quick care */}
        <div className="mb-10">
          <ProductGrid
            preset="twentyFourHour"
            variant="card"
            bg="gray"
            subtitle="Quick essentials for late-night washes — toss them in your glovebox."
          />
        </div>

        {/* Cross-link */}
        <div className="p-6 bg-[#0F2744] rounded-2xl text-center">
          <p className="text-white font-semibold text-lg mb-2">Looking for a monthly unlimited plan?</p>
          <p className="text-white/70 text-sm mb-4">
            Many 24-hour touchless locations also offer monthly memberships — wash every day for one flat price.
          </p>
          <Link
            href="/unlimited-touchless-car-wash"
            className="inline-flex items-center gap-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Compare unlimited plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
