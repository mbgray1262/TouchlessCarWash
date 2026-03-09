'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Star, MapPin, Phone, Globe, Clock, DollarSign,
  CheckCircle, XCircle, ShieldCheck, Trash2, Droplet,
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

function BoolCell({ value }: { value: boolean | null }) {
  return value ? (
    <CheckCircle className="w-4 h-4 text-green-500" />
  ) : (
    <XCircle className="w-4 h-4 text-gray-300" />
  );
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
          // Preserve order from compareIds
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

  // Best rating for highlighting
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
              {/* Rating */}
              <CompareRow label="Rating" icon={Star}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    {l.rating > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <Star className={`w-4 h-4 ${l.rating === bestRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 fill-gray-300'}`} />
                        <span className={`font-semibold ${l.rating === bestRating ? 'text-[#0F2744]' : 'text-gray-500'}`}>
                          {Number(l.rating).toFixed(1)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">No rating</span>
                    )}
                  </td>
                ))}
              </CompareRow>

              {/* Reviews */}
              <CompareRow label="Reviews">
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    <span className={`text-sm ${l.review_count === bestReviews && l.review_count > 0 ? 'font-semibold text-[#0F2744]' : 'text-gray-500'}`}>
                      {l.review_count > 0 ? l.review_count.toLocaleString() : '—'}
                    </span>
                  </td>
                ))}
              </CompareRow>

              {/* Location */}
              <CompareRow label="Location" icon={MapPin}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.address}<br />
                    <span className="text-gray-400">{l.city}, {l.state}</span>
                  </td>
                ))}
              </CompareRow>

              {/* Phone */}
              <CompareRow label="Phone" icon={Phone}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.phone ?? '—'}
                  </td>
                ))}
              </CompareRow>

              {/* Website */}
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

              {/* Price Range */}
              <CompareRow label="Price" icon={DollarSign}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.price_range ?? '—'}
                  </td>
                ))}
              </CompareRow>

              {/* Verified Owner */}
              <CompareRow label="Verified" icon={ShieldCheck}>
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    <BoolCell value={l.is_claimed} />
                  </td>
                ))}
              </CompareRow>

              {/* Wash Packages */}
              <CompareRow label="Packages" icon={DollarSign}>
                {listings.map((l) => {
                  const pkgs = l.wash_packages?.length ? l.wash_packages : l.extracted_data?.wash_packages;
                  return (
                    <td key={l.id} className="py-3 px-4 align-top text-sm">
                      {pkgs && pkgs.length > 0 ? (
                        <div className="space-y-1.5">
                          {pkgs.slice(0, 5).map((p, i) => (
                            <div key={i} className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-700 truncate">{p.name}</span>
                              {p.price && <span className="text-gray-500 font-medium shrink-0">{p.price}</span>}
                            </div>
                          ))}
                          {pkgs.length > 5 && <span className="text-gray-400 text-xs">+{pkgs.length - 5} more</span>}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </CompareRow>

              {/* Membership */}
              <CompareRow label="Membership">
                {listings.map((l) => {
                  const plans = l.extracted_data?.membership_plans;
                  return (
                    <td key={l.id} className="py-3 px-4 align-top text-sm">
                      {plans && plans.length > 0 ? (
                        <div className="space-y-1">
                          {plans.slice(0, 3).map((p, i) => (
                            <div key={i}>
                              <span className="text-gray-700">{p.name}</span>
                              {p.price && <span className="text-gray-400 ml-1">({p.price})</span>}
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

              {/* Amenities */}
              <CompareRow label="Amenities">
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top">
                    {l.amenities && l.amenities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {l.amenities.slice(0, 6).map((a) => (
                          <Badge key={a} variant="outline" className="text-xs text-gray-600 border-gray-200">
                            {a}
                          </Badge>
                        ))}
                        {l.amenities.length > 6 && (
                          <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                            +{l.amenities.length - 6}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </CompareRow>

              {/* Equipment */}
              <CompareRow label="Equipment">
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.equipment_brand || l.equipment_model ? (
                      <>{l.equipment_brand}{l.equipment_model ? ` ${l.equipment_model}` : ''}</>
                    ) : '—'}
                  </td>
                ))}
              </CompareRow>

              {/* Hours */}
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

              {/* Chain */}
              <CompareRow label="Chain">
                {listings.map((l) => (
                  <td key={l.id} className="py-3 px-4 align-top text-sm text-gray-600">
                    {l.parent_chain ?? 'Independent'}
                  </td>
                ))}
              </CompareRow>
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
