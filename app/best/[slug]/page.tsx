import { Fragment } from 'react';
import { permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { Star, MapPin, Phone, Award, CheckCircle, ChevronRight, Trophy, MessageSquareQuote, Sparkles, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase, type Listing, type ReviewSnippet } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS, getMetroBySlug, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { getMetroListings } from '@/lib/metro-queries';
import { scoreListing, type ScoredListing } from '@/lib/metro-scoring';
import { METRO_CONTENT, buildExpertGuide } from '@/lib/metro-content';
import { OpenStatusBadge } from '@/components/OpenStatusBadge';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import BestCardImage from '@/components/BestCardImage';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductSpotlight } from '@/components/ProductSpotlight';
import { DEFAULT_OG_IMAGE, ensureHttps } from '@/lib/seo';
import type { Metadata } from 'next';

// ISR: render on demand, cache at the Netlify edge for 1h (serve-stale-while-
// revalidate via netlify.toml). Replaces force-dynamic, which emitted `no-store`
// and made Netlify bypass the CDN cache on every request. The old
// "304-without-body" bug is prevented by the explicit Netlify-CDN-Cache-Control
// SWR headers in netlify.toml. Admin edits purge + pre-warm via /api/revalidate.
// [CANARY: validating before site-wide rollout]
export const revalidate = 3600;

interface BestOfPageProps {
  params: { slug: string };
}

// ── Data fetching ─────────────────────────────────────────────────────
// getMetroListings + the disliked-touchless filter now live in
// @/lib/metro-queries so the State page shares the exact same counts.

async function getTouchlessReviewCounts(listingIds: string[]): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();

  const { data } = await supabase
    .from('review_snippets')
    .select('listing_id')
    .in('listing_id', listingIds)
    .eq('is_touchless_evidence', true)
    .eq('sentiment', 'positive');

  const counts = new Map<string, number>();
  if (data) {
    for (const row of data) {
      counts.set(row.listing_id, (counts.get(row.listing_id) ?? 0) + 1);
    }
  }
  return counts;
}

function scoreSnippet(s: ReviewSnippet): number {
  let score = 0;
  score += (s.rating ?? 0) * 4;                          // 0–20: star rating is the strongest signal
  if (s.sentiment === 'positive') score += 15;            // big boost for positive sentiment
  else if (s.sentiment === 'negative') score -= 20;       // hard penalty for negative
  if (s.is_touchless_evidence) score += 8;               // prefer snippets that mention touchless
  score += Math.min(s.touchless_keywords?.length ?? 0, 4) * 2; // up to +8 for keyword density
  return score;
}

async function getReviewSnippetsForListings(listingIds: string[]): Promise<Map<string, ReviewSnippet>> {
  if (listingIds.length === 0) return new Map();

  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .in('listing_id', listingIds)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(listingIds.length * 15);

  const map = new Map<string, ReviewSnippet>();
  if (!data) return map;

  // Group by listing then pick the highest-scoring snippet for each
  const byListing = new Map<string, ReviewSnippet[]>();
  for (const s of data as ReviewSnippet[]) {
    const existing = byListing.get(s.listing_id) ?? [];
    existing.push(s);
    byListing.set(s.listing_id, existing);
  }

  for (const [listingId, candidates] of Array.from(byListing)) {
    const best = candidates.reduce((a, b) => scoreSnippet(a) >= scoreSnippet(b) ? a : b);
    map.set(listingId, best);
  }

  return map;
}

// ── Nearby metros for cross-linking ───────────────────────────────────

