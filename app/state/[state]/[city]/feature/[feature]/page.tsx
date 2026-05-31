/**
 * Feature subset pages: /state/[state]/[city]/feature/[feature]
 *
 * Surfaces a subset of touchless car wash listings in a given city that match
 * a specific feature (open 24 hours, free vacuum, monthly membership, etc.).
 *
 * Each feature page captures long-tail search intent like "touchless car wash
 * open 24 hours in Seattle" without requiring new listings — the data comes
 * from existing amenities + hours fields.
 *
 * Pages auto-noindex (return 404) if fewer than 3 listings match, to avoid
 * thin/empty pages dragging down site quality signals.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, MapPin } from 'lucide-react';
import type { Metadata } from 'next';

import { supabase, LISTING_CARD_COLUMNS, type Listing } from '@/lib/supabase';
import { getStateName, slugify, getStateSlug } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import {
  FEATURE_FILTERS,
  FEATURE_FILTERS_BY_SLUG,
  MIN_LISTINGS_FOR_FEATURE_PAGE,
} from '@/lib/feature-filters';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface FeaturePageProps {
  params: { state: string; city: string; feature: string };
}

// ── Data helpers ─────────────────────────────────────────────────────
async function getCityListings(stateCode: string, cityName: string): Promise<Listing[]> {
  const all: Listing[] = [];
  const PAGE = 1000;
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .eq('is_touchless', true)
      .eq('is_approved', true)
      .eq('state', stateCode)
      .ilike('city', cityName)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) return all;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as Listing[]));
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

// ── Metadata ─────────────────────────────────────────────────────────
export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const filter = FEATURE_FILTERS_BY_SLUG[params.feature];
  if (!filter) return { title: 'Not Found' };

  const stateCode = params.state.length === 2
    ? params.state.toUpperCase()
    : getStateSlug(params.state).toUpperCase();
  const stateName = getStateName(stateCode);
  if (!stateName) return { title: 'Not Found' };

  const cityName = params.city
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

  const matches = await getCityListings(stateCode, cityName).then((listings) =>
    listings.filter((l) => filter.matches(l)),
  );

  if (matches.length < MIN_LISTINGS_FOR_FEATURE_PAGE) {
    return { title: 'Not Found', robots: { index: false, follow: false } };
  }

  const title = `Touchless Car Wash ${filter.titlePhrase.replace(/^./, (c) => c.toUpperCase())} in ${cityName}, ${stateCode} — ${matches.length} Locations`;
  const description = `${filter.blurb} Find ${matches.length} verified touchless car wash${matches.length === 1 ? '' : 'es'} ${filter.titlePhrase} in ${cityName}, ${stateName}. Ratings, hours, and directions.`;
  const canonicalUrl = `https://touchlesscarwashfinder.com/state/${params.state}/${params.city}/feature/${params.feature}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

// ── Page ─────────────────────────────────────────────────────────────
export default async function FeaturePage({ params }: FeaturePageProps) {
  const filter = FEATURE_FILTERS_BY_SLUG[params.feature];
  if (!filter) notFound();

  const stateCode = params.state.length === 2
    ? params.state.toUpperCase()
    : getStateSlug(params.state).toUpperCase();
  const stateName = getStateName(stateCode);
  if (!stateName) notFound();

  const cityName = params.city
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

  const allListings = await getCityListings(stateCode, cityName);
  const matched = allListings.filter((l) => filter.matches(l));

  // Thin-content guard — if too few matches, treat as 404 (and noindex above).
  if (matched.length < MIN_LISTINGS_FOR_FEATURE_PAGE) notFound();

  // Sort matched listings by rating × log(reviews + 2)
  matched.sort((a, b) => {
    const aScore = (a.rating || 0) * Math.log10((a.review_count ?? 0) + 2);
    const bScore = (b.rating || 0) * Math.log10((b.review_count ?? 0) + 2);
    return bScore - aScore;
  });

  // Find other available filters for this city — for cross-linking nav
  const otherFilters = FEATURE_FILTERS.filter((f) => {
    if (f.slug === filter.slug) return false;
    const matchingHere = allListings.filter((l) => f.matches(l)).length;
    return matchingHere >= MIN_LISTINGS_FOR_FEATURE_PAGE;
  });

  return (
    <main>
      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <nav className="text-sm text-blue-100 mb-4 flex items-center gap-1 flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight size={14} />
            <Link href={`/state/${params.state}`} className="hover:text-white">{stateName}</Link>
            <ChevronRight size={14} />
            <Link href={`/state/${params.state}/${params.city}`} className="hover:text-white">{cityName}</Link>
            <ChevronRight size={14} />
            <span className="text-white font-medium">{filter.displayName}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-3">
            Touchless Car Wash {filter.titlePhrase.replace(/^./, (c) => c.toUpperCase())} in {cityName}, {stateCode}
          </h1>
          <p className="text-blue-100 text-lg max-w-3xl">
            {filter.blurb}
          </p>
          <p className="text-blue-200 text-sm mt-3">
            {matched.length} verified location{matched.length === 1 ? '' : 's'} in {cityName}
          </p>
        </div>
      </section>

      {/* Listings */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matched.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                href={`/state/${params.state}/${slugify(listing.city) || params.city}/${listing.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Other filters for the same city */}
      {otherFilters.length > 0 && (
        <section className="py-10 px-4 bg-white border-t">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-xl font-bold text-[#0F2744] mb-4">
              Other touchless car wash options in {cityName}
            </h2>
            <div className="flex flex-wrap gap-3">
              {otherFilters.map((f) => (
                <Link
                  key={f.slug}
                  href={`/state/${params.state}/${params.city}/feature/${f.slug}`}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-blue-50 text-[#0F2744] hover:bg-blue-100 text-sm font-medium transition-colors"
                >
                  {f.displayName}
                  <ChevronRight size={14} />
                </Link>
              ))}
              <Link
                href={`/state/${params.state}/${params.city}`}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-[#0F2744] text-white hover:bg-[#1a3a5e] text-sm font-medium transition-colors"
              >
                <MapPin size={14} />
                All touchless washes in {cityName}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* JSON-LD ItemList for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `Touchless Car Washes ${filter.titlePhrase} in ${cityName}, ${stateCode}`,
            numberOfItems: matched.length,
            itemListElement: matched.slice(0, 20).map((l, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `https://touchlesscarwashfinder.com/state/${params.state}/${slugify(l.city) || params.city}/${l.slug}`,
              name: l.name,
            })),
          }),
        }}
      />
    </main>
  );
}
