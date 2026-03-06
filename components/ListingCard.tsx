'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, MapPin, Phone, CheckCircle, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Listing } from '@/lib/supabase';
import { getStateSlug } from '@/lib/constants';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import { OpenStatusBadge } from '@/components/OpenStatusBadge';

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

interface ListingCardProps {
  listing: Listing;
  href?: string;
  showVerifiedBadge?: boolean;
  distance?: number; // miles, e.g. 4.2
}

const WASH_TYPE_LABELS: Record<string, string> = {
  touchless_automatic: 'Touchless Automatic',
  self_serve_spray: 'Self-Serve Spray',
};

export function ListingCard({ listing, href, showVerifiedBadge = false, distance }: ListingCardProps) {
  const defaultHref = `/state/${getStateSlug(listing.state)}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`;
  const linkHref = href ?? defaultHref;

  // Prefer touchless_wash_types, fallback to amenity-based inference
  const washTypeLabel = listing.touchless_wash_types && listing.touchless_wash_types.length > 0
    ? listing.touchless_wash_types.map(wt => WASH_TYPE_LABELS[wt] || wt).join(' · ')
    : null;

  const washType = washTypeLabel ?? listing.amenities?.find((a) =>
    /touchless automatic|automatic wash|touchless\/automatic/i.test(a)
  ) ?? listing.amenities?.find((a) =>
    /automatic|tunnel|self.serve|express/i.test(a)
  );

  // Don't use street_view_url as card image — often returns 403 and looks broken
  const cardImage = listing.hero_image ?? listing.google_photo_url ?? null;
  const cardLogo = listing.logo_photo ?? listing.google_logo_url ?? null;
  const [imgError, setImgError] = useState(false);

  return (
    <Link href={linkHref} className="group block h-full">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-[#22C55E] transition-all duration-200 h-full flex flex-col">
        {cardImage && !imgError ? (
          <div className="relative h-48 overflow-hidden shrink-0">
            <Image
              src={cardImage}
              alt={listing.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized={!isOptimizedImageHost(cardImage)}
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {cardLogo && (
              <LogoImage
                src={cardLogo}
                alt=""
                wrapperClassName="absolute top-2.5 left-2.5 w-8 h-8 rounded-lg overflow-hidden bg-white/90 p-0.5 shadow"
                className="w-full h-full object-contain"
              />
            )}
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
              {showVerifiedBadge ? (
                <Badge className="bg-[#22C55E] text-white border-0 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                </Badge>
              ) : washType ? (
                <Badge className="bg-[#0F2744]/80 text-white border-0 text-xs backdrop-blur-sm">
                  {washType}
                </Badge>
              ) : <span />}
              {listing.rating > 0 && (
                <div className="flex items-center gap-1 bg-black/60 rounded-full px-2.5 py-1 ml-auto">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-white font-semibold text-sm">{Number(listing.rating).toFixed(1)}</span>
                  {listing.review_count > 0 && <span className="text-white/70 text-xs">({listing.review_count})</span>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative h-48 shrink-0">
            <HeroImageFallback variant="card" className="h-48" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
              {showVerifiedBadge ? (
                <Badge className="bg-[#22C55E] text-white border-0 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                </Badge>
              ) : washType ? (
                <Badge className="bg-[#0F2744]/80 text-white border-0 text-xs backdrop-blur-sm">
                  {washType}
                </Badge>
              ) : <span />}
              {listing.rating > 0 && (
                <div className="flex items-center gap-1 bg-black/60 rounded-full px-2.5 py-1 ml-auto">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-white font-semibold text-sm">{Number(listing.rating).toFixed(1)}</span>
                  {listing.review_count > 0 && <span className="text-white/70 text-xs">({listing.review_count})</span>}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="text-base font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors leading-tight">
              {listing.name}
            </h2>
          </div>

          <div className="flex items-start gap-1.5 text-sm text-gray-500 mb-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{listing.address}</span>
          </div>

          {distance != null && (
            <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium mb-1">
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{distance} mi away</span>
            </div>
          )}

          {listing.phone && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{listing.phone}</span>
            </div>
          )}

          <OpenStatusBadge hours={listing.hours} className="mb-3" />

          {(() => {
            // Build feature badges from extracted_data highlights + amenities
            const badges: string[] = [];
            const ed = listing.extracted_data;
            if (ed?.membership_plans?.length) badges.push('membership program');
            if (ed?.special_features) {
              for (const f of ed.special_features) {
                const fl = f.toLowerCase();
                if (fl.includes('free vacuum') && !badges.includes('free vacuum')) badges.push('free vacuum');
                if (fl.includes('ceramic') && !badges.includes('ceramic coating')) badges.push('ceramic coating');
                if ((fl.includes('mobile') || fl.includes('app')) && !badges.includes('mobile pay')) badges.push('mobile pay');
              }
            }
            // Fill remaining slots from amenities
            const remaining = 4 - badges.length;
            if (remaining > 0 && listing.amenities?.length) {
              for (const a of listing.amenities) {
                if (badges.length >= 4) break;
                const al = a.toLowerCase();
                if (!badges.some(b => b.toLowerCase() === al)) badges.push(a);
              }
            }
            const totalExtra = (listing.amenities?.length || 0) + (ed?.special_features?.length || 0) - badges.length;

            return badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                {badges.slice(0, 4).map((b) => (
                  <Badge key={b} variant="outline" className="text-xs text-gray-600 border-gray-200">
                    {b}
                  </Badge>
                ))}
                {totalExtra > 0 && (
                  <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                    +{totalExtra} more
                  </Badge>
                )}
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </Link>
  );
}
