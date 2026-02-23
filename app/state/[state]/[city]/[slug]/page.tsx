import Link from 'next/link';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import {
  Star, MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft,
  Sparkles, ExternalLink, ChevronRight, Navigation
} from 'lucide-react';
import LogoImage from '@/components/LogoImage';
import PhotoGalleryGrid from '@/components/PhotoGalleryGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type Listing } from '@/lib/supabase';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import type { Metadata } from 'next';

const ListingMap = dynamic(() => import('@/components/ListingMap'), { ssr: false });

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

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const listing = await getListing(params.slug);
  if (!listing) return { title: 'Listing Not Found' };
  return {
    title: `${listing.name} | Touchless Car Wash in ${listing.city}, ${listing.state}`,
    description: `${listing.name} is a verified touchless car wash located at ${listing.address}, ${listing.city}, ${listing.state}. View hours, amenities, and more.`,
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

function buildDescription(listing: Listing, cityName: string): string {
  if (listing.google_description) return listing.google_description;
  const parts: string[] = [`Touchless automatic car wash in ${listing.city}, ${listing.state}`];
  const highlights = (listing.amenities || []).slice(0, 4);
  if (highlights.length > 0) {
    parts.push(`offering ${highlights.map((a) => a.toLowerCase()).join(', ')}, and more`);
  }
  return parts.join(' ') + '.';
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

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const listing = await getListing(params.slug);

  if (!listing) notFound();

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
  const description = buildDescription(listing, cityName);

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
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
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
      </div>
    </div>
  );
}