function getNearbyMetros(currentSlug: string, limit = 6): MetroArea[] {
  const current = getMetroBySlug(currentSlug);
  if (!current) return [];

  return METRO_AREAS
    .filter((m) => m.slug !== currentSlug)
    .map((m) => ({
      metro: m,
      distance: haversineDistance(current.lat, current.lng, m.lat, m.lng),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((m) => m.metro);
}

// ── Rank sync ─────────────────────────────────────────────────────────
// Keeps best_of_rankings in sync with the live-scored order so that the
// listing detail page badge ("#2 Best in Denver") always matches what
// is displayed on this page. Fire-and-forget — never blocks the render.

async function syncBestOfRankings(
  metroSlug: string,
  metroDisplayName: string,
  topListings: ScoredListing[],
): Promise<void> {
  // best_of_rankings has RLS that only allows the service role to write. If the
  // service-role key isn't present in this runtime (the case on Netlify), the
  // write would fall back to the anon key and be rejected by RLS on every
  // request — spamming the Postgres logs with "new row violates row-level
  // security policy". The compute-rankings edge function (real service role)
  // keeps this table fresh, so skip the redundant page-side sync rather than
  // hammering the DB with doomed anon writes.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    const now = new Date().toISOString();
    const rows = topListings.map((l, i) => ({
      listing_id: l.id,
      metro_slug: metroSlug,
      metro_name: metroDisplayName,
      rank: i + 1,
      score: l.score,
      computed_at: now,
    }));

    // Delete all existing entries for this metro, then insert the fresh top-10.
    // Simple and race-condition-safe: we only need accuracy for the ~10 rows
    // that power the badge chips on listing detail pages.
    await adminClient.from('best_of_rankings').delete().eq('metro_slug', metroSlug);
    await adminClient.from('best_of_rankings').insert(rows);
  } catch (err) {
    // Silently swallow — rank sync is best-effort and must never break the page.
    console.error('[best-of] rank sync failed for', metroSlug, err);
  }
}

// ── Static generation ─────────────────────────────────────────────────

export async function generateStaticParams() {
  // Generate pages for all metro areas — the page itself will notFound() if < 5 listings
  return METRO_AREAS.map((metro) => ({ slug: metro.slug }));
}

// ── Metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({ params }: BestOfPageProps): Promise<Metadata> {
  const metro = getMetroBySlug(params.slug);
  if (!metro) return { title: 'Not Found' };

  const listings = await getMetroListings(metro);
  const count = Math.min(listings.length, 10);
  const year = new Date().getFullYear();

  if (count < 5) return { title: 'Not Found' };

  const month = new Date().toLocaleString('default', { month: 'long' });
  // Concrete count + ranking signal + freshness date — three CTR levers
  // (specificity, authority, recency). Drop "& Brushless" to fit pixel
  // budget and lead with the count, which lifts CTR more than power
  // words alone.
  const title = `${count} Best Touchless Car Washes in the ${metro.name} Area — Ranked ${month} ${year}`;
  const description = `The ${count} top-rated touchless car washes across the greater ${metro.name} area, ranked by verified Google reviews, customer ratings, and touchless-evidence confirmation. Updated ${month} ${year}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://touchlesscarwashfinder.com/best/${metro.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://touchlesscarwashfinder.com/best/${metro.slug}`,
      type: 'website',
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

const OPTIMIZED_HOSTS = new Set([
  'gteqijdpqjmgxfnyuhvy.supabase.co',
  'res.cloudinary.com',
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'places.googleapis.com',
  'maps.googleapis.com',
]);

function isOptimizedHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function HighlightedReviewText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords || keywords.length === 0) return <>{text}</>;
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5 font-medium">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function getRankColor(rank: number): string {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900';
  if (rank === 2) return 'bg-gray-300 text-gray-800';
  if (rank === 3) return 'bg-amber-600 text-white';
  return 'bg-[#0F2744] text-white';
}

// ── Page component ────────────────────────────────────────────────────

