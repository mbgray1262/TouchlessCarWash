import { cache } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { notFound, redirect } from 'next/navigation';
import {
  Star, MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft,
  Sparkles, ExternalLink, ChevronRight, Navigation, HelpCircle,
  CalendarCheck, ChevronDown, Droplet, CreditCard, Zap, MessageSquareQuote, Quote, Trophy
} from 'lucide-react';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import PhotoGalleryGrid from '@/components/PhotoGalleryGrid';
import SuggestEditModal from '@/components/SuggestEditModal';
import { TrackableLink } from '@/components/TrackableLink';
import { ListingBreadcrumb } from '@/components/ListingBreadcrumb';
import { WhyVisitSection } from '@/components/WhyVisitSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type Listing, type ReviewSnippet } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import type { Metadata } from 'next';

const ListingMap = dynamic(() => import('@/components/ListingMap'), { ssr: false });

export const revalidate = 86400; // Re-fetch listing data every 24 hours

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

/**
 * Try to find a listing whose slug starts with the requested slug.
 * Handles old short slugs (e.g. "rice-street-car-wash") that were later
 * replaced with longer address-based slugs.
 * Returns the canonical URL path for the matching listing, or null.
 */
async function findListingByPartialSlug(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('listings')
    .select('slug, city, state')
    .like('slug', `${slug}-%`)
    .eq('is_touchless', true)
    .limit(1);

  if (!data || data.length === 0) return null;

  const match = data[0];
  const matchStateSlug = slugify(
    US_STATES.find((s) => s.code === match.state)?.name ?? match.state,
  );
  const matchCitySlug = slugify(match.city);

  return `/state/${matchStateSlug}/${matchCitySlug}/${match.slug}`;
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

async function getReviewSnippets(listingId: string): Promise<ReviewSnippet[]> {
  const { data } = await supabase
    .from('review_snippets')
    .select('*')
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', true)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(50);

  return (data || []) as ReviewSnippet[];
}

// ── Best Of Rankings ──────────────────────────────────────────────────

interface BestOfRanking {
  metro_slug: string;
  metro_name: string;
  rank: number;
  score: number;
}

const getBestOfRankings = cache(async (listingId: string): Promise<BestOfRanking[]> => {
  const { data } = await supabase
    .from('best_of_rankings')
    .select('metro_slug, metro_name, rank, score')
    .eq('listing_id', listingId)
    .order('rank', { ascending: true });

  return (data || []) as BestOfRanking[];
});

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const listing = await getListing(params.slug);
  if (!listing) return { title: 'Listing Not Found' };

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : listing.state;
  const topAmenities = (listing.amenities || []).slice(0, 3).join(', ');
  const amenityPart = topAmenities ? ` Touch-free, brushless car wash offering ${topAmenities}.` : '';
  const canonicalUrl = `${SITE_URL}/state/${params.state}/${params.city}/${params.slug}`;
  const heroImage = listing.hero_image ?? listing.google_photo_url ?? listing.street_view_url ?? null;

  // Check for Best Of rankings (top 3 in a metro area)
  const rankings = await getBestOfRankings(listing.id);
  const topRanking = rankings.length > 0 ? rankings[0] : null; // Use the best (lowest) rank

  // Enhanced title for ranked listings: "#1 Best Touchless Car Wash in Houston, TX | Name"
  const title = topRanking
    ? `#${topRanking.rank} Best Touchless Car Wash in ${topRanking.metro_name} | ${listing.name}`
    : `${listing.name} | Touchless Car Wash in ${listing.city}, ${listing.state}`;
  const ogTitle = topRanking
    ? `#${topRanking.rank} Best Touchless Car Wash in ${topRanking.metro_name} | ${listing.name}`
    : `${listing.name} | Touchless Car Wash in ${listing.city}, ${stateName}`;

  // Lead with star rating for CTR — Google often shows this in snippet
  const ratingPrefix = listing.rating > 0
    ? `★ ${Number(listing.rating).toFixed(1)}${listing.review_count > 0 ? ` (${listing.review_count} reviews)` : ''} — `
    : '';
  const rankingPrefix = topRanking ? `#${topRanking.rank} Best Touchless Car Wash in ${topRanking.metro_name}. ` : '';
  const description = `${ratingPrefix}${rankingPrefix}${listing.name} at ${listing.address}, ${listing.city}, ${listing.state}.${amenityPart} Hours, directions & more.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      type: 'website',
      ...(heroImage ? { images: [{ url: heroImage, width: 1200, height: 630, alt: listing.name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
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

/** Hostnames configured in next.config.js remotePatterns — safe for next/image optimization. */
const OPTIMIZED_HOSTS = new Set([
  'gteqijdpqjmgxfnyuhvy.supabase.co',
  'res.cloudinary.com',
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'places.googleapis.com',
  'maps.googleapis.com',
]);

function isOptimizedImageHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Google Places photo URLs don't have file extensions — allow them explicitly
  if (lower.includes('places.googleapis.com') && lower.includes('/photos/')) return true;
  if (lower.includes('maps.googleapis.com')) return true;
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

/** Short 1-2 sentence description for the hero banner (line-clamped to 2 lines). */
function buildHeroDescription(listing: Listing): string {
  // Prefer google_description — it's naturally short (1-2 sentences from Google editorial summary)
  if (listing.google_description) return listing.google_description;

  // If we have a full description, extract just the first sentence for the hero
  if (listing.description) {
    const firstSentence = listing.description.split(/(?<=[.!?])\s+/)[0];
    if (firstSentence && firstSentence.length <= 200) return firstSentence;
    return listing.description.substring(0, 180).replace(/\s+\S*$/, '') + '…';
  }

  // Fallback: build from city/state and amenities
  const parts: string[] = [`Touchless, touch-free car wash in ${listing.city}, ${listing.state}`];
  const highlights = (listing.amenities || []).slice(0, 4);
  if (highlights.length > 0) {
    parts.push(`offering ${highlights.map((a) => a.toLowerCase()).join(', ')}, and more`);
  }
  return parts.join(' ') + '.';
}

const WASH_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  touchless_automatic: { label: 'Touchless Automatic', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

const BRAND_LABELS: Record<string, string> = {
  laserwash: 'LaserWash',
  pdq: 'PDQ',
  washworld: 'WashWorld',
  belanger: 'Belanger',
  istobal: 'Istobal',
  ryko: 'Ryko',
  petit: 'Petit',
  ds: 'D&S',
};

function buildLocalBusinessSchema(listing: Listing, canonicalUrl: string, hours: Record<string, string> | null, reviewSnippets: ReviewSnippet[] = [], rankings: BestOfRanking[] = []): object {
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

  // Add individual reviews from snippets for rich results
  if (reviewSnippets.length > 0) {
    schema.review = reviewSnippets.map((snippet) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: snippet.reviewer_name || 'Anonymous' },
      reviewBody: snippet.review_text,
      ...(snippet.rating ? { reviewRating: { '@type': 'Rating', ratingValue: snippet.rating, bestRating: 5 } } : {}),
      ...(snippet.iso_date ? { datePublished: snippet.iso_date } : {}),
    }));
  }

  // Add awards from Best Of rankings
  if (rankings.length > 0) {
    const year = new Date().getFullYear();
    schema.award = rankings.map(
      (r) => `#${r.rank} Best Touchless Car Wash in ${r.metro_name} (${year})`,
    );
  }

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

