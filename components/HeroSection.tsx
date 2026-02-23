'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';

const DEFAULT_PLACEHOLDER = 'Search by city, ZIP, or car wash name';

interface GeoLocation {
  city: string;
  state: string;
  zip?: string;
}

async function reverseGeocode(lat: number, lon: number): Promise<GeoLocation | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { 'Accept-Language': 'en-US,en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || null;
    const state = addr['ISO3166-2-lvl4']?.replace('US-', '') ?? addr.state_code ?? null;
    const zip = addr.postcode ?? undefined;
    if (!city || !state) return null;
    return { city, state, zip };
  } catch {
    return null;
  }
}

export default function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoResolved(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setGeoLocation(result);
        setGeoResolved(true);
      },
      () => {
        setGeoResolved(true);
      },
      { timeout: 8000 }
    );
  }, []);

  const placeholder = geoResolved && geoLocation
    ? `e.g. ${geoLocation.city}, ${geoLocation.state}${geoLocation.zip ? ' ' + geoLocation.zip : ''}`
    : DEFAULT_PLACEHOLDER;

  const headingLocation = geoResolved && geoLocation
    ? `Near\u00a0${geoLocation.city},\u00a0${geoLocation.state}`
    : 'Near\u00a0You';

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    const { data: nameMatch } = await supabase
      .from('listings')
      .select('id, name, slug, city, state')
      .ilike('name', `%${q}%`)
      .eq('is_touchless', true)
      .order('rating', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nameMatch) {
      const stateSlug = getStateSlug(nameMatch.state);
      const citySlug = slugify(nameMatch.city);
      router.push(`/car-washes/${stateSlug}/${citySlug}/${nameMatch.slug}`);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <section
      id="search"
      className="relative min-h-[70vh] md:min-h-[80vh] flex items-center"
      style={{
        backgroundImage: 'url(https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-r from-[#0a1628]/95 via-[#0a1628]/75 via-40% to-transparent"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Search className="w-4 h-4" />
            100% Touchless Only
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Find Touchless Car&nbsp;Washes {headingLocation}
          </h1>

          <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
            The only directory dedicated exclusively to touchless car washes. No brushes, no scratches — just clean.
          </p>

          <div className="mb-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-12 h-14 text-base bg-white text-gray-900 rounded-l-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 px-10 bg-[#22c55e] hover:bg-[#16a34a] text-white font-semibold text-base rounded-r-lg"
              >
                Search
              </Button>
            </form>
          </div>

          <p className="text-sm text-white/70">
            Verified listings • Real reviews • Updated regularly
          </p>
        </div>
      </div>
    </section>
  );
}
