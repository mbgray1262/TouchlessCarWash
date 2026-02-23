import Link from 'next/link';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import {
  Star, MapPin, Phone, Globe, Clock, CheckCircle, ArrowLeft,
  Sparkles, ExternalLink, ChevronRight
} from 'lucide-react';
import LogoImage from '@/components/LogoImage';
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

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const listing = await getListing(params.slug);

  if (!listing) notFound();

  const stateCode = getStateCode(params.state);
  const stateName = stateCode ? getStateName(stateCode) : '';
  const cityName = unslugCity(params.city);
  const todayKey = getTodayKey();

  const heroImage = listing.hero_image ?? listing.google_photo_url ?? listing.street_view_url ?? null;
  const logoImage = listing.logo_photo ?? listing.google_logo_url ?? null;

  const galleryPhotos = (listing.photos || [])
    .filter((p: string) => isImageUrl(p) && p !== heroImage && p !== logoImage)
    .slice(0, 8);

  const hours = listing.hours as Record<string, string> | null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="relative bg-[#0F2744]">
        {heroImage ? (
          <div className="relative h-72 md:h-96 overflow-hidden">
            <img
              src={heroImage}
              alt={listing.name}
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F2744] via-[#0F2744]/60 to-transparent" />
          </div>
        ) : (
          <div className="h-32 md:h-40" />
        )}

        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="container mx-auto px-4 max-w-5xl pb-8">
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-4 flex-wrap">
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

            <div className="flex items-start gap-4">
              {logoImage && (
                <LogoImage
                  src={logoImage}
                  alt={`${listing.name} logo`}
                  wrapperClassName="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white p-1.5 shadow-lg"
                  className="w-full h-full object-contain"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge className="bg-[#22C55E] text-white border-0">
                    <CheckCircle className="w-3 h-3 mr-1" />Touchless Verified
                  </Badge>
                  {listing.is_featured && (
                    <Badge className="bg-amber-400 text-amber-900 border-0">Featured</Badge>
                  )}
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-2">{listing.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {listing.address}
                  </span>
                  {listing.rating > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      <span className="font-semibold text-white">{Number(listing.rating).toFixed(1)}</span>
                      <span className="text-white/60">({listing.review_count} reviews)</span>
                    </span>
                  )}
                </div>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {galleryPhotos.map((photo: string, i: number) => (
                    <div key={i} className="aspect-video rounded-xl overflow-hidden bg-gray-100">
                      <img
                        src={photo}
                        alt={`${listing.name} photo ${i + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {listing.latitude && listing.longitude && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-[#0F2744] mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#22C55E]" />
                  Location
                </h2>
                <ListingMap
                  lat={parseFloat(String(listing.latitude))}
                  lng={parseFloat(String(listing.longitude))}
                  name={listing.name}
                  address={`${listing.address}, ${listing.city}, ${listing.state}`}
                />
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4">Contact & Location</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-gray-700">
                    <div>{listing.address}</div>
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
                  className="mt-4 flex items-center justify-center gap-2 w-full bg-[#0F2744] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#1E3A8A] transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  Get Directions
                </a>
              )}
            </div>

            {hours && Object.keys(hours).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Hours of Operation
                </h2>
                <div className="space-y-2">
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