// Safely coerce extracted_data fields that may be a string instead of an array
function asArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return [val];
  return [];
}

function buildFAQs(listing: Listing, hours: Record<string, string> | null): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];

  // 1. Is this a touchless car wash? (always shown) — enriched with wash types & equipment
  let touchlessAnswer = `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a verified touchless (brushless) car wash — also known as a touch-free or no-touch wash — that cleans your vehicle using high-pressure water and detergents without physical contact.`;
  if (listing.touchless_wash_types && listing.touchless_wash_types.length > 0) {
    const typeLabels = listing.touchless_wash_types.map((wt) => WASH_TYPE_LABELS[wt]?.label || wt);
    touchlessAnswer += ` Wash types available: ${typeLabels.join(' and ')}.`;
  }
  if (listing.equipment_brand) {
    const brandLabel = listing.equipment_model || BRAND_LABELS[listing.equipment_brand] || listing.equipment_brand;
    touchlessAnswer += ` They use ${brandLabel} touchless wash equipment.`;
  }
  faqs.push({ q: `Is ${listing.name} a touchless car wash?`, a: touchlessAnswer });

  // 2. Hours (conditional)
  if (hours && Object.keys(hours).length > 0) {
    const todayKey = getTodayKey();
    const todayLabel = DAY_LABELS[todayKey];
    const todayHours = hours[todayKey];
    const hoursSummary = DAY_ORDER.filter((d) => hours[d]).map((d) => `${DAY_LABELS[d]}: ${hours[d]}`).join(' | ');
    let hoursNote = '';
    const hoursNotes = asArray(listing.extracted_data?.hours_notes);
    if (hoursNotes.length > 0) {
      hoursNote = ` Note: ${hoursNotes.join(' ')}`;
    }
    faqs.push({
      q: `What are the hours for ${listing.name}?`,
      a: `${listing.name} hours: ${hoursSummary}.${todayHours ? ` Today (${todayLabel}): ${todayHours}.` : ''}${hoursNote}`,
    });
  }

  // 3. Pricing (always shown) — enriched with membership plans
  let pricingAnswer = '';
  if (listing.wash_packages && listing.wash_packages.length > 0) {
    pricingAnswer = `Available wash packages: ${listing.wash_packages.map((p) => p.name + (p.price ? ` (${p.price})` : '')).join(', ')}.`;
  } else {
    pricingAnswer = `Pricing varies by wash package. ${listing.phone ? `Contact them at ${listing.phone} or visit` : 'Visit'} their website for current prices.`;
  }
  const membershipPlans = Array.isArray(listing.extracted_data?.membership_plans) ? listing.extracted_data!.membership_plans : [];
  if (membershipPlans.length > 0) {
    const planNames = membershipPlans.map((p) => p.name + (p.price ? ` (${p.price})` : '')).join(', ');
    pricingAnswer += ` Unlimited wash memberships are also available: ${planNames}.`;
  }
  faqs.push({ q: `How much does ${listing.name} cost?`, a: pricingAnswer });

  // 4. Membership plans (conditional — only if extracted)
  if (membershipPlans.length > 0) {
    const planDetails = membershipPlans.map((p) => {
      let detail = p.name;
      if (p.price) detail += ` at ${p.price}/month`;
      if (p.features && p.features.length > 0) detail += ` — includes ${p.features.slice(0, 3).join(', ')}`;
      return detail;
    }).join('; ');
    faqs.push({
      q: `Does ${listing.name} offer unlimited wash memberships?`,
      a: `Yes, ${listing.name} offers unlimited wash membership plans: ${planDetails}. Memberships provide great value for frequent washers.`,
    });
  }

  // 5. Amenities (conditional)
  if (listing.amenities && listing.amenities.length > 0) {
    faqs.push({
      q: `What amenities does ${listing.name} offer?`,
      a: `${listing.name} offers the following amenities: ${listing.amenities.join(', ')}.`,
    });
  }

  // 6. Equipment & technology (conditional)
  const tech = asArray(listing.extracted_data?.equipment_technology);
  if (listing.equipment_brand || tech.length > 0) {
    const brandLabel = listing.equipment_brand ? (BRAND_LABELS[listing.equipment_brand] || listing.equipment_brand) : null;
    const model = listing.equipment_model;
    let equipAnswer = `${listing.name} uses `;
    if (model) {
      equipAnswer += model;
    } else if (brandLabel) {
      equipAnswer += `${brandLabel} touchless wash equipment`;
    } else {
      equipAnswer += 'professional touchless wash equipment';
    }
    if (tech.length > 0) {
      equipAnswer += `, featuring ${tech.join(', ')}`;
    }
    equipAnswer += '. This touch-free technology ensures a scratch-free, brushless wash every time.';
    faqs.push({ q: `What equipment does ${listing.name} use?`, a: equipAnswer });
  }

  // 7. Service types (conditional — only if extracted)
  const serviceTypes = asArray(listing.extracted_data?.service_types);
  if (serviceTypes.length > 0) {
    faqs.push({
      q: `What types of car wash services does ${listing.name} offer?`,
      a: `${listing.name} offers the following services: ${serviceTypes.join(', ')}. All washes are touchless and touch-free — no brushes or cloth touch your vehicle.`,
    });
  }

  // 8. Payment methods (conditional — only if extracted)
  const paymentMethods = asArray(listing.extracted_data?.payment_methods);
  if (paymentMethods.length > 0) {
    faqs.push({
      q: `What payment methods does ${listing.name} accept?`,
      a: `${listing.name} accepts the following payment methods: ${paymentMethods.join(', ')}.`,
    });
  }

  // 9. Special features (conditional — only if extracted)
  const specialFeatures = asArray(listing.extracted_data?.special_features);
  if (specialFeatures.length > 0) {
    faqs.push({
      q: `What special features does ${listing.name} have?`,
      a: `${listing.name} offers these special features: ${specialFeatures.join(', ')}. These extras make it a standout among touchless car washes in ${listing.city}.`,
    });
  }

  // 10. Location (always shown)
  faqs.push({
    q: `Where is ${listing.name} located?`,
    a: `${listing.name} is located at ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}.${listing.phone ? ` Call them at ${listing.phone}.` : ''} Get directions via Google Maps.`,
  });

  return faqs;
}

