'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, MapPin, CheckCircle, Navigation, ShieldCheck, Heart, GitCompareArrows, Trophy, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Listing } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { useFavorites } from '@/lib/useFavorites';
import { useCompare } from '@/lib/useCompare';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import { OpenStatusBadge } from '@/components/OpenStatusBadge';
import { ensureHttps } from '@/lib/seo';
import { getDisplayImage } from '@/lib/listing-image';
import { tssTier } from '@/lib/touchless-satisfaction';

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
  /**
   * Best-Of rank within the surrounding metro area. When set to 1, 2, or 3
   * a trophy-style ribbon overlays the card image. Used on city pages to
   * highlight the top-rated touchless washes and funnel users toward the
   * /best/[metro] page for the full ranked list.
   */
  rank?: number;
}

export function ListingCard({ listing, href, showVerifiedBadge = false, distance, rank }: ListingCardProps) {
  const defaultHref = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;
  const linkHref = href ?? defaultHref;

  // Shared image-resolution logic (chain brand → hero → google photo → street
  // view). allowStreetView:false on cards — street view URLs often 403 and look
  // broken at thumbnail size.
  const rawCardImage = getDisplayImage(listing, { allowStreetView: false });
  const cardImage = rawCardImage ? ensureHttps(rawCardImage) : null;
  const rawCardLogo = listing.logo_photo ?? listing.google_logo_url ?? null;
  const cardLogo = rawCardLogo ? ensureHttps(rawCardLogo) : null;
  const [imgError, setImgError] = useState(false);
  const { isFavorite, toggle } = useFavorites();
  const saved = isFavorite(listing.id);
  const { isComparing, toggle: toggleCompare, isFull } = useCompare();
  const comparing = isComparing(listing.id);

  // Map focal point to CSS object-position for hero image cropping
  const focalPoint = listing.hero_focal_point ?? 'center';
  const objectPosition = focalPoint === 'top' ? 'center 20%' : focalPoint === 'bottom' ? 'center 80%' : 'center';

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
              style={{ objectPosition }}
              unoptimized={!isOptimizedImageHost(cardImage)}
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {rank && rank <= 3 && (
              <div className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold shadow-lg">
                <Trophy className="w-3 h-3" />#{rank} Best
              </div>
            )}
            {cardLogo && !(rank && rank <= 3) && (
              <LogoImage
                src={cardLogo}
                alt={`${listing.name} logo`}
                wrapperClassName="absolute top-2.5 left-2.5 w-8 h-8 rounded-lg overflow-hidden bg-white/90 p-0.5 shadow"
                className="w-full h-full object-contain"
              />
            )}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isFull || comparing) toggleCompare(listing.id); }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${comparing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-black/40 hover:bg-black/60'} ${!comparing && isFull ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label={comparing ? 'Remove from comparison' : 'Add to comparison'}
                title={comparing ? 'Remove from comparison' : isFull ? 'Compare limit reached (3)' : 'Compare'}
              >
                <GitCompareArrows className={`w-4 h-4 ${comparing ? 'text-white' : 'text-white'}`} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(listing.id); }}
                className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
              >
                <Heart className={`w-4 h-4 transition-colors ${saved ? 'fill-red-500 text-red-500' : 'text-white'}`} />
              </button>
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
              {showVerifiedBadge ? (
                <Badge className="bg-[#22C55E] text-white border-0 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
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
            {rank && rank <= 3 && (
              <div className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400 text-yellow-900 text-xs font-bold shadow-lg">
                <Trophy className="w-3 h-3" />#{rank} Best
              </div>
            )}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!isFull || comparing) toggleCompare(listing.id); }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${comparing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-black/40 hover:bg-black/60'} ${!comparing && isFull ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label={comparing ? 'Remove from comparison' : 'Add to comparison'}
                title={comparing ? 'Remove from comparison' : isFull ? 'Compare limit reached (3)' : 'Compare'}
              >
                <GitCompareArrows className={`w-4 h-4 ${comparing ? 'text-white' : 'text-white'}`} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(listing.id); }}
                className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
              >
                <Heart className={`w-4 h-4 transition-colors ${saved ? 'fill-red-500 text-red-500' : 'text-white'}`} />
              </button>
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
              {showVerifiedBadge ? (
                <Badge className="bg-[#22C55E] text-white border-0 text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
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
            <div>
              <h2 className="text-base font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors leading-tight">
                {listing.name}
              </h2>
              {listing.is_claimed && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Owner
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-sm text-gray-500 mb-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{listing.address}</span>
          </div>

          {listing.touchless_satisfaction_score != null && (() => {
            const t = tssTier(listing.touchless_satisfaction_score);
            return (
              <div
                className="inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 mb-1.5 w-fit border"
                style={{ background: t.bg, borderColor: t.arc + '66' }}
                title="Touchless Satisfaction Score — based on touchless-specific reviews"
              >
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[15px] font-extrabold leading-none shadow-sm"
                  style={{ background: t.arc }}
                >
                  {listing.touchless_satisfaction_score}
                </span>
                <span className="leading-tight">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Touchless Satisfaction</span>
                  <span className="block text-[13px] font-extrabold" style={{ color: t.color }}>{t.label}</span>
                </span>
              </div>
            );
          })()}

          {listing.paint_safe_verified && (
            <div
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-full px-2 py-0.5 mb-1 w-fit cursor-help"
              title="Paint-safe: we verified this wash is genuinely friction-free — no brushes or cloth that could touch your paint."
            >
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
              Paint-safe
              <Info className="w-3 h-3 text-gray-400" />
            </div>
          )}

          {distance != null && (
            <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium mb-1">
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span>{distance.toFixed(1)} mi away</span>
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
                if (typeof f !== 'string') continue;
                const fl = f.toLowerCase();
                if (fl.includes('free vacuum') && !badges.includes('free vacuum')) badges.push('free vacuum');
                if (fl.includes('ceramic') && !badges.includes('ceramic coating')) badges.push('ceramic coating');
                if ((fl.includes('mobile') || fl.includes('app')) && !badges.includes('mobile pay')) badges.push('mobile pay');
              }
            }
            // Fill remaining slots from amenities — keep grid cards lean (max 2);
            // the full amenity list lives on the listing detail page.
            const remaining = 2 - badges.length;
            if (remaining > 0 && listing.amenities?.length) {
              for (const a of listing.amenities) {
                if (badges.length >= 2) break;
                if (typeof a !== 'string') continue;
                const al = a.toLowerCase();
                if (!badges.some(b => typeof b === 'string' && b.toLowerCase() === al)) badges.push(a);
              }
            }
            const totalExtra = (listing.amenities?.length || 0) + (ed?.special_features?.length || 0) - Math.min(badges.length, 2);

            return badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                {badges.slice(0, 2).map((b) => (
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
