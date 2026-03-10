'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Star, MapPin, Phone, Globe, Clock,
  Trash2, Droplet, ThumbsUp, ThumbsDown, Minus,
  CreditCard, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCompare } from '@/lib/useCompare';
import { type Listing } from '@/lib/supabase';
import { getStateSlug } from '@/lib/constants';

function getListingHref(l: Listing) {
  return `/state/${getStateSlug(l.state)}/${l.city.toLowerCase().replace(/\s+/g, '-')}/${l.slug}`;
}

function formatHours(hours: Record<string, string> | null) {
  if (!hours) return null;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((d) => ({ day: d.slice(0, 3), hours: hours[d] ?? hours[d.toLowerCase()] ?? 'N/A' }));
}

function CompareRow({ label, icon: Icon, children }: {
  label: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-3 px-4 text-sm font-medium text-gray-500 bg-gray-50 w-36 align-top">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
          {label}
        </div>
      </td>
      {children}
    </tr>
  );
}

/** Only render a row if at least one listing has data for it */
function ConditionalRow({
  label,
  icon,
  listings,
  hasData,
  renderCell,
}: {
  label: string;
  icon?: React.ElementType;
  listings: Listing[];
  hasData: (l: Listing) => boolean;
  renderCell: (l: Listing) => React.ReactNode;
}) {
  if (!listings.some(hasData)) return null;
  return (
    <CompareRow label={label} icon={icon}>
      {listings.map((l) => (
        <td key={l.id} className="py-3 px-4 align-top text-sm">
          {hasData(l) ? renderCell(l) : <span className="text-gray-300">—</span>}
        </td>
      ))}
    </CompareRow>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-gray-300">—</span>;
  switch (sentiment) {
    case 'positive':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-200">
          <ThumbsUp className="w-3 h-3" />
          Positive Reviews
        </span>
      );
    case 'negative':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
          <ThumbsDown className="w-3 h-3" />
          Negative Reviews
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 text-xs font-medium border border-gray-200">
          <Minus className="w-3 h-3" />
          Mixed Reviews
        </span>
      );
  }
}

