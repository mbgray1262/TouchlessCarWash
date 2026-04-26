import { MapPin, Sparkles, Clock, CreditCard, MessageSquareQuote, Wrench } from 'lucide-react';
import type { Listing, ReviewSnippet } from '@/lib/supabase';

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

/**
 * Normalize an extracted_data field to a string[] — strings pass through;
 * objects shaped like {name, details, options} get reduced to their `name`
 * so we don't render a raw object as a React child. Anything else is dropped.
 */
function asArray(val: unknown): string[] {
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

/**
 * Detect if the listing operates 24/7 based on hours data.
 */
function is24Hours(hours: Record<string, string> | null | undefined): boolean {
  if (!hours) return false;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.every((day) => {
    const val = hours[day];
    if (!val) return false;
    const lower = val.toLowerCase();
    return lower.includes('24') || lower.includes('open 24') || lower === '12:00 am - 11:59 pm' || lower === '12:00am-11:59pm';
  });
}

/**
 * Format an amenity slug into a readable label.
 * e.g. "free_vacuum" → "free vacuum", "tire_shine" → "tire shine"
 */
function formatAmenity(amenity: string): string {
  return amenity
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toLowerCase());
}

interface WhyVisitSectionProps {
  listing: Listing;
  reviewSnippets: ReviewSnippet[];
}

/**
 * Dynamic "Why Visit This Location" section for individual listing pages.
 * Composes descriptive prose from the listing's available data fields.
 * Only renders if at least 2 meaningful sentences can be generated.
 */
export function WhyVisitSection({ listing, reviewSnippets }: WhyVisitSectionProps) {
  const highlights: string[] = [];

  // 1. Equipment highlight
  if (listing.equipment_model) {
    highlights.push(
      `${listing.name} features ${listing.equipment_model} touchless wash technology, which uses high-pressure water jets and specially formulated detergents to clean your vehicle without any physical contact.`
    );
  } else if (listing.equipment_brand) {
    const brandLabel = BRAND_LABELS[listing.equipment_brand] || listing.equipment_brand;
    highlights.push(
      `This location uses ${brandLabel} touchless wash equipment, delivering a scratch-free clean with high-pressure water and advanced chemical solutions — no brushes or cloth ever touch your vehicle.`
    );
  }

  // 2. 24/7 access highlight
  const hours = listing.hours as Record<string, string> | null | undefined;
  if (is24Hours(hours)) {
    highlights.push(
      'Open 24 hours a day, 7 days a week, you can get your car washed whenever it fits your schedule — early morning, late night, or weekend.'
    );
  }

  // 3. Wash packages / pricing highlight
  const packages = listing.wash_packages as Array<{ name: string; price?: string | number; description?: string }> | null | undefined;
  if (packages && packages.length > 0) {
    const prices = packages
      .map((p) => {
        if (!p.price) return null;
        const num = typeof p.price === 'string' ? parseFloat(p.price.replace(/[^0-9.]/g, '')) : p.price;
        return isNaN(num) ? null : num;
      })
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);

    if (prices.length > 0) {
      const membershipPlans = asArray((listing.extracted_data as Record<string, unknown> | null)?.membership_plans);
      const membershipNote = membershipPlans.length > 0
        ? ' Unlimited wash memberships are also available for frequent visitors.'
        : '';
      highlights.push(
        `With ${packages.length} wash package${packages.length !== 1 ? 's' : ''} starting at $${prices[0].toFixed(2)}, there's an option for every budget.${membershipNote}`
      );
    }
  }

  // 4. Unique selling points (from extracted_data — exists in DB but not rendered elsewhere)
  const usps = asArray((listing.extracted_data as Record<string, unknown> | null)?.unique_selling_points);
  if (usps.length > 0) {
    const formattedUsps = usps.slice(0, 4).join('. ');
    highlights.push(
      `What sets ${listing.name} apart: ${formattedUsps}.`
    );
  }

  // 5. Amenities narrative
  if (listing.amenities && listing.amenities.length > 0) {
    const formatted = listing.amenities.slice(0, 5).map(formatAmenity);
    if (formatted.length > 1) {
      const last = formatted.pop();
      highlights.push(
        `Additional amenities include ${formatted.join(', ')}, and ${last}.`
      );
    } else if (formatted.length === 1) {
      highlights.push(`This location also offers ${formatted[0]}.`);
    }
  }

  // 6. Customer review evidence
  if (reviewSnippets.length > 0) {
    const plural = reviewSnippets.length !== 1;
    highlights.push(
      `${reviewSnippets.length} Google reviewer${plural ? 's' : ''} specifically mention${plural ? '' : 's'} the touchless experience at this location, confirming it as a verified touch-free wash.`
    );
  }

  // Only render if we have at least 2 meaningful highlights
  if (highlights.length < 2) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-[#0F2744] mb-3 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-[#22C55E]" />
        Why Visit {listing.name}
      </h2>
      <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
        {highlights.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}
