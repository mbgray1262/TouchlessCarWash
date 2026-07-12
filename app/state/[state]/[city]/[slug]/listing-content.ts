/**
 * Pure content builders for the listing detail page: JSON-LD schema, FAQs,
 * hours/label constants, and small parsing helpers. No JSX, no data fetching.
 */
import { type Listing, type ReviewSnippet } from '@/lib/supabase';
import { streetAddress } from '@/lib/utils';
import { getChainBrandImage } from '@/lib/chain-brand-images';
import { earnsTrophy } from '@/lib/metro-scoring';
import { getBrandLabel } from '@/lib/equipment-data';
import { isSelfServeOnly } from '@/lib/self-serve';
import { isRealCustomerSnippet, type BestOfRanking } from './listing-data';

export const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export function getTodayKey(): string {
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

export function isOptimizedImageHost(url: string): boolean {
  try {
    return OPTIMIZED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function isImageUrl(url: string): boolean {
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

export const WASH_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  touchless_automatic: { label: 'Touchless Automatic', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

export function buildLocalBusinessSchema(listing: Listing, canonicalUrl: string, hours: Record<string, string> | null, reviewSnippets: ReviewSnippet[] = [], rankings: BestOfRanking[] = []): object {
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

  const chainBrandImageSchema = listing.hero_image_source !== 'manual'
    ? getChainBrandImage(listing.parent_chain, listing.id) : null;
  const heroImage = chainBrandImageSchema ?? listing.hero_image ?? listing.google_photo_url ?? null;
  if (heroImage) schema.image = heroImage;
  if (listing.price_range) schema.priceRange = listing.price_range;
  if (listing.website) schema.sameAs = listing.website;

  // Add individual reviews from snippets for rich results
  // Only include reviews when aggregateRating is also present — Google requires
  // aggregateRating whenever multiple Review objects are present, otherwise it
  // flags the structured data as invalid.
  const schemaSnippets = reviewSnippets.filter(isRealCustomerSnippet);
  if (schemaSnippets.length > 0 && schema.aggregateRating) {
    schema.review = schemaSnippets.map((snippet) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: snippet.reviewer_name || 'Anonymous' },
      reviewBody: snippet.review_text,
      ...(snippet.rating ? { reviewRating: { '@type': 'Rating', ratingValue: snippet.rating, bestRating: 5 } } : {}),
      ...(snippet.iso_date ? { datePublished: snippet.iso_date } : {}),
    }));
  }

  // Add awards from Best Of rankings — only when this wash's own Touchless
  // Satisfaction Score earns the trophy (see earnsTrophy). A ranked-but-mediocre
  // wash keeps its /best listing but makes no "#N Best" award claim in schema.
  if (rankings.length > 0 && earnsTrophy(listing)) {
    const year = new Date().getFullYear();
    schema.award = rankings.map(
      (r) => `#${r.rank} Best Touchless Car Wash in ${r.metro_name} (${year})`,
    );
  }

  return schema;
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]): object {
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
/**
 * Normalize an extracted_data field to a string[] — strings pass through;
 * objects shaped like {name, details, options} (some listings have these
 * for special_features / amenities_detailed) get reduced to their `name`
 * so we don't render a raw object as a React child and crash the page.
 * Anything else is dropped.
 */
export function asArray(val: unknown): string[] {
  const toStr = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() ? v : null;
    if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') {
      const name = (v as { name: string }).name;
      return name.trim() ? name : null;
    }
    return null;
  };
  if (Array.isArray(val)) {
    return val.map(toStr).filter((s): s is string => s !== null);
  }
  const single = toStr(val);
  return single ? [single] : [];
}