export default function ComparePage() {
  const { compareIds, toggle, clear } = useCompare();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (compareIds.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    async function fetchListings() {
      try {
        const res = await fetch(`/api/compare?ids=${compareIds.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          const ordered = compareIds
            .map((id) => data.find((d: Listing) => d.id === id))
            .filter(Boolean) as Listing[];
          setListings(ordered);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [compareIds]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading comparison...
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="min-h-screen">
        <div className="bg-[#0F2744] py-12">
          <div className="container mx-auto px-4 max-w-6xl">
            <h1 className="text-4xl font-bold text-white mb-3">Compare Car Washes</h1>
            <p className="text-white/80 text-lg">Select up to 3 listings to compare side by side.</p>
          </div>
        </div>
        <div className="container mx-auto px-4 max-w-6xl py-16 text-center">
          <Droplet className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No listings selected</h2>
          <p className="text-gray-500 mb-6">
            Use the compare button on any listing card to add it here.
          </p>
          <Button asChild>
            <Link href="/states">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse Car Washes
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Best values for winner highlighting
  const bestRating = Math.max(...listings.map((l) => l.rating ?? 0));
  const bestReviews = Math.max(...listings.map((l) => l.review_count ?? 0));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0F2744] py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Compare Car Washes</h1>
              <p className="text-white/70 mt-1">Comparing {listings.length} location{listings.length !== 1 ? 's' : ''}</p>
            </div>
            <Button variant="outline" size="sm" onClick={clear} className="text-white border-white/30 hover:bg-white/10">
              <Trash2 className="w-4 h-4 mr-1.5" />
              Clear All
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-36 bg-gray-50" />
                {listings.map((l) => (
                  <th key={l.id} className="p-4 text-left align-top">
                    <div className="space-y-2">
                      {(l.hero_image ?? l.google_photo_url) && (
                        <div className="relative w-full h-28 rounded-lg overflow-hidden">
                          <Image
                            src={(l.hero_image ?? l.google_photo_url)!}
                            alt={l.name}
                            fill
                            sizes="200px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      )}
                      <Link href={getListingHref(l)} className="text-base font-bold text-[#0F2744] hover:text-[#22C55E] transition-colors block">
                        {l.name}
                      </Link>
                      <button
                        onClick={() => toggle(l.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Rating — always shown */}
              <CompareRow label="Rating" icon={Star}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    {l.rating > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <Star className={`w-4 h-4 ${l.rating === bestRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'}`} />
                        <span className={`font-semibold ${l.rating === bestRating ? 'text-[#0F2744]' : 'text-gray-500'}`}>
                          {Number(l.rating).toFixed(1)}
                        </span>
                        {listings.length > 1 && l.rating === bestRating && l.rating > 0 && (
                          <span className="text-xs text-green-600 font-medium ml-1">Best</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">No rating</span>
                    )}
                  </td>
                ))}
              </CompareRow>

              {/* Reviews — always shown */}
              <CompareRow label="Reviews">
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-sm ${l.review_count === bestReviews && l.review_count > 0 ? 'font-semibold text-[#0F2744]' : 'text-gray-500'}`}>
                        {l.review_count > 0 ? l.review_count.toLocaleString() : '—'}
                      </span>
                      {listings.length > 1 && l.review_count === bestReviews && l.review_count > 0 && (
                        <span className="text-xs text-green-600 font-medium">Most</span>
                      )}
                    </div>
                  </td>
                ))}
              </CompareRow>

              {/* Review Sentiment — 90% populated, very useful for comparison */}
              <ConditionalRow
                label="Sentiment"
                icon={ThumbsUp}
                listings={listings}
                hasData={(l) => !!(l as any).touchless_sentiment}
                renderCell={(l) => <SentimentBadge sentiment={(l as any).touchless_sentiment} />}
              />

              {/* Amenities — 70% populated, only shown if at least one listing has data */}
              <ConditionalRow
                label="Amenities"
                listings={listings}
                hasData={(l) => !!(l.amenities && l.amenities.length > 0)}
                renderCell={(l) => (
                  <div className="flex flex-wrap gap-1">
                    {l.amenities!.slice(0, 8).map((a) => (
                      <Badge key={a} variant="outline" className="text-xs text-gray-600 border-gray-200">
                        {a}
                      </Badge>
                    ))}
                    {l.amenities!.length > 8 && (
                      <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                        +{l.amenities!.length - 8}
                      </Badge>
                    )}
                  </div>
                )}
              />

              {/* Payment Methods — 35% populated, only shown if at least one listing has data */}
              <ConditionalRow
                label="Payment"
                icon={CreditCard}
                listings={listings}
                hasData={(l) => {
                  const methods = l.extracted_data?.payment_methods;
                  return !!(methods && methods.length > 0);
                }}
                renderCell={(l) => (
                  <div className="flex flex-wrap gap-1">
                    {l.extracted_data!.payment_methods!.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs text-gray-600 border-gray-200">
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              />

              {/* Hours — always shown */}
              <CompareRow label="Hours" icon={Clock}>
                {listings.map((l) => {
                  const hrs = formatHours(l.hours);
                  return (
                    <td key={l.id} className="py-3 px-4 align-top text-sm">
                      {hrs ? (
                        <div className="space-y-0.5">
                          {hrs.map((h) => (
                            <div key={h.day} className="flex items-baseline gap-2">
                              <span className="text-gray-400 w-8 shrink-0">{h.day}</span>
                              <span className="text-gray-600 text-xs">{h.hours}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </CompareRow>

              {/* Location — always shown */}
              <CompareRow label="Location" icon={MapPin}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.address}<br />
                    <span className="text-gray-400">{l.city}, {l.state}</span>
                  </td>
                ))}
              </CompareRow>

              {/* Phone — always shown */}
              <CompareRow label="Phone" icon={Phone}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.phone ? (
                      <a href={`tel:${l.phone}`} className="hover:text-[#0F2744] transition-colors">
                        {l.phone}
                      </a>
                    ) : '—'}
                  </td>
                ))}
              </CompareRow>

              {/* Website — always shown */}
              <CompareRow label="Website" icon={Globe}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm">
                    {l.website ? (
                      <a href={l.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[200px]">
                        {l.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    ) : '—'}
                  </td>
                ))}
              </CompareRow>

              {/* Chain — only shown if at least one listing is part of a chain */}
              <ConditionalRow
                label="Chain"
                icon={Building2}
                listings={listings}
                hasData={(l) => !!l.parent_chain}
                renderCell={(l) => (
                  <span className="text-gray-700 font-medium">{l.parent_chain}</span>
                )}
              />
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-center">
          <Button asChild variant="outline">
            <Link href="/states">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse More Car Washes
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