export default async function BestOfMetroPage({ params }: BestOfPageProps) {
  const metro = getMetroBySlug(params.slug);
  // Unknown metro slug → 308 to /best index instead of hard 404.
  if (!metro) permanentRedirect('/best?from=unknown-metro');

  const allListings = await getMetroListings(metro);
  // Minimum 5 listings to make a meaningful "best-of" page — MUST match
  // generateMetadata's `count < 5` guard and getQualifyingMetros() (the set the
  // sitemap emits). When these drifted (component <3, metadata <5) metros with
  // 3-4 listings rendered a 200 with NO canonical and no noindex. Below the
  // threshold we 308 to the metro's primary state hub (clean redirect, not a
  // canonical-less thin page).
  if (allListings.length < 5) {
    // Send to the metro's primary state hub if available; else /best index.
    const primaryState = metro.states?.[0];
    const stateSlug = primaryState ? getStateSlug(primaryState) : null;
    permanentRedirect(stateSlug ? `/state/${stateSlug}?from=thin-metro` : '/best?from=thin-metro');
  }

  const listingIds = allListings.map((l) => l.id);
  const touchlessReviewCounts = await getTouchlessReviewCounts(listingIds);

  // Score and rank
  const scored: ScoredListing[] = allListings.map((listing) => ({
    ...listing,
    score: scoreListing(listing, {
      touchlessReviewCount: touchlessReviewCounts.get(listing.id) ?? 0,
    }),
    distanceMiles: listing.latitude != null && listing.longitude != null
      ? Math.round(haversineDistance(metro.lat, metro.lng, listing.latitude, listing.longitude) * 10) / 10
      : undefined,
  }));
  scored.sort((a, b) => b.score - a.score);
  const topListings = scored.slice(0, 10);

  // Keep best_of_rankings in sync so listing detail pages show the same
  // rank number as the position badge on this page. Fire-and-forget.
  void syncBestOfRankings(metro.slug, metro.displayName, topListings);

  // Fetch review snippets for top listings
  const topIds = topListings.map((l) => l.id);
  const reviewSnippets = await getReviewSnippetsForListings(topIds);

  const nearbyMetros = getNearbyMetros(metro.slug);
  const year = new Date().getFullYear();
  const count = topListings.length;

  // ── "At a Glance" summary stats ─────────────────────────────────────
  // Concise, factual, extractable-by-LLM summary of the metro.
  const ratedListings = topListings.filter((l) => l.rating && l.rating > 0);
  const avgTopRating = ratedListings.length > 0
    ? ratedListings.reduce((sum, l) => sum + Number(l.rating), 0) / ratedListings.length
    : 0;
  const topPick = topListings[0];

  const amenityCounts = new Map<string, number>();
  for (const listing of topListings) {
    for (const amenity of listing.amenities ?? []) {
      amenityCounts.set(amenity, (amenityCounts.get(amenity) ?? 0) + 1);
    }
  }
  const topAmenities = Array.from(amenityCounts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  // ── Group ALL area listings by city ─────────────────────────────────
  // Powers the "All N washes in the {metro} Area" directory below the
  // top-10 ranking. This is how every wash in the radius becomes reachable
  // (not just the top 10) AND how we cross-link from the metro view into
  // each individual city page. Trophies/ranks intentionally NOT shown here
  // — ranking is reserved for the top-10 list above.
  const cityGroups = (() => {
    const groups = new Map<
      string,
      { cityLabel: string; href: string; listings: Listing[] }
    >();
    for (const l of allListings) {
      if (!l.city || !l.state) continue;
      const key = `${slugify(l.city)}-${l.state}`;
      const existing = groups.get(key);
      if (existing) {
        existing.listings.push(l);
      } else {
        groups.set(key, {
          cityLabel: `${l.city}, ${l.state}`,
          href: `/state/${getStateSlug(l.state)}/${slugify(l.city)}`,
          listings: [l],
        });
      }
    }
    return Array.from(groups.values())
      .map((g) => ({
        ...g,
        // Within each city, sort by rating then review volume.
        listings: g.listings.sort((a, b) => {
          const r = (Number(b.rating) || 0) - (Number(a.rating) || 0);
          if (r !== 0) return r;
          return (b.review_count || 0) - (a.review_count || 0);
        }),
      }))
      // Most-populated cities first, then alphabetical.
      .sort((a, b) => {
        const c = b.listings.length - a.listings.length;
        if (c !== 0) return c;
        return a.cityLabel.localeCompare(b.cityLabel);
      });
  })();

  // Structured data — BreadcrumbList (mirrors visible breadcrumb)
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Best Of', item: 'https://touchlesscarwashfinder.com/best' },
      { '@type': 'ListItem', position: 3, name: metro.name, item: `https://touchlesscarwashfinder.com/best/${metro.slug}` },
    ],
  };

  // Structured data — ItemList for rankings
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${count} Best Touchless Car Washes in ${metro.displayName}`,
    description: `Top-rated touchless car washes in the ${metro.name} metro area, ranked by ratings, reviews, and verified touchless confirmation.`,
    numberOfItems: count,
    itemListElement: topListings.map((listing, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'AutoWash',
        name: listing.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: listing.address,
          addressLocality: listing.city,
          addressRegion: listing.state,
        },
        ...(listing.rating > 0 && listing.review_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: listing.rating, reviewCount: listing.review_count, bestRating: 5 } } : {}),
        url: `https://touchlesscarwashfinder.com/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`,
      },
    })),
  };

  // Structured data — FAQ for rich snippets
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How many touchless car washes are in the ${metro.name} area?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `We currently have ${allListings.length} verified touchless car washes within ${metro.radiusMiles} miles of ${metro.name}. This page highlights the top ${count} based on our ranking algorithm.`,
        },
      },
      ...(topListings[0] ? [{
        '@type': 'Question',
        name: `What is the highest-rated touchless car wash in ${metro.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${topListings[0].name} in ${topListings[0].city} is our #1 ranked touchless car wash in the ${metro.name} area${topListings[0].rating > 0 ? ` with a ${Number(topListings[0].rating).toFixed(1)}-star rating` : ''}${topListings[0].review_count > 0 ? ` based on ${topListings[0].review_count} Google reviews` : ''}.`,
        },
      }] : []),
      {
        '@type': 'Question',
        name: 'Are all these car washes truly touchless?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Every listing in our directory has been verified as genuinely touchless — no brushes, no cloth, no friction equipment. We cross-reference Google data, business websites, and customer reviews to confirm.',
        },
      },
      {
        '@type': 'Question',
        name: 'What should I do to protect my paint after a touchless car wash?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'After a touchless wash, applying a quick spray wax or detailer adds a hydrophobic layer that repels water and dirt between visits. A quality microfiber drying towel removes water spots without scratching. See our full car care product guide at touchlesscarwashfinder.com/blog/recommended-products.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main>
        {/* Hero */}
        <section className="bg-[#0F2744] text-white py-16 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <p className="text-[#22C55E] text-sm font-semibold uppercase tracking-widest">
                Best Touchless Car Washes
              </p>
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
              {count} Best Touchless & Brushless Car Washes in the {metro.name} Area ({year})
            </h1>
            <p className="text-lg text-blue-100 leading-relaxed max-w-2xl mx-auto">
              Ranked by Google ratings, customer reviews, and verified touchless confirmation.
              Every listing is confirmed brushless — no risk to your paint.
            </p>
            <p className="text-sm text-blue-200/70 mt-4">
              Covering {allListings.length} touchless car washes across the greater {metro.name} metro — within {metro.radiusMiles} miles of the city center.
            </p>
          </div>
        </section>

        {/* Breadcrumb */}
        <div className="bg-gray-50 border-b border-gray-200 py-3 px-4">
          <div className="container mx-auto max-w-4xl">
            <nav className="flex items-center gap-1.5 text-sm text-gray-500">
              <Link href="/" className="hover:text-[#22C55E]">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link href="/best" className="hover:text-[#22C55E]">Best Of</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-gray-900 font-medium">{metro.name}</span>
            </nav>
          </div>
        </div>

        {/* At a Glance — concise, LLM-extractable summary */}
        <section className="py-8 px-4 bg-white border-b border-gray-100" aria-labelledby="at-a-glance-heading">
          <div className="container mx-auto max-w-3xl">
            <div className="bg-gradient-to-br from-[#F0F9FF] to-[#ECFDF5] rounded-2xl border border-[#22C55E]/20 p-6">
              <h2 id="at-a-glance-heading" className="text-sm font-semibold text-[#0F2744] uppercase tracking-widest mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                At a Glance
              </h2>
              <p className="text-gray-800 text-[15px] leading-relaxed mb-4">
                The <strong>greater {metro.name} area</strong> has <strong>{allListings.length} verified touchless car wash{allListings.length === 1 ? '' : 'es'}</strong> within {metro.radiusMiles} miles of the city center, spread across {cityGroups.length} {cityGroups.length === 1 ? 'city' : 'cities'}.
                {topPick && (
                  <>
                    {' '}The top-ranked wash is <strong>{topPick.name}</strong> in {topPick.city}, {topPick.state}
                    {topPick.rating > 0 && ` (${Number(topPick.rating).toFixed(1)} stars${topPick.review_count > 0 ? `, ${topPick.review_count.toLocaleString()} reviews` : ''})`}.
                  </>
                )}
                {avgTopRating > 0 && (
                  <> The top {count} locations average <strong>{avgTopRating.toFixed(1)} stars</strong>.</>
                )}
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">Verified Washes</dt>
                  <dd className="font-bold text-[#0F2744] text-lg">{allListings.length}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">Ranked Here</dt>
                  <dd className="font-bold text-[#0F2744] text-lg">{count}</dd>
                </div>
                {avgTopRating > 0 && (
                  <div>
                    <dt className="text-gray-500 text-xs uppercase tracking-wide">Avg Rating</dt>
                    <dd className="font-bold text-[#0F2744] text-lg">{avgTopRating.toFixed(1)} ★</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 text-xs uppercase tracking-wide">Search Radius</dt>
                  <dd className="font-bold text-[#0F2744] text-lg">{metro.radiusMiles} mi</dd>
                </div>
              </dl>
              {topAmenities.length > 0 && (
                <p className="text-sm text-gray-600 mt-4">
                  <span className="font-semibold text-[#0F2744]">Common amenities:</span>{' '}
                  {topAmenities.join(' · ')}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Every listing is confirmed brushless — no cloth, no friction, no risk to your paint. Rankings use Google ratings, review volume, and verified touchless review evidence.
              </p>
            </div>
          </div>
        </section>

        {/* Expert Guide — unique editorial content per metro */}
        {METRO_CONTENT[metro.slug] && (() => {
          const guideParas = buildExpertGuide(metro.name, METRO_CONTENT[metro.slug], topListings.length);
          return (
            <section className="py-10 px-4 bg-white border-b border-gray-100">
              <div className="container mx-auto max-w-3xl">
                <h2 className="text-xl font-bold text-[#0F2744] mb-4">
                  Expert Guide: Touchless Car Washes in {metro.name}
                </h2>
                <div className="space-y-3 text-gray-700 text-[15px] leading-relaxed">
                  {guideParas.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {/* Ranked Listings */}
        <section className="py-12 px-4 bg-white" aria-labelledby="ranked-listings-heading">
          <div className="container mx-auto max-w-4xl">
            <h2 id="ranked-listings-heading" className="text-2xl font-bold text-[#0F2744] mb-2">
              Top {count} Touchless Car Washes in the {metro.name} Area
            </h2>
            <p className="text-gray-500 mb-6">
              Our highest-ranked picks from across the metro. Looking for washes in one
              specific town? Jump to the{' '}
              <a href="#all-area-washes" className="text-[#0F2744] font-medium hover:underline">
                full city-by-city list
              </a>{' '}
              below.
            </p>
            <div className="space-y-6">
              {topListings.map((listing, idx) => {
                const rank = idx + 1;
                const snippet = reviewSnippets.get(listing.id);
                const touchlessCount = touchlessReviewCounts.get(listing.id) ?? 0;
                const rawCardImage = listing.hero_image ?? listing.google_photo_url ?? listing.street_view_url ?? null;
                const cardImage = rawCardImage ? ensureHttps(rawCardImage) : null;
                const rawCardLogo = listing.logo_photo ?? listing.google_logo_url ?? null;
                const cardLogo = rawCardLogo ? ensureHttps(rawCardLogo) : null;
                const listingHref = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;

                return (
                  <Fragment key={listing.id}>
                  <Link href={listingHref} className="group block">
                    <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-[#22C55E] transition-all duration-200">
                      <div className="flex flex-col md:flex-row">
                        {/* Rank + Image */}
                        <div className="relative md:w-72 shrink-0">
                          <BestCardImage src={cardImage} alt={listing.name} />
                          {/* Rank badge */}
                          <div className={`absolute top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg ${getRankColor(rank)}`}>
                            {rank}
                          </div>
                          {/* Logo */}
                          {cardLogo && (
                            <LogoImage
                              src={cardLogo}
                              alt={`${listing.name} logo`}
                              wrapperClassName="absolute top-3 right-3 w-8 h-8 rounded-lg overflow-hidden bg-white/90 p-0.5 shadow"
                              className="w-full h-full object-contain"
                            />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-5 md:p-6 flex flex-col">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <h3 className="text-lg md:text-xl font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                                {listing.name}
                              </h3>
                              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>{listing.city}, {listing.state}</span>
                                {listing.distanceMiles != null && (
                                  <span className="text-gray-400">· {listing.distanceMiles} mi</span>
                                )}
                              </div>
                            </div>
                            {listing.rating > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                                <span className="font-bold text-[#0F2744]">{Number(listing.rating).toFixed(1)}</span>
                                {listing.review_count > 0 && (
                                  <span className="text-gray-400 text-sm">({listing.review_count})</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Address + Phone row */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
                            <span>{listing.address}</span>
                            {listing.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {listing.phone}
                              </span>
                            )}
                          </div>

                          {/* Paint-Safe Verified chip */}
                          {listing.paint_safe_verified && (
                            <div className="mb-3">
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Paint-Safe Verified
                              </span>
                            </div>
                          )}

                          {/* Amenity badges */}
                          {listing.amenities && listing.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {listing.amenities.slice(0, 4).map((a) => (
                                <Badge key={a} variant="outline" className="text-xs text-gray-600 border-gray-200">
                                  {a}
                                </Badge>
                              ))}
                              {listing.amenities.length > 4 && (
                                <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                                  +{listing.amenities.length - 4} more
                                </Badge>
                              )}
                            </div>
                          )}

                          {/* Touchless review count */}
                          {touchlessCount > 0 && (
                            <p className={`text-xs font-medium mb-3 flex items-center gap-1.5 ${
                              listing.touchless_sentiment === 'negative' ? 'text-red-500' : 'text-green-600'
                            }`}>
                              {listing.touchless_sentiment === 'negative' ? '👎' : '👍'}
                              {touchlessCount} customer{touchlessCount !== 1 ? 's' : ''} rate the touchless experience positively
                            </p>
                          )}

                          {/* Review snippet */}
                          {snippet && (
                            <div className="mt-auto pt-3 border-t border-gray-100">
                              <div className="flex items-start gap-2">
                                <MessageSquareQuote className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                                <div className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                                  <HighlightedReviewText
                                    text={snippet.review_text}
                                    keywords={snippet.touchless_keywords}
                                  />
                                </div>
                              </div>
                              {snippet.reviewer_name && (
                                <p className="text-xs text-gray-400 mt-1 ml-6">
                                  — {snippet.reviewer_name}
                                </p>
                              )}
                            </div>
                          )}

                          <OpenStatusBadge hours={listing.hours} className="mt-2" />
                        </div>
                      </div>
                    </article>
                  </Link>
                  {idx === 2 && (
                    <ProductSpotlight
                      productId="swift-touchless-shampoo"
                      eyebrow="Editor Pick"
                    />
                  )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </section>

        {/* All washes in the area, grouped by city */}
        {cityGroups.length > 0 && (
          <section id="all-area-washes" className="py-12 px-4 bg-gray-50 border-t border-gray-100 scroll-mt-4" aria-labelledby="all-area-heading">
            <div className="container mx-auto max-w-4xl">
              <h2 id="all-area-heading" className="text-2xl font-bold text-[#0F2744] mb-2">
                All {allListings.length} Touchless Car Washes in the {metro.name} Area
              </h2>
              <p className="text-gray-500 mb-8">
                Every verified touchless wash within {metro.radiusMiles} miles of {metro.name}, organized by city.
                Tap a city name to see only the washes in that town, or tap any wash for full details.
              </p>

              {/* Jump-to-city chips */}
              <div className="flex flex-wrap gap-2 mb-8">
                {cityGroups.map((g) => (
                  <Link
                    key={g.href}
                    href={g.href}
                    className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-sm text-[#0F2744] hover:border-[#22C55E] hover:text-[#22C55E] transition-colors"
                  >
                    {g.cityLabel.split(',')[0]}
                    <span className="text-gray-400">{g.listings.length}</span>
                  </Link>
                ))}
              </div>

              <div className="space-y-8">
                {cityGroups.map((g) => (
                  <div key={g.href}>
                    <div className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-gray-200">
                      <Link
                        href={g.href}
                        className="text-lg font-bold text-[#0F2744] hover:text-[#22C55E] transition-colors inline-flex items-center gap-1 group"
                      >
                        {g.cityLabel}
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#22C55E] transition-colors" />
                      </Link>
                      <span className="text-sm text-gray-400 shrink-0">
                        {g.listings.length} wash{g.listings.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                      {g.listings.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={`/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`}
                            className="flex items-center justify-between gap-2 py-2 text-[15px] text-gray-700 hover:text-[#22C55E] transition-colors border-b border-gray-100"
                          >
                            <span className="truncate">{l.name}</span>
                            {Number(l.rating) > 0 && (
                              <span className="flex items-center gap-1 shrink-0 text-sm text-gray-500">
                                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                {Number(l.rating).toFixed(1)}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How We Rank */}
        <section className="py-14 px-4 bg-gray-50">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-4">How We Rank</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Our ranking algorithm combines multiple signals to surface the best touchless car
              washes in each metro area. Unlike simple star-rating sorts, we factor in:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <h3 className="font-semibold text-[#0F2744]">Google Ratings</h3>
                </div>
                <p className="text-sm text-gray-600">Higher-rated locations rank above lower-rated ones, weighted as the strongest quality signal.</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquareQuote className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-[#0F2744]">Review Volume</h3>
                </div>
                <p className="text-sm text-gray-600">More reviews mean more trust. A 4.5 with 200 reviews outranks a 4.5 with 10 reviews.</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-[#22C55E]" />
                  <h3 className="font-semibold text-[#0F2744]">Touchless Confirmation</h3>
                </div>
                <p className="text-sm text-gray-600">Locations with customer reviews specifically mentioning touchless experience get a ranking boost.</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-green-500" />
                  <h3 className="font-semibold text-[#0F2744]">Customer Sentiment</h3>
                </div>
                <p className="text-sm text-gray-600">AI analysis of recent reviews identifies quality themes and generates a sentiment score that refines our rankings.</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5 text-purple-500" />
                  <h3 className="font-semibold text-[#0F2744]">Listing Completeness</h3>
                </div>
                <p className="text-sm text-gray-600">Locations with photos, hours, contact info, and amenities listed rank higher than sparse listings.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 px-4 bg-white">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[#0F2744] mb-1">
                  How many touchless car washes are in the {metro.name} area?
                </h3>
                <p className="text-gray-600">
                  We currently have {allListings.length} verified touchless car washes within {metro.radiusMiles} miles
                  of {metro.name}. This page highlights the top {count} based on our ranking algorithm.
                </p>
              </div>
              {topListings[0] && (
                <div>
                  <h3 className="font-semibold text-[#0F2744] mb-1">
                    What is the highest-rated touchless car wash in {metro.name}?
                  </h3>
                  <p className="text-gray-600">
                    {topListings[0].name} in {topListings[0].city} is our #1 ranked touchless car wash in the {metro.name} area
                    {topListings[0].rating > 0 && ` with a ${Number(topListings[0].rating).toFixed(1)}-star rating`}
                    {topListings[0].review_count > 0 && ` based on ${topListings[0].review_count} Google reviews`}.
                  </p>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-[#0F2744] mb-1">
                  Are all these car washes truly touchless?
                </h3>
                <p className="text-gray-600">
                  Yes. Every listing in our directory has been verified as genuinely touchless — no brushes, no cloth,
                  no friction equipment. We cross-reference Google data, business websites, and customer reviews to confirm.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-[#0F2744] mb-1">
                  How often is this ranking updated?
                </h3>
                <p className="text-gray-600">
                  Rankings are recalculated with each site update. Google ratings, review counts, and touchless
                  verification data are refreshed regularly to keep the rankings current.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-[#0F2744] mb-1">
                  What should I do to protect my paint after a touchless car wash?
                </h3>
                <p className="text-gray-600">
                  After a touchless wash, applying a quick spray wax or detailer adds a hydrophobic layer that repels water and dirt between visits. A quality microfiber drying towel removes water spots without scratching. See our full{' '}
                  <Link href="/blog/recommended-products" className="text-[#0F2744] font-medium hover:underline">
                    Car Care Products We Recommend →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Nearby Metros */}
        {nearbyMetros.length > 0 && (
          <section className="py-14 px-4 bg-gray-50">
            <div className="container mx-auto max-w-4xl">
              <h2 className="text-2xl font-bold text-[#0F2744] mb-6">
                Explore Other Metro Areas
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {nearbyMetros.map((m) => (
                  <Link
                    key={m.slug}
                    href={`/best/${m.slug}`}
                    className="bg-white rounded-xl p-5 border border-gray-200 hover:border-[#22C55E] hover:shadow-md transition-all group"
                  >
                    <h3 className="font-semibold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                      {m.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {m.displayName}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="py-16 px-4 bg-[#0F2744]">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-3">
              Own a Touchless Car Wash in {metro.name}?
            </h2>
            <p className="text-blue-200 mb-6">
              Get listed for free and reach car owners actively searching for a verified touchless wash in your area.
            </p>
            <Link
              href="/add-listing"
              className="inline-block bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Get Listed for Free
            </Link>
          </div>
        </section>

        {/* Affiliate Products */}
        <section className="py-12 px-4 bg-gray-50 border-t border-gray-200">
          <div className="container mx-auto max-w-6xl">
            <ProductGrid preset="metroBest" variant="card" bg="transparent" />
          </div>
        </section>
      </main>
    </>
  );
}
