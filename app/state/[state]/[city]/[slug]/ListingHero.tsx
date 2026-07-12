/**
 * Hero banner for the listing detail page: hero image (or gradient fallback),
 * breadcrumb, badges (trophy/satisfaction/paint-safe/verified), title, rating
 * row, directions link, and the badge-claim CTA for trophy winners.
 */
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, CheckCircle, ChevronRight, Trophy, ShieldCheck, Gauge } from 'lucide-react';
import LogoImage from '@/components/LogoImage';
import HeroImageFallback from '@/components/HeroImageFallback';
import { TrackableLink } from '@/components/TrackableLink';
import { ListingBreadcrumb } from '@/components/ListingBreadcrumb';
import { Badge } from '@/components/ui/badge';
import type { Listing } from '@/lib/supabase';
import { isSelfServeOnly } from '@/lib/self-serve';
import { tssTier } from '@/lib/touchless-satisfaction';
import { streetAddress } from '@/lib/utils';
import { isOptimizedImageHost } from './listing-content';
import { StarRating } from './listing-ui';
import type { BestOfRanking } from './listing-data';

interface ListingHeroProps {
  listing: Listing;
  stateSlug: string;
  citySlug: string;
  stateName: string;
  cityName: string;
  trophyRanking: BestOfRanking | null;
  heroImage: string | null;
  logoImage: string | null;
  heroObjectPosition: string;
}

export function ListingHero({
  listing,
  stateSlug,
  citySlug,
  stateName,
  cityName,
  trophyRanking,
  heroImage,
  logoImage,
  heroObjectPosition,
}: ListingHeroProps) {
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

  // One clean, mobile-first hero content block, shared by both the image and
  // no-image hero layouts (previously duplicated). Compact prioritized badges,
  // a single clear "Get Directions" affordance (address shown once, no iOS
  // data-detector mess since it's an explicit link), and NO restated
  // description (the full description lives below in the content column).
  const heroShortAddress = `${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state}`;
  const heroDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}`)}`;
  const heroPill = 'text-[11px] font-semibold px-2 py-0.5';
  // Self-serve-only listings must not wear touchless/paint-safe badges — they get
  // a single "Self-Serve" badge instead. Mixed (also-touchless) keep touchless.
  const selfServe = isSelfServeOnly(listing);
  const heroContent = (
    <>
      <ListingBreadcrumb
        listingName={listing.name}
        stateSlug={stateSlug}
        stateName={stateName}
        citySlug={citySlug}
        cityName={cityName}
        variant="hero"
      />
      <div className="flex items-start gap-3 md:gap-4 mt-1">
        {logoImage && (
          <LogoImage
            src={logoImage}
            alt={`${listing.name} logo`}
            wrapperClassName="shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg mt-1"
            className="w-full h-full object-contain"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {trophyRanking && (
              <Link href={`/best/${trophyRanking.metro_slug}`}>
                <Badge className={`bg-yellow-400 text-yellow-900 border-0 shadow-sm hover:bg-yellow-300 transition-colors ${heroPill}`}>
                  <Trophy className="w-3 h-3 mr-1" />#{trophyRanking.rank} in {trophyRanking.metro_name}
                </Badge>
              </Link>
            )}
            {listing.touchless_satisfaction_score != null && (
              <Badge className={`border-0 shadow-sm text-white ${heroPill}`} style={{ backgroundColor: tssTier(listing.touchless_satisfaction_score).arc }}>
                <Gauge className="w-3 h-3 mr-1" />Satisfaction {listing.touchless_satisfaction_score}
              </Badge>
            )}
            {selfServe ? (
              /* Self-serve: no touchless/paint-safe claims — just the wash-type badge. */
              <Badge className={`bg-[#22C55E] text-white border-0 shadow-sm ${heroPill}`}>
                <CheckCircle className="w-3 h-3 mr-1" />Self-Serve
              </Badge>
            ) : (
              <>
                {listing.paint_safe_verified && (
                  <Badge className={`bg-emerald-600 text-white border-0 shadow-sm ${heroPill}`}>
                    <ShieldCheck className="w-3 h-3 mr-1" />Paint-Safe
                  </Badge>
                )}
                {/* "Touchless Verified" requires backing: a user-review verification
                    must have at least one touchless mention behind it (else the badge
                    is unbacked/misleading); other sources (chain, vendor) stand alone. */}
                {(listing.touchless_verified && (listing.touchless_verified !== 'user_review' || (listing.touchless_mentions ?? 0) > 0)) ? (
                  <Badge className={`bg-[#22C55E] text-white border-0 shadow-sm ${heroPill}`}>
                    <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                  </Badge>
                ) : (
                  <Badge className={`bg-gray-100 text-gray-700 border-0 shadow-sm ${heroPill}`}>
                    <CheckCircle className="w-3 h-3 mr-1" />Touchless
                  </Badge>
                )}
              </>
            )}
            {listing.is_claimed && (
              <Badge className={`bg-blue-500 text-white border-0 shadow-sm ${heroPill}`}>
                <ShieldCheck className="w-3 h-3 mr-1" />Verified Owner
              </Badge>
            )}
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
          {ratingStars && <div className="mb-3 text-sm text-white/90">{ratingStars}</div>}
          <TrackableLink
            href={heroDirectionsUrl}
            listingId={listing.id}
            eventType="directions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 max-w-full bg-white/10 hover:bg-white/20 border border-white/25 rounded-xl px-3.5 py-2 text-white text-sm transition-colors"
          >
            <MapPin className="w-4 h-4 shrink-0 text-[#22C55E]" />
            <span className="truncate">{heroShortAddress}</span>
            <span className="flex items-center gap-0.5 text-[#22C55E] font-semibold shrink-0">· Directions<ChevronRight className="w-3.5 h-3.5" /></span>
          </TrackableLink>
        </div>
      </div>
    </>
  );

  return (
    <div className="relative bg-[#0F2744]">
      {heroImage ? (
        <>
          {/* Mobile keeps a fixed 320 tall (16:9 of 375px is only 211 —
              too short for the title overlay). md+ switches to true
              16:9 (matches the cropper's output ratio) with a 44rem
              ceiling so the hero doesn't dominate ultra-wide monitors.
              Previously the container was a fixed 416 tall on every
              desktop breakpoint, which meant 16:9 hero images were
              cropping off ~60% of vertical content on wide displays.
              `w-full` is critical: without it, on ultrawide displays
              the `aspect-[16/9]` + `max-h-[44rem]` pair conflict, and
              the browser shrinks WIDTH (not height) to honor 16:9
              under the height cap — producing a hero that only fills
              ~65% of the screen with dark navy bg leaking through on
              the right. Pinning w-full forces the cap to take from
              height only, and object-cover handles the crop. */}
          <div className="relative w-full overflow-hidden">
            <Image
              src={heroImage}
              alt={listing.name}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{ objectPosition: heroObjectPosition }}
              unoptimized={!isOptimizedImageHost(heroImage)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F2744] via-[#0F2744]/70 to-[#0F2744]/25" />
            <div className="relative flex flex-col justify-end min-h-[20rem] md:min-h-[26rem]">
              <div className="container mx-auto px-4 max-w-5xl pb-8 pt-6">
                {heroContent}
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
            {heroContent}
          </div>
        </div>
      )}
    </div>
  );
}
