'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Link2, Loader2, CheckCircle2, XCircle, ExternalLink,
  MapPin, Phone, Globe, Star, Clock, Sparkles, Image as ImageIcon,
  AlertCircle, ChevronRight, Images, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import PhotoGalleryModal from '@/components/PhotoGalleryModal';

type Step = 'idle' | 'scraping' | 'extracting' | 'saving' | 'done' | 'error';

interface ImportedListing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  slug: string;
  rating: number;
  review_count: number;
  is_touchless: boolean | null;
  touchless_confidence: string | null;
  crawl_notes: string | null;
  amenities: string[] | null;
  hours: Record<string, string> | null;
  wash_packages: Array<{ name: string; price: string; description?: string }> | null;
  photos: string[];
  hero_image: string | null;
  logo_photo: string | null;
  blocked_photos: string[];
}

interface ImportStats {
  touchless_score: number;
  photos_found: number;
  photos_rehosted: number;
}

const STEP_LABELS: Record<Step, string> = {
  idle: '',
  scraping: 'Scraping page with Firecrawl...',
  extracting: 'Extracting listing data with Claude AI...',
  saving: 'Saving listing and processing photos...',
  done: 'Import complete!',
  error: 'Import failed',
};

export default function ImportPage() {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [listing, setListing] = useState<ImportedListing | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGallery, setShowGallery] = useState(false);
  const { toast } = useToast();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed || !trimmed.startsWith('http')) {
      toast({ title: 'Please enter a valid URL', variant: 'destructive' });
      return;
    }

    setStep('scraping');
    setListing(null);
    setStats(null);
    setErrorMsg('');
    setShowGallery(false);

    try {
      setStep('extracting');

      const res = await fetch(`${supabaseUrl}/functions/v1/import-from-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!data.success) {
        setStep('error');
        setErrorMsg(data.error || 'Import failed');
        return;
      }

      setStep('done');
      setListing({
        ...data.listing,
        hero_image: data.listing.hero_image ?? null,
        logo_photo: data.listing.logo_photo ?? null,
        blocked_photos: data.listing.blocked_photos ?? [],
      });
      setStats(data.stats);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  const isRunning = step === 'scraping' || step === 'extracting' || step === 'saving';
  const heroSet = !!(listing?.hero_image);

  const touchlessBadgeColor = listing?.is_touchless === true
    ? 'bg-green-100 text-green-800 border-green-300'
    : listing?.is_touchless === false
      ? 'bg-red-100 text-red-800 border-red-300'
      : 'bg-yellow-100 text-yellow-800 border-yellow-300';

  const touchlessLabel = listing?.is_touchless === true
    ? `Touchless (${listing.touchless_confidence})`
    : listing?.is_touchless === false
      ? 'Not Touchless'
      : 'Unknown';

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 max-w-4xl py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/listings">
                <ArrowLeft className="w-4 h-4 mr-1" /> Admin
              </Link>
            </Button>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-[#0F2744]">Import from URL</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-4xl py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#0F2744] mb-2">Import Listing from URL</h1>
            <p className="text-gray-500">
              Paste any car wash page URL. Firecrawl will scrape the page and Claude AI will extract
              all the listing data automatically.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Link
              href="/admin/import/bulk"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded-lg px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Bulk Import (CSV/Excel)
            </Link>
            <Link
              href="/admin/import/enrich-photos"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:border-teal-400 rounded-lg px-3 py-2 bg-teal-50 hover:bg-teal-100 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              Photo Enrichment
            </Link>
            <Link
              href="/admin/import/amenity-backfill"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:border-teal-400 rounded-lg px-3 py-2 bg-teal-50 hover:bg-teal-100 transition-colors"
            >
              <Tag className="w-4 h-4" />
              Amenity Backfill
            </Link>
            <Link
              href="/admin/import/hours"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Import Working Hours
            </Link>
          </div>
        </div>

        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9 text-sm"
                  placeholder="https://www.scrubadub.com/worcester-jennings-car-wash/"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isRunning && handleImport()}
                  disabled={isRunning}
                />
              </div>
              <Button
                onClick={handleImport}
                disabled={isRunning || !url.trim()}
                className="bg-[#0F2744] hover:bg-[#1E3A8A] text-white px-6 shrink-0"
              >
                {isRunning ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Working...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Import</>
                )}
              </Button>
            </div>

            {isRunning && (
              <div className="mt-5">
                <Pipeline step={step} />
              </div>
            )}
          </CardContent>
        </Card>

        {step === 'error' && (
          <Card className="border-red-200 bg-red-50 mb-6">
            <CardContent className="p-5 flex gap-3 items-start">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700 mb-1">Import Failed</p>
                <p className="text-sm text-red-600">{errorMsg}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'done' && listing && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-green-800">Listing imported successfully</p>
                {stats && (
                  <p className="text-sm text-green-600">
                    Touchless score: {stats.touchless_score} &bull; Photos found: {stats.photos_found} &bull; Photos saved: {stats.photos_rehosted}
                  </p>
                )}
              </div>
              <Button size="sm" asChild variant="outline" className="shrink-0">
                <Link href="/admin/listings">
                  View in Admin <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-5">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Business Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div>
                      <p className="text-xl font-bold text-[#0F2744]">{listing.name}</p>
                      <Badge className={`text-xs mt-1 ${touchlessBadgeColor}`}>{touchlessLabel}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                      {(listing.address || listing.city) && (
                        <div className="col-span-2 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{[listing.address, listing.city, listing.state, listing.zip].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                      {listing.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{listing.phone}</span>
                        </div>
                      )}
                      {listing.website && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <a href={listing.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                            {listing.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        </div>
                      )}
                      {listing.rating > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 shrink-0 text-yellow-500" />
                          <span>{listing.rating} ({listing.review_count} reviews)</span>
                        </div>
                      )}
                    </div>

                    {listing.crawl_notes && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <span className="font-medium">Verification notes:</span> {listing.crawl_notes}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {listing.amenities && listing.amenities.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-[#0F2744]">Amenities</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1.5">
                        {listing.amenities.map(a => (
                          <Badge key={a} variant="outline" className="text-xs text-gray-600 border-gray-200">{a}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {listing.wash_packages && listing.wash_packages.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-[#0F2744]">Service Menu</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="divide-y divide-gray-100">
                        {listing.wash_packages.map((pkg, i) => (
                          <div key={i} className="py-2.5 flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-sm text-gray-800">{pkg.name}</p>
                              {pkg.description && <p className="text-xs text-gray-500 mt-0.5">{pkg.description}</p>}
                            </div>
                            {pkg.price && <span className="text-sm font-semibold text-[#0F2744] shrink-0">{pkg.price}</span>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {listing.hours && Object.keys(listing.hours).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Hours
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        {Object.entries(listing.hours).map(([day, hours]) => (
                          <div key={day} className="flex justify-between">
                            <span className="capitalize text-gray-500">{day}</span>
                            <span className="text-gray-800 font-medium">{hours}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-5">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> Photos ({listing.photos?.length ?? 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {listing.photos && listing.photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {listing.photos.slice(0, 4).map((photo, i) => (
                          <div key={i} className="relative">
                            <img
                              src={photo}
                              alt=""
                              className={`w-full aspect-square object-cover rounded-lg ${
                                listing.hero_image === photo ? 'ring-2 ring-green-500' : ''
                              }`}
                            />
                            {listing.hero_image === photo && (
                              <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                                <Star className="w-2.5 h-2.5 text-white fill-white" />
                              </div>
                            )}
                          </div>
                        ))}
                        {listing.photos.length > 4 && (
                          <div className="col-span-2 text-center text-xs text-gray-400 pt-1">
                            +{listing.photos.length - 4} more photos
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-gray-400">
                        <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-xs">No photos extracted</p>
                      </div>
                    )}

                    <Button
                      onClick={() => setShowGallery(true)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Images className="w-3.5 h-3.5 mr-2" />
                      Manage Photos
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold text-[#0F2744]">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <NextStep
                      done={listing.is_touchless !== null}
                      label="Touchless verified"
                    />
                    <NextStep
                      done={(listing.amenities?.length ?? 0) > 0}
                      label="Amenities extracted"
                    />
                    <NextStep
                      done={(listing.photos?.length ?? 0) > 0}
                      label="Photos collected"
                    />
                    <NextStep
                      done={heroSet}
                      label="Hero image selected"
                    />
                    <div className="pt-2">
                      <Button asChild size="sm" className="w-full bg-[#0F2744] hover:bg-[#1E3A8A] text-white">
                        <Link href="/admin/listings">
                          <ExternalLink className="w-3.5 h-3.5 mr-2" /> Manage in Admin
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      {showGallery && listing && (
        <PhotoGalleryModal
          listingId={listing.id}
          listingName={listing.name}
          listingWebsite={listing.website}
          photos={listing.photos ?? []}
          blockedPhotos={listing.blocked_photos ?? []}
          currentHeroImage={listing.hero_image}
          currentLogoPhoto={listing.logo_photo}
          onClose={() => setShowGallery(false)}
          onHeroSelected={(_, heroUrl) => {
            setListing(prev => prev ? { ...prev, hero_image: heroUrl } : prev);
          }}
          onBlockedPhotosChanged={(_, blocked) => {
            setListing(prev => prev ? { ...prev, blocked_photos: blocked } : prev);
          }}
          onLogoPhotoChanged={(_, logoUrl) => {
            setListing(prev => prev ? { ...prev, logo_photo: logoUrl } : prev);
          }}
          onPhotosChanged={(_, photos) => {
            setListing(prev => prev ? { ...prev, photos } : prev);
          }}
        />
      )}
    </div>
  );
}

function Pipeline({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'scraping', label: 'Scraping page' },
    { key: 'extracting', label: 'Extracting data' },
    { key: 'saving', label: 'Saving listing' },
  ];

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isActive = s.key === step || (step === 'extracting' && s.key === 'scraping');
        const isDone = (step === 'extracting' && s.key === 'scraping') ||
          (step === 'saving' && (s.key === 'scraping' || s.key === 'extracting'));

        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-200" />}
            <div className="flex items-center gap-1.5 text-sm">
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : isActive ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
              )}
              <span className={isActive ? 'text-blue-600 font-medium' : isDone ? 'text-green-600' : 'text-gray-400'}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NextStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
      )}
      <span className={done ? 'text-gray-500 line-through' : 'text-gray-700'}>{label}</span>
    </div>
  );
}
