import Link from 'next/link';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { US_STATES, getStateName, getStateSlug, slugify } from '@/lib/constants';
import { ListingCard } from '@/components/ListingCard';
import { Pagination, PAGE_SIZE } from '@/components/Pagination';
import {
  getFilters,
  getStateListingIds,
  filterByFilters,
  getStateListingsPaginated,
  getStateListingCountFiltered,
} from '@/lib/listing-queries';
import { FEATURES, getFeatureBySlug } from '@/lib/features';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface FeatureStatePageProps {
  params: { slug: string; state: string };
  searchParams: { page?: string };
}

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

export async function generateStaticParams() {
  const allData = await Promise.all(
    FEATURES.map((f) =>
      supabase.rpc('feature_state_counts', { p_filter_slug: f.slug })
        .then(({ data }) => ({ slug: f.slug, data }))
    )
  );
  const params: { slug: string; state: string }[] = [];
  for (const { slug, data } of allData) {
    if (data) {
      for (const row of data as { state: string; count: number }[]) {
        if (row.count >= 3) {
          params.push({ slug, state: getStateSlug(row.state) });
        }
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }: FeatureStatePageProps): Promise<Metadata> {
  const feature = getFeatureBySlug(params.slug);
  const stateCode = getStateCode(params.state);
  if (!feature || !stateCode) return { title: 'Not Found' };

  const stateName = getStateName(stateCode);
  const { data } = await supabase.rpc('feature_state_counts', { p_filter_slug: feature.slug });
  const match = (data as { state: string; count: number }[] | null)?.find((r) => r.state === stateCode);
  const count = match ? Number(match.count) : 0;

  // Canonical points at the master state hub — this page is a filtered view of
  // /state/<state> (only listings with this feature) and Google was flagging
  // it as a "Duplicate without user-selected canonical" of /state/<state>.
  // Pointing the canonical at the master resolves the ambiguity. The page
  // still renders for users navigating from internal feature filters.
  const canonical = `${SITE_URL}/state/${params.state}`;
  return {
    title: feature.stateSeoTitle(stateName, count),
    description: feature.stateSeoDescription(stateName, count),
    ...(count < 3 ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical },
    openGraph: {
      title: feature.stateSeoTitle(stateName, count),
      description: feature.stateSeoDescription(stateName, count),
      url: canonical,
      siteName: 'Touchless Car Wash Finder',
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function FeatureStatePage({ params, searchParams }: FeatureStatePageProps) {
  const feature = getFeatureBySlug(params.slug);
  const stateCode = getStateCode(params.state);
  // Unknown feature slug (e.g. retired filter like "self-serve-bays") →
  // 308 to /features index instead of 404. Old indexed URLs get a clean
  // redirect signal so Google drops them from the not-indexed bucket.
  if (!feature) permanentRedirect('/features');
  // Unknown state code while feature exists → 308 to the parent feature
  // page so the URL still resolves to something useful.
  if (!stateCode) permanentRedirect(`/features/${feature.slug}`);

  const stateName = getStateName(stateCode);
  const currentPage = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  // Fetch all data — wrapped so a Supabase timeout redirects rather than 500-ing
  let totalCount = 0;
  let paginatedListings: Awaited<ReturnType<typeof getStateListingsPaginated>> = [];
  let otherFeaturesRaw: ({ slug: string; name: string; count: number } | null)[] = [];
  let otherStatesData: { state: string; count: number }[] | null = null;

  try {
    const otherFeaturesPromise = Promise.all(
      FEATURES.filter((f) => f.slug !== feature.slug).map(async (f) => {
        const { data } = await supabase.rpc('feature_state_counts', { p_filter_slug: f.slug });
        const match = (data as { state: string; count: number }[] | null)?.find((r) => r.state === stateCode);
        return match ? { slug: f.slug, name: f.name, count: Number(match.count) } : null;
      }),
    );
    const otherStatesPromise = supabase.rpc('feature_state_counts', { p_filter_slug: feature.slug });

    const [allFilters, stateListingIds] = await Promise.all([
      getFilters(),
      getStateListingIds(stateCode),
    ]);

    const qualifiedIds = await filterByFilters(stateListingIds, [feature.slug], allFilters);

    const [count, paginated, featuresRaw, { data: statesData }] = await Promise.all([
      getStateListingCountFiltered(stateCode, qualifiedIds),
      getStateListingsPaginated(stateCode, currentPage, qualifiedIds),
      otherFeaturesPromise,
      otherStatesPromise,
    ]);

    totalCount = count;
    paginatedListings = paginated;
    otherFeaturesRaw = featuresRaw;
    otherStatesData = statesData as { state: string; count: number }[] | null;
  } catch (err) {
    console.error(`Feature state page error [${feature.slug}/${stateCode} p${currentPage}]:`, err);
    // Fall through with zero count → redirect below
  }

  // Not enough listings for a useful state page — redirect to the parent feature page
  // instead of returning 404, so Google receives a 301 and the indexed URL resolves cleanly.
  if (totalCount < 3) redirect(`/features/${feature.slug}`);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const page = Math.min(currentPage, totalPages);

  const otherFeatures = otherFeaturesRaw.filter((f): f is { slug: string; name: string; count: number } => f !== null && f.count >= 3);

  const otherStates = ((otherStatesData as { state: string; count: number }[]) ?? [])
    .filter((r) => r.state !== stateCode)
    .slice(0, 20)
    .map((r) => ({ code: r.state, name: getStateName(r.state), slug: getStateSlug(r.state), count: Number(r.count) }));

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE_URL}/features` },
      { '@type': 'ListItem', position: 3, name: feature.name, item: `${SITE_URL}/features/${feature.slug}` },
      { '@type': 'ListItem', position: 4, name: stateName, item: `${SITE_URL}/features/${feature.slug}/${params.state}` },
    ],
  };

  const faqItems = [
    {
      question: `How many touchless car washes with ${feature.name.toLowerCase()} are in ${stateName}?`,
      answer: `Our directory lists ${totalCount} verified touchless car wash${totalCount !== 1 ? 'es' : ''} with ${feature.name.toLowerCase()} in ${stateName}. Each listing is confirmed to offer brushless, touch-free washing.`,
    },
    ...feature.faqItems.map((item) => ({
      question: item.question,
      answer: typeof item.answer === 'function' ? item.answer(stateName, totalCount) : item.answer,
    })),
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  const baseHref = `/features/${feature.slug}/${params.state}`;

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/features" className="hover:text-white transition-colors">Features</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href={`/features/${feature.slug}`} className="hover:text-white transition-colors">{feature.name}</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{stateName}</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            {feature.stateTitle(stateName, totalCount)}
          </h1>
          <p className="text-white/70 text-lg">
            Verified touchless locations with {feature.name.toLowerCase()} in {stateName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto pt-8">

          <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-gray-700 text-base leading-relaxed">
              {feature.stateDescription(stateName, totalCount)}
            </p>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-sm px-3 py-1">
              {feature.name}
            </Badge>
            <Link
              href={`/state/${params.state}`}
              className="text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2"
            >
              View all touchless washes in {stateName} &rarr;
            </Link>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground mb-6">
              All Locations <span className="text-lg font-normal text-gray-400">({totalCount})</span>
              {totalPages > 1 && <span className="text-base font-normal text-gray-400 ml-2">&middot; Page {page} of {totalPages}</span>}
            </h2>
            {paginatedListings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    href={`/state/${params.state}/${slugify(listing.city)}/${listing.slug}`}
                  />
                ))}
              </div>
            ) : null}
            <Pagination
              currentPage={page}
              totalItems={totalCount}
              baseHref={baseHref}
            />
          </div>

          <section className="mt-14 pt-10 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Frequently Asked Questions
            </h2>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-2xl overflow-hidden bg-white">
              {faqItems.map((item, i) => (
                <details key={i} className="group bg-white">
                  <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none hover:bg-gray-50 transition-colors">
                    <span className="text-base font-semibold text-gray-900">{item.question}</span>
                    <span className="flex-shrink-0 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                  </summary>
                  <div className="px-6 pb-6 pt-1 text-gray-600 leading-relaxed text-sm">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {otherFeatures.length > 0 && (
            <div className="mt-14 pt-10 border-t border-gray-200">
              <h2 className="text-xl font-bold text-foreground mb-4">Other Features in {stateName}</h2>
              <div className="flex flex-wrap gap-2">
                {otherFeatures.map((f) => (
                  <Link
                    key={f.slug}
                    href={`/features/${f.slug}/${params.state}`}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium text-gray-700 transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {f.name} ({f.count})
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otherStates.length > 0 && (
            <div className="mt-8 pt-8 border-t border-gray-200">
              <h2 className="text-xl font-bold text-foreground mb-4">{feature.name} in Other States</h2>
              <div className="flex flex-wrap gap-2">
                {otherStates.map((s) => (
                  <Link
                    key={s.code}
                    href={`/features/${feature.slug}/${s.slug}`}
                    className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-sm font-medium text-gray-700 transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {s.name} ({s.count})
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
