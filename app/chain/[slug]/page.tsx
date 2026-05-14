import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { ChevronRight, MapPin, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { getStateName, getStateSlug, slugify } from '@/lib/constants';
import { CHAINS, getChainBySlug, renderChainDescription } from '@/lib/chains';
import { getChainHeroImage } from '@/lib/chain-brand-images';
import { getChainBadgeClaims } from '@/lib/chain-rankings';
import { ListingCard } from '@/components/ListingCard';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface ChainPageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return CHAINS.map(c => ({ slug: c.slug }));
}

async function getChainListings(chainName: string): Promise<Listing[]> {
  const all: Listing[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data } = await supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .eq('parent_chain', chainName)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .order('state')
      .order('city')
      .order('rating', { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...(data as Listing[]));
    if (data.length < 1000) break;
  }
  return all;
}

export async function generateMetadata({ params }: ChainPageProps): Promise<Metadata> {
  const chain = getChainBySlug(params.slug);
  if (!chain) return { title: 'Not Found' };

  const { count } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('parent_chain', chain.name)
    .eq('is_touchless', true)
    .eq('is_approved', true);

  const total = count || 0;
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  const canonicalUrl = `${SITE_URL}/chain/${params.slug}`;
  const heroImage = getChainHeroImage(chain.name);

  // Lead with the actual question searchers ask: "Is [chain] touchless?"
  // GSC shows queries like "is mister car wash touchless" / "is zips car
  // wash touchless" / "are mister car washes touchless" sitting at pos
  // 8-10 with real impressions — the chain page already answers the
  // question, but the title doesn't match the query phrasing. This re-
  // leads it to capture that intent directly.
  const title = `Is ${chain.name} Touchless? Wash Types & Locations (${month} ${year})`;
  const description = `Is ${chain.name} a touchless car wash? Yes — find all ${total} verified ${chain.name} touchless locations with maps, ratings, hours, and wash type details.`;

  // Thin chain hubs (very few approved touchless locations) get noindexed.
  // The chain template's content is mostly a list of locations — when there
  // are only a handful, the page looks too similar to the individual location
  // pages and Google flags it as "Duplicate without user-selected canonical".
  // Threshold tuned so chains with at least 5 indexed locations stay indexed.
  const thinChain = total < 5;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: thinChain ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `Is ${chain.name} Touchless? Wash Types & Locations`,
      description,
      url: canonicalUrl,
      siteName: 'Touchless Car Wash Finder',
      ...(heroImage ? { images: [{ url: heroImage }] } : { images: [DEFAULT_OG_IMAGE] }),
    },
  };
}

