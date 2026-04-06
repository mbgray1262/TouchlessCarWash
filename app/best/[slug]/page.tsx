import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Star, MapPin, Phone, Award, CheckCircle, ChevronRight, Trophy, MessageSquareQuote, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase, type Listing, type ReviewSnippet } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS, getMetroBySlug, boundingBox, haversineDistance, type MetroArea } from '@/lib/metro-areas';
import { scoreListing, type ScoredListing } from '@/lib/metro-scoring';
import { METRO_CONTENT, buildExpertGuide } from '@/lib/metro-content';
import { OpenStatusBadge } from '@/components/OpenStatusBadge';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import { DEFAULT_OG_IMAGE, ensureHttps } from '@/lib/seo';
import type { Metadata } from 'next';

// Revalidate every 5 minutes — keeps rankings and snippets fresh without hammering the DB
export const revalidate = 300;

interface BestOfPageProps {
  params: { slug: string };
}

// ── Columns we need for scoring + display ─────────────────────────────
const BEST_OF_COLUMNS =
  'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, street_view_url, logo_photo, google_logo_url, amenities, touchless_wash_types, extracted_data, hours, is_touchless, is_featured, latitude, longitude, touchless_sentiment';

// ── Data fetching ─────────────────────────────────────────────────────

const getMetroListings = cache(async (metro: MetroArea): Promise<Listing[]> => {
  const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);

  const { data, error } = await supabase
    .from('listings')
    .select(BEST_OF_COLUMNS)
    .eq('is_touchless', true)
    .gte('latitude', box.minLat)
    .lte('latitude', box.maxLat)
    .gte('longitude', box.minLng)
    .lte('longitude', box.maxLng)
    .order('rating', { ascending: false })
    .limit(1000);

  if (error || !data) return [];

  // Filter to precise radius using haversine
  return (data as Listing[]).filter((listing) => {
    if (listing.latitude == null || listing.longitude == null) return false;
    const dist = haversineDistance(metro.lat, metro.lng, listing.latitude, listing.longitude);
    return dist <= metro.radiusMiles;
  });
});

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

  const title = `${count} Best Touchless & Brushless Car Washes in ${metro.displayName}`;
  const description = `Discover the ${count} best-rated touchless & brushless car washes in ${metro.name}. Ranked by Google ratings, reviews, and verified touchless confirmation.`;

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
  if (!metro) notFound();

  const allListings = await getMetroListings(metro);
  if (allListings.length < 5) notFound();

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

  // Fetch review snippets for top listings
  const topIds = topListings.map((l) => l.id);
  const reviewSnippets = await getReviewSnippetsForListings(topIds);

  const nearbyMetros = getNearbyMetros(metro.slug);
  const year = new Date().getFullYear();
  const count = topListings.length;

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
              {count} Best Touchless & Brushless Car Washes in {metro.displayName} ({year})
            </h1>
            <p className="text-lg text-blue-100 leading-relaxed max-w-2xl mx-auto">
              Ranked by Google ratings, customer reviews, and verified touchless confirmation.
              Every listing is confirmed brushless — no risk to your paint.
            </p>
            <p className="text-sm text-blue-200/70 mt-4">
              {allListings.length} touchless car washes found within {metro.radiusMiles} miles of {metro.name}
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
        <section className="py-12 px-4 bg-white">
          <div className="container mx-auto max-w-4xl">
            <div className="space-y-6">
              {topListings.map((listing, idx) => {
                const rank = idx + 1;
                const snippet = reviewSnippets.get(listing.id);
                const touchlessCount = touchlessReviewCounts.get(listing.id) ?? 0;
                const rawCardImage = listing.hero_image ?? listing.google_photo_url ?? null;
                const cardImage = rawCardImage ? ensureHttps(rawCardImage) : null;
                const rawCardLogo = listing.logo_photo ?? listing.google_logo_url ?? null;
                const cardLogo = rawCardLogo ? ensureHttps(rawCardLogo) : null;
                const listingHref = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;

                return (
                  <Link key={listing.id} href={listingHref} className="group block">
                    <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-[#22C55E] transition-all duration-200">
                      <div className="flex flex-col md:flex-row">
                        {/* Rank + Image */}
                        <div className="relative md:w-72 shrink-0">
                          {cardImage ? (
                            <div className="relative h-52 md:h-full">
                              <Image
                                src={cardImage}
                                alt={listing.name}
                                fill
                                sizes="(max-width: 768px) 100vw, 288px"
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                unoptimized={!isOptimizedHost(cardImage)}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/30 to-transparent" />
                            </div>
                          ) : (
                            <div className="relative h-52 md:h-full">
                              <HeroImageFallback variant="card" className="h-full" />
                            </div>
                          )}
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
                              <h2 className="text-lg md:text-xl font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                                {listing.name}
                              </h2>
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
                );
              })}
            </div>
          </div>
        </section>

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
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-xl font-bold text-[#0F2744] mb-1">Quick Car Care After Your Wash</h2>
            <p className="text-xs text-gray-400 italic mb-6">
              This section contains affiliate links. As an Amazon Associate we earn from qualifying purchases — at no extra cost to you.
            </p>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-1">
                <a
                  href="https://www.amazon.com/dp/B06WVQ6MVR/?tag=touchlessfind-20"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0F2744] hover:underline shrink-0"
                >
                  Meguiar&apos;s Hybrid Ceramic Wax
                </a>
                <span className="text-gray-600 sm:ml-1">
                  <span className="text-yellow-500">&#11088; 4.7/5</span> — Spray on your wet car right after the touchless wash, rinse off, done. Ceramic protection with zero buffing.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1">
                <a
                  href="https://www.amazon.com/dp/B07G7DSF7C/?tag=touchlessfind-20"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0F2744] hover:underline shrink-0"
                >
                  Griot&apos;s Garage XL Microfiber Drying Towel
                </a>
                <span className="text-gray-600 sm:ml-1">
                  <span className="text-yellow-500">&#11088; 4.9/5</span> — Prevents water spots after the wash. Scratch-free and safe for ceramic coatings and PPF.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-1">
                <a
                  href="https://www.amazon.com/dp/B0B4PR1W7K/?tag=touchlessfind-20"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0F2744] hover:underline shrink-0"
                >
                  Chemical Guys Interior Cleaner Wipes
                </a>
                <span className="text-gray-600 sm:ml-1">
                  <span className="text-yellow-500">&#11088; 4.5/5</span> — Toss in the glovebox. Wipe down dash, seats, and trim while you wait in the car wash line.
                </span>
              </div>
            </div>
            <p className="mt-6 text-sm text-gray-500">
              See our full{' '}
              <Link href="/blog/recommended-products" className="text-[#0F2744] font-medium hover:underline">
                car care product guide →
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
