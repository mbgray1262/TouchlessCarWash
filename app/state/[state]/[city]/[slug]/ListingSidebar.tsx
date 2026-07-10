/**
 * Right (1/3-width) sidebar of the listing detail page: contact & info card,
 * owner card (suggest-edit + badge claim), community verification, map,
 * hours, back-to-city button, and the product sidebar.
 */
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import {
  MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft, ExternalLink,
  Navigation, Trophy, Store,
} from 'lucide-react';
import SuggestEditModal from '@/components/SuggestEditModal';
import VerificationPrompt, { type VerificationStats } from '@/components/VerificationPrompt';
import { TrackableLink } from '@/components/TrackableLink';
import { HoursStatusBadge } from '@/components/HoursStatusBadge';
import { Button } from '@/components/ui/button';
import type { Listing } from '@/lib/supabase';
import { streetAddress, hasStreetAddress } from '@/lib/utils';
import { DAY_ORDER, DAY_LABELS } from './listing-content';
import type { BestOfRanking } from './listing-data';

const ListingMap = nextDynamic(() => import('@/components/ListingMap'), { ssr: false });

interface ListingSidebarProps {
  listing: Listing;
  stateSlug: string;
  citySlug: string;
  cityName: string;
  hours: Record<string, string> | null;
  todayKey: string;
  trophyRanking: BestOfRanking | null;
  badgeInUse: boolean;
  awardYear: number;
  verificationStats: VerificationStats;
  streetViewUrl: string;
  viewOnGoogleUrl: string;
}

export function ListingSidebar({
  listing,
  stateSlug,
  citySlug,
  cityName,
  hours,
  todayKey,
  trophyRanking,
  badgeInUse,
  awardYear,
  verificationStats,
  streetViewUrl,
  viewOnGoogleUrl,
}: ListingSidebarProps) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4">Contact & Info</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="text-sm text-gray-700">
              {hasStreetAddress(listing.address, listing.city, listing.state, listing.zip) ? (
                <>
                  <div>{streetAddress(listing.address, listing.city, listing.state, listing.zip)}</div>
                  <div>{listing.city}, {listing.state} {listing.zip}</div>
                </>
              ) : (
                <>
                  <div>{listing.city}, {listing.state} {listing.zip}</div>
                  <div className="text-xs text-amber-600 mt-0.5">📍 Approximate location</div>
                </>
              )}
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

        {(listing.address || (listing.latitude && listing.longitude)) && (
          <div className="mt-4 flex flex-col gap-2">
            <TrackableLink
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state} ${listing.zip}`)}`}
              listingId={listing.id}
              eventType="directions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#22C55E] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#16A34A] transition-colors shadow-sm"
            >
              <Navigation className="w-4 h-4" />
              Get Directions
            </TrackableLink>
            <div className="flex gap-2">
              <a
                href={viewOnGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on Google
              </a>
              <a
                // streetViewUrl is resolved server-side: pinned to a
                // Google-official pano_id when one exists at this
                // address, otherwise the place page (with photos,
                // reviews, and a Street View tab to browse manually).
                // See lib/streetview-link.ts.
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 py-2 rounded-lg transition-colors"
              >
                <MapPin className="w-3 h-3" />
                {streetViewUrl.includes('map_action=pano') ? 'Street View' : 'View on Map'}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Owner card: prominent, owner-framed entry point that folds in the
          formerly-buried "Suggest an edit" link and (for trophy winners)
          the badge/certificate claim. trophyRanking is already gated by
          earnsTrophy(listing) above. */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Store className="w-4 h-4 text-[#0F2744]" />
          <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide">Own this business?</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {trophyRanking
            ? (badgeInUse
                ? 'Your award badge is active — manage it anytime.'
                : 'Keep your listing accurate and claim your award.')
            : 'Keep your listing accurate and up to date.'}
        </p>
        <div className="flex flex-col gap-2">
          {trophyRanking && (
            <Link
              href={`/badge/${listing.slug}`}
              className={badgeInUse
                ? 'flex items-center justify-center gap-2 w-full bg-green-50 text-green-700 border border-green-200 text-sm font-semibold py-2.5 rounded-xl hover:bg-green-100 transition-colors'
                : 'flex items-center justify-center gap-2 w-full bg-[#B8902F] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#a37e26] transition-colors shadow-sm'}
            >
              {badgeInUse
                ? <><CheckCircle className="w-4 h-4" />Badge active — manage</>
                : <><Trophy className="w-4 h-4" />Claim your {awardYear} award badge</>}
            </Link>
          )}
          <SuggestEditModal listingId={listing.id} listingName={listing.name} variant="button" />
        </div>
      </div>

      <VerificationPrompt
        listingId={listing.id}
        listingName={listing.name}
        stats={verificationStats}
      />

      {listing.latitude && listing.longitude && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ListingMap
            lat={parseFloat(String(listing.latitude))}
            lng={parseFloat(String(listing.longitude))}
            name={listing.name}
            address={`${streetAddress(listing.address, listing.city, listing.state, listing.zip)}, ${listing.city}, ${listing.state}`}
          />
        </div>
      )}

      {hours && Object.keys(hours).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Hours of Operation
            <HoursStatusBadge hours={hours} />
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
        <Link href={`/state/${stateSlug}/${citySlug}`}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          More in {cityName}
        </Link>
      </Button>
    </div>
  );
}
