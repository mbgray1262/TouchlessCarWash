/**
 * "Best Hand Car Washes in [metro]" — the hand-wash twin of /best/[slug] and /best-self-serve/[slug].
 * Ranks public hand washes in a metro by the internal Hand Wash Satisfaction Score (with a
 * Google-rating fallback for unscored washes). No score is shown — ranking key only. Targets the
 * "best hand car wash in [city]" search intent.
 *
 * SEO invariant: getQualifyingHandWashMetros() gates BOTH this page and the sitemap, so a metro
 * that renders 200 here is exactly one the sitemap emits (no indexed-count drift).
 */
import { permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { Star, MapPin, Trophy, ChevronRight, Droplets, CheckCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import type { Listing } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { getMetroBySlug, haversineDistance, METRO_AREAS } from '@/lib/metro-areas';
import { getHandWashMetroListings } from '@/lib/hand-wash-metro';
import { HAND_WASH_LIVE } from '@/lib/hand-wash';
import { handWashTrophyEligible, handWashRankKey } from '@/lib/hand-wash-scoring';

export const revalidate = 3600;

interface Props { params: { slug: string } }

const listingHref = (l: Listing) => `/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`;
const cardImage = (l: Listing) => l.hero_image || l.google_photo_url || l.street_view_url || null;

export async function generateStaticParams() {
  return METRO_AREAS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const metro = getMetroBySlug(params.slug);
  if (!metro) return { title: 'Best Hand Car Washes', robots: { index: false, follow: true } };
  const listings = await getHandWashMetroListings(metro);
  const eligible = listings.filter(handWashTrophyEligible);
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' }), year = now.getFullYear();
  // Below the qualifying gate → not sitemapped; noindex so a stale ISR copy can't be indexed thin.
  if (listings.length < 5 || eligible.length === 0) {
    return { title: `Hand Car Washes in ${metro.name}`, robots: { index: false, follow: true } };
  }
  const count = eligible.length;
  const title = count === 1
    ? `The Best Hand Car Wash in the ${metro.name} Area — ${month} ${year}`
    : `${count} Best Hand Car Washes in the ${metro.name} Area — Ranked ${month} ${year}`;
  const description = `The top hand car washes across the greater ${metro.name} area — full-service hand washing and detailing where attendants wash your car by hand, ranked by customer reviews and hand-wash satisfaction. Updated ${month} ${year}.`;
  const canonical = `https://touchlesscarwashfinder.com/best-hand-wash/${metro.slug}`;
  return {
    title, description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    // Indexable only once the category is live; noindex (but crawlable) while gated.
    robots: HAND_WASH_LIVE ? { index: true, follow: true } : { index: false, follow: true },
  };
}

function rankColor(rank: number): string {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900';
  if (rank === 2) return 'bg-gray-300 text-gray-800';
  if (rank === 3) return 'bg-amber-600 text-white';
  return 'bg-slate-100 text-slate-600';
}

export default async function BestHandWashMetroPage({ params }: Props) {
  const metro = getMetroBySlug(params.slug);
  if (!metro) permanentRedirect('/best-hand-wash?from=unknown-metro');

  const all = await getHandWashMetroListings(metro);
  // Same gate as the sitemap (getQualifyingHandWashMetros): >=5 hand washes AND >=1 eligible winner.
  const stateSlug = metro.states?.[0] ? getStateSlug(metro.states[0]) : null;
  if (all.length < 5) {
    permanentRedirect(stateSlug ? `/hand-car-wash/${stateSlug}?from=thin-metro` : '/best-hand-wash?from=thin-metro');
  }
  const ranked = [...all]
    .filter(handWashTrophyEligible)
    .sort((a, b) => handWashRankKey(b) - handWashRankKey(a))
    .slice(0, 10);
  if (ranked.length === 0) {
    permanentRedirect(stateSlug ? `/hand-car-wash/${stateSlug}?from=no-winners` : '/best-hand-wash?from=no-winners');
  }

  const year = new Date().getFullYear();
  const count = ranked.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {!HAND_WASH_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — not live yet (hidden from Google &amp; not linked).
        </div>
      )}
      <div className="bg-[#0F2744] text-white">
        <div className="container mx-auto px-4 max-w-5xl py-8">
          <nav className="text-xs text-white/60 mb-3 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-[#22C55E]">Home</Link><ChevronRight className="w-3 h-3" />
            <Link href="/best-hand-wash" className="hover:text-[#22C55E]">Best Hand Wash</Link><ChevronRight className="w-3 h-3" />
            <span className="text-white/80">{metro.name}</span>
          </nav>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight">
            {count === 1 ? 'The Best' : `${count} Best`} Hand Car Wash{count === 1 ? '' : 'es'} in the {metro.name} Area
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Full-service hand washing and detailing where attendants clean your car by hand — ranked by customer reviews and hand-wash satisfaction. Updated {new Date().toLocaleString('en-US', { month: 'long' })} {year}.
          </p>
          {stateSlug && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/best/${metro.slug}`} className="text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/25 rounded-lg px-3 py-1.5 transition-colors">
                Looking for touchless instead? See Best Touchless in {metro.name} →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-8 space-y-4">
        {ranked.map((l, i) => {
          const rank = i + 1;
          const img = cardImage(l);
          const dist = l.latitude != null && l.longitude != null
            ? Math.round(haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) * 10) / 10 : null;
          return (
            <div key={l.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col sm:flex-row">
              <div className="relative sm:w-56 shrink-0 bg-[#0F2744] min-h-[9rem]">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={l.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30"><Droplets className="w-10 h-10" /></div>
                )}
                <span className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow ${rankColor(rank)}`}>
                  {rank === 1 ? <Trophy className="w-4 h-4" /> : rank}
                </span>
              </div>
              <div className="flex-1 p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-[#0F2744]">
                    <Link href={listingHref(l)} className="hover:text-[#22C55E] transition-colors">{l.name}</Link>
                  </h2>
                  <Badge className="bg-[#22C55E] text-white border-0 shrink-0 text-[11px]"><CheckCircle className="w-3 h-3 mr-1" />Hand Wash</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-600 flex-wrap">
                  {l.rating ? (
                    <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /><b className="text-[#0F2744]">{Number(l.rating).toFixed(1)}</b>{l.review_count ? <span className="text-gray-400">({l.review_count})</span> : null}</span>
                  ) : null}
                  {l.is_touchless ? <span className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 font-semibold">Also touchless</span> : null}
                </div>
                <p className="text-sm text-gray-500 mt-2 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>{[l.address, l.city, l.state].filter(Boolean).join(', ')}{dist != null ? ` · ${dist} mi from ${metro.name}` : ''}</span>
                </p>
                <Link href={listingHref(l)} className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-[#22C55E] hover:underline">
                  View details &amp; reviews <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-6 text-sm text-gray-700 leading-relaxed">
          <h2 className="text-lg font-bold text-[#0F2744] mb-2">About hand car washes in {metro.name}</h2>
          <p>
            A hand car wash cleans your vehicle the old-fashioned way — trained attendants wash it by
            hand with mitts, sponges, and foam, usually hand-dry it, and often clean the interior too.
            The {count} wash{count === 1 ? '' : 'es'} above are the top-rated hand washes in the greater
            {' '}{metro.name} area, ranked from real customer reviews.
            {stateSlug ? <> Prefer an automatic, brushless wash? See our{' '}
              <Link href={`/best/${metro.slug}`} className="text-[#22C55E] hover:underline">best touchless car washes in {metro.name}</Link>.</> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