export default async function ChainPage({ params }: ChainPageProps) {
  const chain = getChainBySlug(params.slug);
  // Unknown chain slug → 308 to /chains (the chain index). Avoids hard 404
  // for any old/typo URLs Google may have indexed; preserves any link equity.
  if (!chain) permanentRedirect('/chains?from=unknown-chain');

  const listings = await getChainListings(chain.name);
  // Chain exists in the registry but has 0 active touchless listings (every
  // location was either reverted, demoted, or deleted). 308 to /chains so
  // Google sees a clean redirect instead of a 404 — matters for AdSense
  // crawl-health signals and for old GSC-indexed URLs that pre-date the
  // mass chain noindex on April 20.
  if (listings.length === 0) permanentRedirect('/chains?from=empty-chain');

  // Check if this chain has any top-3 claim (national or regional) for the "Claim Your Badge" CTA
  const claims = await getChainBadgeClaims(params.slug);
  const hasAnyClaim = claims.national !== null || claims.regional.length > 0;
  const topClaim = claims.national ?? claims.regional[0] ?? null;

  const heroImage = getChainHeroImage(chain.name);

  // Group listings by state
  const byState = new Map<string, Listing[]>();
  for (const listing of listings) {
    const state = listing.state;
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state)!.push(listing);
  }
  const stateGroups = Array.from(byState.entries())
    .map(([code, items]) => ({
      code,
      name: getStateName(code) || code,
      slug: getStateSlug(code),
      count: items.length,
      listings: items,
    }))
    .sort((a, b) => b.count - a.count);

  const totalCount = listings.length;
  const stateCount = stateGroups.length;

  // Compute avg rating
  const rated = listings.filter(l => l.rating && l.rating > 0);
  const avgRating = rated.length > 0
    ? Math.round((rated.reduce((s, l) => s + (l.rating || 0), 0) / rated.length) * 10) / 10
    : null;

  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();

  const otherChains = CHAINS.filter(c => c.slug !== chain.slug);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Chains', item: `${SITE_URL}/chains` },
      { '@type': 'ListItem', position: 3, name: chain.name, item: `${SITE_URL}/chain/${chain.slug}` },
    ],
  };

  // ItemList enumerates locations for SEO — filter out listings with
  // empty city so we don't emit /state/<state>//<slug> URLs (Google sees
  // those as 404s). Same defensive filter the sitemap already applies.
  const itemListLocations = listings
    .filter((l) => l.city?.trim())
    .slice(0, 50);
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${chain.name} Touchless Car Wash Locations`,
    numberOfItems: itemListLocations.length,
    itemListElement: itemListLocations.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'AutoWash',
        name: l.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: l.address,
          addressLocality: l.city,
          addressRegion: l.state,
        },
        url: `${SITE_URL}/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`,
        ...(l.rating && l.review_count ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: l.rating,
            reviewCount: l.review_count,
          },
        } : {}),
      },
    })),
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* Hero */}
      <div className="bg-[#0F2744] relative overflow-hidden">
        {heroImage && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
        )}
        <div className="relative container mx-auto px-4 max-w-6xl py-12 md:py-16">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/chains" className="hover:text-white transition-colors">Chains</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{chain.name}</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight">
            {chain.name} Automatic Touchless Car Wash Locations
          </h1>
          <p className="text-lg text-blue-100">
            {totalCount} verified automatic touchless car wash{totalCount !== 1 ? 'es' : ''} across {stateCount} {stateCount === 1 ? 'state' : 'states'}
            {avgRating ? ` — ${avgRating}★ average rating` : ''}
          </p>
        </div>
      </div>

      {/* Floating "Claim Your Badge" button — top 3 nationally or regionally */}
      {hasAnyClaim && topClaim && (
        <div className="fixed bottom-6 right-6 z-50">
          <Link
            href={`/badge/chain/${params.slug}`}
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-[#0F2744] font-bold px-4 py-3 rounded-full shadow-lg transition-colors text-sm whitespace-nowrap"
          >
            <Trophy className="w-4 h-4" />
            #{topClaim.rank} in {topClaim.scopeName} — Claim Badge
          </Link>
        </div>
      )}

      <div className="container mx-auto px-4 max-w-6xl py-8">
        {/* Description */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <p className="text-gray-700 leading-relaxed">{renderChainDescription(chain.description, totalCount)}</p>
        </div>

        {/* Browse by State */}
        {stateGroups.length > 1 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Browse by State</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {stateGroups.map((sg) => (
                <a key={sg.code} href={`#${sg.code.toLowerCase()}`}>
                  <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                    <CardContent className="p-4">
                      <div className="font-semibold text-foreground">{sg.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {sg.count} location{sg.count !== 1 ? 's' : ''}
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Listings grouped by state */}
        {stateGroups.map((sg) => (
          <div key={sg.code} id={sg.code.toLowerCase()} className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {sg.name}
                <span className="text-lg font-normal text-muted-foreground">({sg.count})</span>
              </h2>
              <Link
                href={`/state/${sg.slug}`}
                className="text-sm text-primary hover:underline"
              >
                View all in {sg.name} →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sg.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        ))}

        {/* Chain rankings promo */}
        <div className="mt-12 mb-8 bg-[#0F2744] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl">🏆</div>
          <div className="flex-1">
            <p className="text-white font-bold text-lg mb-1">See How {chain.name} Ranks</p>
            <p className="text-blue-200 text-sm">Compare {chain.name} against other touchless car wash chains — national Top 10 and regional awards for {new Date().getFullYear()}.</p>
          </div>
          <Link
            href="/best/chains"
            className="flex-shrink-0 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap"
          >
            View Chain Rankings →
          </Link>
        </div>

        {/* Other Chains */}
        <div className="mt-0 mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-4">Other Touchless Car Wash Chains</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {otherChains.map((c) => (
              <Link key={c.slug} href={`/chain/${c.slug}`}>
                <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                  <CardContent className="p-4">
                    <div className="font-semibold text-foreground">{c.name}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-sm text-muted-foreground text-center mt-8">
          Last updated {month} {year}. All locations verified as touchless/brushless.
        </p>
      </div>
    </div>
  );
}