function parsePrice(raw: unknown): number | null {
  const m = String(raw ?? '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Pull only monthly-priced unlimited/membership plans for the savings calculator.
export function monthlyMemberships(listing: Listing): { name: string; price: number }[] {
  const plans = Array.isArray(listing.extracted_data?.membership_plans)
    ? listing.extracted_data!.membership_plans
    : [];
  return plans
    .filter((p) => /month|\/mo\b|monthly/i.test(String(p.price ?? '')))
    .map((p) => ({ name: p.name, price: parsePrice(p.price) }))
    .filter((p): p is { name: string; price: number } => p.price !== null && p.price < 200)
    .slice(0, 8);
}

// Representative single-wash price (median of priced wash packages) to pre-fill
// the calculator; falls back to a neutral $15 the user can edit.
export function defaultWashPrice(listing: Listing): number {
  const prices = (listing.wash_packages || [])
    .map((p) => parsePrice(p.price))
    .filter((n): n is number => n !== null && n < 100)
    .sort((a, b) => a - b);
  if (prices.length === 0) return 15;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return Math.round(median);
}

export function buildFAQs(listing: Listing, hours: Record<string, string> | null): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];
  // Self-serve-only listings share this template but must not wear any of its
  // touchless/brushless/paint-safe branding — flip the wash-type-specific copy
  // to self-serve wording. Mixed (also-touchless) listings keep touchless copy.
  const selfServe = isSelfServeOnly(listing);

  // 1. Wash-type identity (always shown) — enriched with wash types & equipment
  if (selfServe) {
    let ssAnswer = `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a self-serve (self-service) car wash — an open-bay facility where you wash your own vehicle using a high-pressure wand and foaming brush that you control. Pull into an open bay, pay by coin, card, or app, and wash on your own schedule at your own pace.`;
    if (listing.amenities && listing.amenities.length > 0) {
      ssAnswer += ` On-site you'll find ${listing.amenities.slice(0, 4).join(', ')}.`;
    }
    faqs.push({ q: `Is ${listing.name} a self-serve car wash?`, a: ssAnswer });
  } else {
    let touchlessAnswer = `Yes, ${listing.name} in ${listing.city}, ${listing.state} is a verified touchless (brushless) car wash — also known as a touch-free or no-touch wash — that cleans your vehicle using high-pressure water and detergents without physical contact.`;
    if (listing.touchless_wash_types && listing.touchless_wash_types.length > 0) {
      const typeLabels = listing.touchless_wash_types.map((wt) => WASH_TYPE_LABELS[wt]?.label || wt);
      touchlessAnswer += ` Wash types available: ${typeLabels.join(' and ')}.`;
    }
    if (listing.equipment_brand) {
      const brandLabel = listing.equipment_model || getBrandLabel(listing.equipment_brand) || listing.equipment_brand;
      touchlessAnswer += ` They use ${brandLabel} touchless wash equipment.`;
    }
    faqs.push({ q: `Is ${listing.name} a touchless car wash?`, a: touchlessAnswer });
  }

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
    const brandLabel = listing.equipment_brand ? (getBrandLabel(listing.equipment_brand) || listing.equipment_brand) : null;
    const model = listing.equipment_model;
    let equipAnswer = `${listing.name} uses `;
    if (model) {
      equipAnswer += model;
    } else if (brandLabel) {
      equipAnswer += selfServe ? `${brandLabel} wash equipment` : `${brandLabel} touchless wash equipment`;
    } else {
      equipAnswer += selfServe ? 'professional self-serve wash-bay equipment' : 'professional touchless wash equipment';
    }
    if (tech.length > 0) {
      equipAnswer += `, featuring ${tech.join(', ')}`;
    }
    equipAnswer += selfServe
      ? '. You control the high-pressure wand yourself, so you decide exactly how your vehicle is cleaned.'
      : '. This touch-free technology ensures a scratch-free, brushless wash every time.';
    faqs.push({ q: `What equipment does ${listing.name} use?`, a: equipAnswer });
  }

  // 7. Service types (conditional — only if extracted)
  const serviceTypes = asArray(listing.extracted_data?.service_types);
  if (serviceTypes.length > 0) {
    faqs.push({
      q: `What types of car wash services does ${listing.name} offer?`,
      a: selfServe
        ? `${listing.name} offers the following services: ${serviceTypes.join(', ')}. Choose your wash settings at the bay and clean your vehicle at your own pace.`
        : `${listing.name} offers the following services: ${serviceTypes.join(', ')}. All washes are touchless and touch-free — no brushes or cloth touch your vehicle.`,
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
      a: `${listing.name} offers these special features: ${specialFeatures.join(', ')}. These extras make it a standout among ${selfServe ? 'self-serve' : 'touchless'} car washes in ${listing.city}.`,
    });
  }

  // 10. Safe for luxury vehicles (always shown — high-value ad keyword content)
  faqs.push({
    q: `Is ${listing.name} safe for Tesla, BMW, and luxury vehicles?`,
    a: selfServe
      ? `Yes. At ${listing.name} you wash your own vehicle with a high-pressure wand you control — no automated spinning brushes or cloth strips ever touch your paint. That hands-on control makes a self-serve bay a popular choice for owners of Tesla Model 3, Model Y, and Model S, BMW, Mercedes-Benz, Lexus, Audi, Porsche, Range Rover, and Genesis, and for cars with ceramic coatings, paint protection film (PPF), or vinyl wraps — you decide exactly how each panel is cleaned and rinsed.`
      : `Yes. ${listing.name} is a touchless car wash, meaning no brushes or cloth ever contact your vehicle. This makes it the safest automated wash option for luxury and high-end vehicles including Tesla Model 3, Model Y, and Model S, BMW, Mercedes-Benz, Lexus, Audi, Porsche, Range Rover, and Genesis. Touchless washes are also recommended by auto detailing professionals for cars with ceramic coatings, paint protection film (PPF), vinyl wraps, or any premium paint finish.`,
  });

  // 11. Location (always shown)
  faqs.push({
    q: `Where is ${listing.name} located?`,
    a: `${listing.name} is located at ${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}.${listing.phone ? ` Call them at ${listing.phone}.` : ''} Get directions via Google Maps.`,
  });

  return faqs;
}

export function buildFAQSchema(listing: Listing, hours: Record<string, string> | null): object {
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