function buildFAQSchema(listing: Listing, hours: Record<string, string> | null): object {
  const faqs = buildFAQs(listing, hours);
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
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

/**
 * Smart-truncate a review to ~maxLen chars, keeping the first keyword visible.
 * If the keyword is near the start the text is simply trimmed at the end.
 * If the keyword is buried deep, we trim from both sides and add ellipses.
 */
function smartTruncate(text: string, keywords: string[], maxLen = 280): string {
  if (text.length <= maxLen) return text;
  if (!keywords || keywords.length === 0) return text.slice(0, maxLen).trimEnd() + '…';

  // Find the earliest keyword match
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const match = pattern.exec(text);

  if (!match) return text.slice(0, maxLen).trimEnd() + '…';

  const kwStart = match.index;
  const kwEnd = kwStart + match[0].length;

  // If keyword is within the first maxLen chars, just truncate the end
  if (kwEnd <= maxLen - 20) {
    return text.slice(0, maxLen).trimEnd() + '…';
  }

  // Otherwise center a window around the keyword
  const padding = Math.floor((maxLen - match[0].length) / 2);
  let start = Math.max(0, kwStart - padding);
  let end = Math.min(text.length, kwEnd + padding);

  // Snap to word boundaries
  if (start > 0) {
    const spaceAfter = text.indexOf(' ', start);
    if (spaceAfter !== -1 && spaceAfter < start + 20) start = spaceAfter + 1;
  }
  if (end < text.length) {
    const spaceBefore = text.lastIndexOf(' ', end);
    if (spaceBefore > end - 20) end = spaceBefore;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

/** Highlight touchless keywords in review text with green accent. */
function HighlightedReviewText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords || keywords.length === 0) return <>{text}</>;

  // Build a regex that matches any keyword (case-insensitive)
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function ReviewSnippetCard({ snippet }: { snippet: ReviewSnippet }) {
  const displayText = smartTruncate(snippet.review_text, snippet.touchless_keywords);
  return (
    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex items-start gap-3">
        <Quote className="w-5 h-5 text-[#22C55E]/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">
            <HighlightedReviewText text={displayText} keywords={snippet.touchless_keywords} />
          </p>
          <div className="flex items-center gap-3 mt-2.5">
            {snippet.rating && snippet.rating > 0 && (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: snippet.rating }, (_, i) => (
                  <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                ))}
              </span>
            )}
            <span className="text-xs text-gray-500 font-medium">
              {snippet.reviewer_name || 'Anonymous'}
            </span>
            {snippet.review_date && (
              <span className="text-xs text-gray-400">{snippet.review_date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
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
        <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
          <Image src={thumb} alt={nearby.name} fill sizes="64px" className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized={!isOptimizedImageHost(thumb)} />
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
  const [listing] = await Promise.all([getListing(params.slug)]);

  if (!listing) {
    // Try to find a listing with a longer slug that starts with the requested slug.
    // This handles old short slugs (e.g. "rice-street-car-wash") that were replaced
    // with longer address-based slugs (e.g. "rice-street-car-wash-1736-rice-st-...").
    const redirectUrl = await findListingByPartialSlug(params.slug);
    if (redirectUrl) redirect(redirectUrl);
    notFound();
  }

  const [nearbyListings, reviewSnippets, rankings] = await Promise.all([
    getNearbyListings(listing),
    getReviewSnippets(listing.id),
    getBestOfRankings(listing.id),
  ]);

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
    ...(listing.google_photo_url ? [listing.google_photo_url] : []),
    ...(listing.street_view_url ? [listing.street_view_url] : []),
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
  const heroDescription = buildHeroDescription(listing);

  const canonicalUrl = `${SITE_URL}/state/${params.state}/${params.city}/${params.slug}`;

  const localBusinessSchema = buildLocalBusinessSchema(listing, canonicalUrl, hours, reviewSnippets, rankings);
  const breadcrumbItems = [
    { name: 'Home', url: SITE_URL },
    { name: 'States', url: `${SITE_URL}/states` },
    { name: stateName, url: `${SITE_URL}/state/${params.state}` },
    { name: cityName, url: `${SITE_URL}/state/${params.state}/${params.city}` },
    { name: listing.name, url: canonicalUrl },
  ];
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);
  const faqs = buildFAQs(listing, hours);
  const faqSchema = buildFAQSchema(listing, hours);

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
          {listing.review_count > 0 && <span className="text-white/60">({listing.review_count} reviews)</span>}
        </a>
      ) : (
        <>
          <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
          {listing.review_count > 0 && <span className="text-white/60">({listing.review_count} reviews)</span>}
        </>
      )}
    </span>
  ) : null;

  const topRanking = rankings.length > 0 ? rankings[0] : null;

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
            <>
              <div className="relative h-80 md:h-[26rem] overflow-hidden">
                <Image
                  src={heroImage}
                  alt={listing.name}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                  unoptimized={!isOptimizedImageHost(heroImage)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F2744] via-[#0F2744]/50 to-[#0F2744]/10" />
              </div>

              <div className="absolute inset-0 flex flex-col justify-end">
                <div className="container mx-auto px-4 max-w-5xl pb-8 pt-4">
                  <ListingBreadcrumb
                    listingName={listing.name}
                    stateSlug={params.state}
                    stateName={stateName}
                    citySlug={params.city}
                    cityName={cityName}
                    variant="hero"
                  />

                  <div className="flex items-start gap-4">
                    {logoImage && (
                      <LogoImage
                        src={logoImage}
                        alt={`${listing.name} logo`}
                        wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mt-1"
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
                        {topRanking && (
                          <Link href={`/best/${topRanking.metro_slug}`}>
                            <Badge className="bg-yellow-400 text-yellow-900 border-0 shadow-sm hover:bg-yellow-300 transition-colors">
                              <Trophy className="w-3 h-3 mr-1" />#{topRanking.rank} Best in {topRanking.metro_name}
                            </Badge>
                          </Link>
                        )}
                      </div>
                      <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/80 text-sm">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 shrink-0" />
                          {listing.address}, {listing.city}, {listing.state}
                        </span>
                        {ratingStars}
                        {topRanking && (
                          <Link href={`/badge/${listing.slug}`} className="flex items-center gap-1 text-yellow-300 hover:text-yellow-200 transition-colors font-medium">
                            <Trophy className="w-3.5 h-3.5" />
                            Claim Your Badge
                          </Link>
                        )}
                      </div>
                      <p className="mt-2.5 text-sm text-white/80 max-w-2xl leading-relaxed line-clamp-2">{heroDescription}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No-photo layout: clean gradient with content flowing naturally (no absolute overlay) */
            <HeroImageFallback variant="full" className="absolute inset-0" />
          )}

          {!heroImage && (
            <div className="relative">
              <div className="container mx-auto px-4 max-w-5xl py-8">
                <ListingBreadcrumb
                  listingName={listing.name}
                  stateSlug={params.state}
                  stateName={stateName}
                  citySlug={params.city}
                  cityName={cityName}
                  variant="hero"
                />

                <div className="flex items-start gap-4">
                  {logoImage && (
                    <LogoImage
                      src={logoImage}
                      alt={`${listing.name} logo`}
                      wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mt-1"
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
                      {topRanking && (
                        <Link href={`/best/${topRanking.metro_slug}`}>
                          <Badge className="bg-yellow-400 text-yellow-900 border-0 shadow-sm hover:bg-yellow-300 transition-colors">
                            <Trophy className="w-3 h-3 mr-1" />#{topRanking.rank} Best in {topRanking.metro_name}
                          </Badge>
                        </Link>
                      )}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/80 text-sm">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 shrink-0" />
                        {listing.address}, {listing.city}, {listing.state}
                      </span>
                      {ratingStars}
                      {topRanking && (
                        <Link href={`/badge/${listing.slug}`} className="flex items-center gap-1 text-yellow-300 hover:text-yellow-200 transition-colors font-medium">
                          <Trophy className="w-3.5 h-3.5" />
                          Claim Your Badge
                        </Link>
                      )}
                    </div>
                    <p className="mt-2.5 text-sm text-white/80 max-w-2xl leading-relaxed line-clamp-2">{heroDescription}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* AI-Generated Description */}
              {listing.description && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-3">About {listing.name}</h2>
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </div>
                </div>
              )}

              {/* Why Visit This Location */}
              <WhyVisitSection listing={listing} reviewSnippets={reviewSnippets} />

              {/* Wash Type & Equipment */}
              {((listing.touchless_wash_types && listing.touchless_wash_types.length > 0) || listing.equipment_brand) && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Droplet className="w-5 h-5 text-blue-500" />
                    Wash Type & Equipment
                  </h2>
                  {listing.touchless_wash_types && listing.touchless_wash_types.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {listing.touchless_wash_types.map((wt: string) => {
                        const info = WASH_TYPE_LABELS[wt] || { label: wt, color: 'bg-gray-100 text-gray-700 border-gray-200' };
                        return (
                          <Badge key={wt} className={`${info.color} border text-sm py-1 px-3`}>
                            {info.label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {listing.equipment_brand && (
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">Equipment: </span>
                      {listing.equipment_model || BRAND_LABELS[listing.equipment_brand] || listing.equipment_brand}
                    </div>
                  )}
                </div>
              )}

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

              {/* Membership Plans from extracted_data */}
              {Array.isArray(listing.extracted_data?.membership_plans) && listing.extracted_data!.membership_plans.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#22C55E]" />
                    Membership Plans
                  </h2>
                  <div className="space-y-3">
                    {listing.extracted_data!.membership_plans.map((plan, i) => (
                      <div key={i} className="p-3 rounded-lg bg-green-50 border border-green-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-semibold text-[#0F2744]">{plan.name}</div>
                            {plan.features && plan.features.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {plan.features.map((f, j) => (
                                  <li key={j} className="text-sm text-gray-600 flex items-start gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {plan.price && (
                            <span className="shrink-0 font-bold text-[#22C55E] text-lg">{plan.price}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Special Features & Payment Methods from extracted_data */}
              {listing.extracted_data && (asArray(listing.extracted_data.special_features).length > 0 || asArray(listing.extracted_data.payment_methods).length > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Additional Details
                  </h2>
                  {asArray(listing.extracted_data.special_features).length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">Special Features</h3>
                      <div className="flex flex-wrap gap-2">
                        {asArray(listing.extracted_data.special_features).map((f, i) => (
                          <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-amber-200 bg-amber-50 text-amber-800">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {asArray(listing.extracted_data.payment_methods).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">Payment Methods</h3>
                      <div className="flex flex-wrap gap-2">
                        {asArray(listing.extracted_data.payment_methods).map((pm, i) => (
                          <Badge key={i} variant="outline" className="text-sm py-1 px-3 border-gray-200 text-gray-700">
                            {pm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {galleryPhotos.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-lg font-bold text-[#0F2744] mb-4">Photos</h2>
                  <PhotoGalleryGrid photos={galleryPhotos} listingName={listing.name} />
                </div>
              )}

              {/* Touchless Sentiment — simple positive/negative/neutral badge */}
              {listing.touchless_sentiment && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
                  listing.touchless_sentiment === 'positive'
                    ? 'bg-green-50 border-green-200'
                    : listing.touchless_sentiment === 'negative'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <span className="text-lg">
                    {listing.touchless_sentiment === 'positive' ? '👍' : listing.touchless_sentiment === 'negative' ? '👎' : '➖'}
                  </span>
                  <div>
                    <span className={`text-sm font-semibold ${
                      listing.touchless_sentiment === 'positive'
                        ? 'text-green-700'
                        : listing.touchless_sentiment === 'negative'
                        ? 'text-red-700'
                        : 'text-gray-600'
                    }`}>
                      {listing.touchless_sentiment === 'positive'
                        ? 'Positive touchless reviews'
                        : listing.touchless_sentiment === 'negative'
                        ? 'Negative touchless reviews'
                        : 'Mixed touchless reviews'}
                    </span>
                    <p className="text-xs text-gray-400">Based on customer review analysis</p>
                  </div>
                </div>
              )}

              {/* Customer Review Snippets — touchless evidence from Google Reviews */}
              {reviewSnippets.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-[#0F2744] flex items-center gap-2">
                      <MessageSquareQuote className="w-5 h-5 text-[#22C55E]" />
                      What Customers Say About the Touchless Wash
                    </h2>
                    <span className="text-xs font-semibold text-[#22C55E] bg-green-50 border border-green-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                      {reviewSnippets.length} {reviewSnippets.length === 1 ? 'review' : 'reviews'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Real reviews from Google mentioning the touchless experience
                  </p>
                  <div className="relative">
                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                      {reviewSnippets.map((snippet) => (
                        <ReviewSnippetCard key={snippet.id} snippet={snippet} />
                      ))}
                    </div>
                    {reviewSnippets.length > 5 && (
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
                    )}
                  </div>
                  {reviewSnippets.length > 5 && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Scroll to see all {reviewSnippets.length} reviews
                    </p>
                  )}
                  {listing.google_place_id && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <a
                        href={`https://search.google.com/local/reviews?placeid=${listing.google_place_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#22C55E] hover:underline font-medium flex items-center gap-1.5"
                      >
                        Read all reviews on Google
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
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
                      <TrackableLink
                        href={`tel:${listing.phone}`}
                        listingId={listing.id}
                        eventType="phone"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {listing.phone}
                      </TrackableLink>
                    </div>
                  )}
                  {listing.website && (
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                      <TrackableLink
                        href={listing.website}
                        listingId={listing.id}
                        eventType="website"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate"
                      >
                        <span className="truncate">Visit Website</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </TrackableLink>
                    </div>
                  )}
                </div>

                {listing.latitude && listing.longitude && (
                  <TrackableLink
                    href={listing.google_place_id
                      ? `https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`
                      : `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`
                    }
                    listingId={listing.id}
                    eventType="directions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 w-full bg-[#22C55E] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#16A34A] transition-colors shadow-sm"
                  >
                    <Navigation className="w-4 h-4" />
                    Get Directions
                  </TrackableLink>
                )}
                <SuggestEditModal listingId={listing.id} listingName={listing.name} />
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
                  Explore all touchless and touch-free car washes in {stateName}
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
