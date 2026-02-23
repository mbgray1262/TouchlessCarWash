import Link from 'next/link';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import {
  Star, MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft,
  Sparkles, ExternalLink, ChevronRight, Navigation, HelpCircle,
  CalendarCheck, ChevronDown
} from 'lucide-react';
import LogoImage from '@/components/LogoImage';
import PhotoGalleryGrid from '@/components/PhotoGalleryGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import type { Metadata } from 'next';

const ListingMap = dynamic(() => import('@/components/ListingMap'), { ssr: false });

const SITE_URL = 'https://touchlesscarwashfinder.com';

interface ListingPageProps {
  params: {
    state: string;
    city: string;
    slug: string;
  };
}

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

function unslugCity(citySlug: string): string {
  return citySlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function getListing(slug: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('slug', slug)
    .eq('is_touchless', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as Listing;
}

async function getNearbyListings(listing: Listing, limit = 6): Promise<Listing[]> {
  const { data } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, rating, review_count, address, hero_image, google_photo_url, street_view_url, latitude, longitude')
    .eq('is_touchless', true)
    .eq('state', listing.state)
    .neq('id', listing.id)
    .order('review_count', { ascending: false })
    .limit(limit * 3);

  if (!data || data.length === 0) return [];

  const cityMatches = data.filter((l) => l.city === listing.city);
  const otherCity = data.filter((l) => l.city !== listing.city);
  const combined = [...cityMatches, ...otherCity].slice(0, limit);
  return combined as Listing[];
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const listing = await getListing(params.slug);
  if (!listing) return { title: 'Listing Not Found' };

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : listing.state;
  const topAmenities = (listing.amenities || []).slice(0, 3).join(', ');
  const ratingPart = listing.rating > 0 ? `Rated ${Number(listing.rating).toFixed(1)}` : '';
  const reviewPart = listing.review_count > 0 ? ` (${listing.review_count} reviews)` : '';
  const amenityPart = topAmenities ? `. Touchless automatic car wash offering ${topAmenities}` : '';
  const canonicalUrl = `${SITE_URL}/state/${params.state}/${params.city}/${params.slug}`;
  const heroImage = listing.hero_image ?? listing.google_photo_url ?? listing.street_view_url ?? null;

  const title = `${listing.name} - Touchless Car Wash in ${listing.city}, ${stateName} | Touchless Car Wash Finder`;
  const description = `${listing.name} at ${listing.address}, ${listing.city}, ${stateName}. ${ratingPart}${reviewPart}${amenityPart}. Hours, directions, photos & more.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      ...(heroImage ? { images: [{ url: heroImage, width: 1200, height: 630, alt: listing.name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(heroImage ? { images: [heroImage] } : {}),
    },
  };
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
}

function isImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/) !== null &&
    !lower.includes('icon') &&
    !lower.includes('logo') &&
    !lower.includes('favicon')
  );
}

function parseTimeToMinutes(timeStr: string): number | null {
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2] || '0', 10);
  const period = match[3];
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return hours * 60 + mins;
}

function getOpenStatus(hours: Record<string, string> | null): 'open' | 'closed' | null {
  if (!hours) return null;
  const todayKey = getTodayKey();
  const todayHours = hours[todayKey];
  if (!todayHours) return 'closed';
  if (todayHours.toLowerCase().includes('24') || todayHours.toLowerCase().includes('open 24')) return 'open';
  const parts = todayHours.split(/[-–]/);
  if (parts.length !== 2) return null;
  const openMins = parseTimeToMinutes(parts[0].trim());
  const closeMins = parseTimeToMinutes(parts[1].trim());
  if (openMins === null || closeMins === null) return null;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  if (closeMins < openMins) {
    return currentMins >= openMins || currentMins < closeMins ? 'open' : 'closed';
  }
  return currentMins >= openMins && currentMins < closeMins ? 'open' : 'closed';
}

function buildDescription(listing: Listing): string {
  if (listing.google_description) return listing.google_description;
  const parts: string[] = [`Touchless automatic car wash in ${listing.city}, ${listing.state}`];
  const highlights = (listing.amenities || []).slice(0, 4);
  if (highlights.length > 0) {
    parts.push(`offering ${highlights.map((a) => a.toLowerCase()).join(', ')}, and more`);
  }
  return parts.join(' ') + '.';
}

function buildLocalBusinessSchema(listing: Listing, canonicalUrl: string, hours: Record<string, string> | null): object {
  const hoursSpec = hours
    ? DAY_ORDER.filter((d) => hours[d]).map((day) => {
        const val = hours[day];
        const parts = val.split(/[-–]/);
        if (val.toLowerCase().includes('24')) {
          return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`, opens: '00:00', closes: '23:59' };
        }
        if (parts.length === 2) {
          return { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`, opens: convertTo24h(parts[0].trim()), closes: convertTo24h(parts[1].trim()) };
        }
        return null;
      }).filter(Boolean)
    : [];

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoWash',
    name: listing.name,
    url: canonicalUrl,
    telephone: listing.phone ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.address,
      addressLocality: listing.city,
      addressRegion: listing.state,
      postalCode: listing.zip,
      addressCountry: 'US',
    },
  };

  if (listing.latitude && listing.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: listing.latitude,
      longitude: listing.longitude,
    };
  }

  if (hoursSpec.length > 0) schema.openingHoursSpecification = hoursSpec;

  if (listing.rating > 0 && listing.review_count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(listing.rating).toFixed(1),
      reviewCount: listing.review_count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const heroImage = listing.hero_image ?? listing.google_photo_url ?? null;
  if (heroImage) schema.image = heroImage;
  if (listing.price_range) schema.priceRange = listing.price_range;
  if (listing.website) schema.sameAs = listing.website;

  return schema;
}

function buildBreadcrumbSchema(items: { name: string; url: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function buildFAQSchema(listing: Listing, hours: Record<string, string> | null): object {
  const faqs: { question: string; answer: string }[] = [];

  faqs.push({
    question: `Is ${listing.name} a touchless car wash?`,
    answer: `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a verified touchless (brushless) car wash that cleans your vehicle using high-pressure water and detergents without physical contact.`,
  });

  if (hours && Object.keys(hours).length > 0) {
    const todayKey = getTodayKey();
    const todayLabel = DAY_LABELS[todayKey];
    const todayHours = hours[todayKey];
    const hoursSummary = DAY_ORDER.filter((d) => hours[d]).map((d) => `${DAY_LABELS[d]}: ${hours[d]}`).join(', ');
    faqs.push({
      question: `What are the hours for ${listing.name}?`,
      answer: `${listing.name} is open: ${hoursSummary}.${todayHours ? ` Today (${todayLabel}): ${todayHours}.` : ''}`,
    });
  }

  if (listing.amenities && listing.amenities.length > 0) {
    faqs.push({
      question: `What amenities does ${listing.name} offer?`,
      answer: `${listing.name} offers the following amenities: ${listing.amenities.join(', ')}.`,
    });
  }

  faqs.push({
    question: `Where is ${listing.name} located?`,
    answer: `${listing.name} is located at ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}. Get directions via Google Maps.`,
  });

  faqs.push({
    question: `How much does ${listing.name} cost?`,
    answer: `Pricing varies by wash package${listing.wash_packages && listing.wash_packages.length > 0 ? `. Available packages include: ${listing.wash_packages.map((p) => p.name + (p.price ? ` (${p.price})` : '')).join(', ')}` : ''}. ${listing.phone ? `Contact them at ${listing.phone} or visit` : 'Visit'} their website for current prices.`,
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function convertTo24h(timeStr: string): string {
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return '00:00';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2] || '0', 10);
  const period = match[3];
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const stars = Array.from({ length: 5 }, (_, i) => {
    if (i < full) return 'full';
    if (i === full && half) return 'half';
    return 'empty';
  });
  return (
    <span className="flex items-center gap-0.5">
      {stars.map((type, i) => (
        <span key={i} className="relative inline-block w-4 h-4">
          <Star className="w-4 h-4 text-gray-300 fill-gray-300 absolute inset-0" />
          {type === 'full' && (
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 absolute inset-0" />
          )}
          {type === 'half' && (
            <span className="absolute inset-0 overflow-hidden w-[50%]">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function NearbyListingCard({ nearby, stateSlug }: { nearby: Listing; stateSlug: string }) {
  const citySlug = slugify(nearby.city);
  const thumb = nearby.hero_image ?? nearby.google_photo_url ?? nearby.street_view_url ?? null;
  return (
    <Link
      href={`/state/${stateSlug}/${citySlug}/${nearby.slug}`}
      className="group flex gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-[#22C55E] hover:shadow-sm transition-all"
    >
      {thumb && (
        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
          <img src={thumb} alt={nearby.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#0F2744] text-sm leading-tight group-hover:text-[#22C55E] transition-colors truncate">{nearby.name}</div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{nearby.city}, {nearby.state}</div>
        {nearby.rating > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-semibold text-gray-700">{Number(nearby.rating).toFixed(1)}</span>
            {nearby.review_count > 0 && <span className="text-xs text-gray-400">({nearby.review_count})</span>}
          </div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#22C55E] shrink-0 self-center transition-colors" />
    </Link>
  );
}

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const [listing, ] = await Promise.all([getListing(params.slug)]);

  if (!listing) notFound();

  const nearbyListings = await getNearbyListings(listing);

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : '';
  const cityName = unslugCity(params.city);
  const todayKey = getTodayKey();

  const heroImage = listing.hero_image ?? listing.google_photo_url ?? listing.street_view_url ?? null;
  const logoImage = listing.logo_photo ?? listing.google_logo_url ?? null;

  const seenUrls = new Set<string>();
  const allGalleryPhotos: string[] = [];
  const candidatePhotos = [
    ...(heroImage ? [heroImage] : []),
    ...(listing.photos || []),
  ];
  for (const p of candidatePhotos) {
    if (p && isImageUrl(p) && p !== logoImage && !seenUrls.has(p)) {
      seenUrls.add(p);
      allGalleryPhotos.push(p);
    }
  }

  const galleryPhotos = allGalleryPhotos.slice(0, 8);
  const hours = listing.hours as Record<string, string> | null;
  const openStatus = getOpenStatus(hours);
  const description = buildDescription(listing);

  const canonicalUrl = `${SITE_URL}/state/${params.state}/${params.city}/${params.slug}`;

  const localBusinessSchema = buildLocalBusinessSchema(listing, canonicalUrl, hours);
  const breadcrumbItems = [
    { name: 'Home', url: SITE_URL },
    { name: 'States', url: `${SITE_URL}/states` },
    { name: stateName, url: `${SITE_URL}/state/${params.state}` },
    { name: cityName, url: `${SITE_URL}/state/${params.state}/${params.city}` },
    { name: listing.name, url: canonicalUrl },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);
  const faqSchema = buildFAQSchema(listing, hours);

  const faqs = [
    {
      q: `Is ${listing.name} a touchless car wash?`,
      a: `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a verified touchless (brushless) car wash that cleans your vehicle using high-pressure water and detergents without physical contact.`,
    },
    ...(hours && Object.keys(hours).length > 0 ? [{
      q: `What are the hours for ${listing.name}?`,
      a: DAY_ORDER.filter((d) => hours[d]).map((d) => `${DAY_LABELS[d]}: ${hours[d]}`).join(' | '),
    }] : []),
    ...(listing.amenities && listing.amenities.length > 0 ? [{
      q: `What amenities does ${listing.name} offer?`,
      a: listing.amenities.join(', '),
    }] : []),
    {
      q: `Where is ${listing.name} located?`,
      a: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
    },
    {
      q: `How much does ${listing.name} cost?`,
      a: listing.wash_packages && listing.wash_packages.length > 0
        ? listing.wash_packages.map((p) => p.name + (p.price ? ` — ${p.price}` : '')).join(', ')
        : `Pricing varies by wash package. ${listing.phone ? `Contact them at ${listing.phone}` : 'Visit their website'} for current prices.`,
    },
  ];

  const lastVerified = listing.created_at
    ? new Date(listing.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const ratingStars = listing.rating > 0 ? (
    <span className="flex items-center gap-1.5">
      <StarRating rating={listing.rating} />
      {listing.google_place_id ? (
        <a
          href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:underline underline-offset-2 decoration-white/40 transition-all"
        >
          <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
          <span className="text-white/60">({listing.review_count} reviews)</span>
        </a>
      ) : (
        <>
          <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
          <span className="text-white/60">({listing.review_count} reviews)</span>
        </>
      )}
    </span>
  ) : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="relative bg-[#0F2744]">
          {heroImage ? (
            <div className="relative h-80 md:h-[26rem] overflow-hidden">
              <img
                src={heroImage}
                alt={listing.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F2744] via-[#0F2744]/50 to-[#0F2744]/10" />
            </div>
          ) : (
            <div className="h-36 md:h-48" />
          )}

          <div className="absolute inset-0 flex flex-col justify-end">
            <div className="container mx-auto px-4 max-w-5xl pb-8 pt-4">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
                <Link href="/" className="hover:text-white transition-colors">Home</Link>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <Link href="/states" className="hover:text-white transition-colors">States</Link>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <Link href={`/state/${params.state}`} className="hover:text-white transition-colors">{stateName}</Link>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <Link href={`/state/${params.state}/${params.city}`} className="hover:text-white transition-colors">{cityName}</Link>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <span className="text-white/80 truncate">{listing.name}</span>
              </nav>

              <div className="flex items-end gap-4">
                {logoImage && (
                  <LogoImage
                    src={logoImage}
                    alt={`${listing.name} logo`}
                    wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mb-0.5"
                    className="w-full h-full object-contain"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge className="bg-[#22C55E] text-white border-0 shadow-sm">
                      <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                    </Badge>
                    {listing.is_featured && (
                      <Badge className="bg-amber-400 text-amber-900 border-0">Featured</Badge>
                    )}
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/80 text-sm">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0" />
                      {listing.address}, {listing.city}, {listing.state}
                    </span>
                    {ratingStars}
                  </div>
                  <p className="mt-2.5 text-sm text-white/65 max-w-2xl leading-relaxed">{description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {listing.amenities && listing.amenities.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#22C55E]" />
                    Amenities & Features
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {listing.amenities.map((a: string) => (
                      <Badge key={a} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {listing.wash_packages && listing.wash_packages.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4">Wash Packages</h2>
                  <div className="space-y-3">
                    {listing.wash_packages.map((pkg, i) => (
                      <div key={i} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex-1">
                          <div className="font-semibold text-[#0F2744]">{pkg.name}</div>
                          {pkg.description && <p className="text-sm text-gray-600 mt-0.5">{pkg.description}</p>}
                        </div>
                        {pkg.price && (
                          <span className="shrink-0 font-bold text-[#22C55E] text-lg">{pkg.price}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {galleryPhotos.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4">Photos</h2>
                  <PhotoGalleryGrid photos={galleryPhotos} listingName={listing.name} />
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-[#0F2744] mb-5 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-[#22C55E]" />
                  Frequently Asked Questions
                </h2>
                <div className="space-y-3">
                  {faqs.map((faq, i) => (
                    <details key={i} className="group border border-gray-200 rounded-xl overflow-hidden">
                      <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none bg-gray-50 hover:bg-gray-100 transition-colors">
                        <span className="text-sm font-semibold text-[#0F2744]">{faq.q}</span>
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed border-t border-gray-100">
                        {faq.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4">Contact & Info</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-gray-700">
                      <div>{listing.address}</div>
                      <div>{listing.city}, {listing.state} {listing.zip}</div>
                    </div>
                  </div>
                  {listing.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <a href={`tel:${listing.phone}`} className="text-sm text-blue-600 hover:underline">
                        {listing.phone}
                      </a>
                    </div>
                  )}
                  {listing.website && (
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                      <a
                        href={listing.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate"
                      >
                        <span className="truncate">Visit Website</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>

                {listing.latitude && listing.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full bg-[#22C55E] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#16A34A] transition-colors shadow-sm"
                  >
                    <Navigation className="w-4 h-4" />
                    Get Directions
                  </a>
                )}
              </div>

              {listing.latitude && listing.longitude && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <ListingMap
                    lat={parseFloat(String(listing.latitude))}
                    lng={parseFloat(String(listing.longitude))}
                    name={listing.name}
                    address={`${listing.address}, ${listing.city}, ${listing.state}`}
                  />
                </div>
              )}

              {hours && Object.keys(hours).length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Hours of Operation
                    {openStatus === 'open' && (
                      <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Open Now
                      </span>
                    )}
                    {openStatus === 'closed' && (
                      <span className="ml-auto text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        Closed
                      </span>
                    )}
                  </h2>
                  <div className="space-y-1.5">
                    {DAY_ORDER.filter((d) => hours[d]).map((day) => (
                      <div
                        key={day}
                        className={`flex justify-between text-sm py-1.5 px-2 rounded-lg ${day === todayKey ? 'bg-[#22C55E]/10 font-semibold text-[#0F2744]' : 'text-gray-600'}`}
                      >
                        <span className="capitalize">{DAY_LABELS[day]}</span>
                        <span>{hours[day]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button asChild variant="outline" className="w-full">
                <Link href={`/state/${params.state}/${params.city}`}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  More in {cityName}
                </Link>
              </Button>
            </div>
          </div>

          {nearbyListings.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-[#0F2744]">
                  Other Touchless Car Washes Near {cityName}
                </h2>
                <Link
                  href={`/state/${params.state}/${params.city}`}
                  className="text-sm text-[#22C55E] hover:underline font-medium"
                >
                  View all in {cityName}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {nearbyListings.map((nearby) => (
                  <NearbyListingCard key={nearby.id} nearby={nearby} stateSlug={params.state} />
                ))}
              </div>
              <div className="mt-6 pt-5 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-gray-500">
                  Explore all touchless car washes in {stateName}
                </p>
                <Link
                  href={`/state/${params.state}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2744] hover:text-[#22C55E] transition-colors"
                >
                  Browse more in {stateName}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}

          {lastVerified && (
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-400">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Last verified: {lastVerified}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
