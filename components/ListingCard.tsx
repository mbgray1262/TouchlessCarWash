import Link from 'next/link';
import { Star, MapPin, Phone, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Listing } from '@/lib/supabase';
import { getStateSlug } from '@/lib/constants';

interface ListingCardProps {
  listing: Listing;
  href?: string;
  showVerifiedBadge?: boolean;
}

export function ListingCard({ listing, href, showVerifiedBadge = false }: ListingCardProps) {
  const defaultHref = `/state/${getStateSlug(listing.state)}/${listing.city.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`;
  const linkHref = href ?? defaultHref;

  const washType = listing.amenities?.find((a) =>
    /touchless automatic|automatic wash|touchless\/automatic/i.test(a)
  ) ?? listing.amenities?.find((a) =>
    /automatic|tunnel|self.serve|express/i.test(a)
  );

  return (
    <Link href={linkHref} className="group block h-full">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-[#22C55E] transition-all duration-200 h-full flex flex-col">
        {listing.hero_image ? (
          <div className="relative h-48 overflow-hidden shrink-0">
            <img
              src={listing.hero_image}
              alt={listing.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
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
                  <span className="text-white/70 text-xs">({listing.review_count})</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-br from-[#0F2744] to-[#1E3A8A] flex items-center justify-center shrink-0">
            <span className="text-white/20 text-5xl font-bold">{listing.name.charAt(0)}</span>
          </div>
        )}

        <div className="p-5 flex flex-col flex-1">
          {showVerifiedBadge && !listing.hero_image && (
            <Badge className="bg-[#22C55E] text-white border-0 text-xs mb-2 self-start">
              <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
            </Badge>
          )}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="text-base font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors leading-tight">
              {listing.name}
            </h2>
            {!listing.hero_image && listing.rating > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold text-sm">{Number(listing.rating).toFixed(1)}</span>
                <span className="text-xs text-gray-400">({listing.review_count})</span>
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 text-sm text-gray-500 mb-1">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{listing.address}, {listing.city}, {listing.state} {listing.zip}</span>
          </div>

          {listing.phone && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{listing.phone}</span>
            </div>
          )}

          {listing.amenities && listing.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
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
        </div>
      </div>
    </Link>
  );
}
