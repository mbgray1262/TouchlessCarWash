/**
 * "Best Self-Service Car Washes in [metro]" — the self-serve twin of /best/[slug]. Ranks public
 * self-serve washes in a metro by the internal Self-Serve Satisfaction Score (with a Google-rating
 * fallback for unscored washes). No score is shown — it's a ranking key only. Targets the
 * "best self service car wash in [city]" search intent, distinct from the touchless best-of.
 *
 * SEO invariant: getQualifyingSelfServeMetros() gates BOTH this page and the sitemap, so a metro
 * that renders 200 here is exactly one the sitemap emits (no indexed-count drift).
 */
import { permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { Star, MapPin, Trophy, ChevronRight, Droplets, CheckCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import type { Listing } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS, getMetroBySlug, haversineDistance } from '@/lib/metro-areas';
import { getSelfServeMetroListings } from '@/lib/self-serve-metro';
import { selfServeTrophyEligible, selfServeRankKey } from '@/lib/self-serve-scoring';

export const revalidate = 3600;

interface Props { params: { slug: string } }

const listingHref = (l: Listing) => `/state/${getStateSlug(l.state)}/${slugify(l.city)}/${l.slug}`;
const cardImage = (l: Listing) => l.hero_image || l.google_photo_url || l.street_view_url || null;

export async function generateStaticParams() {
  return METRO_AREAS.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const metro = getMetroBySlug(params.slug);
  if (!metro) return { title: 'Best Self-Service Car Washes', robots: { index: false, follow: true } };
  const listings = await getSelfServeMetroListings(metro);
  const eligible = listings.filter(selfServeTrophyEligible);
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' }), year = now.getFullYear();
  // Below the qualifying gate → not sitemapped; noindex so a stale ISR copy can't be indexed thin.
  if (listings.length < 5 || eligible.length === 0) {
    return { title: `Self-Service Car Washes in ${metro.name}`, robots: { index: false, follow: true } };
  }
  const count = eligible.length;
  const title = count === 1
    ? `The Best Self-Service Car Wash in the ${metro.name} Area — ${month} ${year}`
    : `${count} Best Self-Service Car Washes in the ${metro.name} Area — Ranked ${month} ${year}`;
  const description = `The top self-service (coin-op / wand-bay) car washes across the greater ${metro.name} area, ranked by customer reviews and self-serve satisfaction. Updated ${month} ${year}.`;
  const canonical = `https://touchlesscarwashfinder.com/best-self-serve/${metro.slug}`;
  return {
    title, description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    robots: { index: true, follow: true },
  };
}

function rankColor(rank: number): string {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900';
  if (rank === 2) return 'bg-gray-300 text-gray-800';
  if (rank === 3) return 'bg-amber-600 text-white';
  return 'bg-slate-100 text-slate-600';
}

export default async function BestSelfServeMetroPage({ params }: Props) {
  const metro = getMetroBySlug(params.slug);
  if (!metro) permanentRedirect('/best-self-serve?from=unknown-metro');

  const all = await getSelfServeMetroListings(metro);
  // Same gate as the sitemap (getQualifyingSelfServeMetros): >=5 self-serve AND >=1 eligible winner.
  const stateSlug = metro.states?.[0] ? getStateSlug(metro.states[0]) : null;
  if (all.length < 5) {
    permanentRedirect(stateSlug ? `/self-serve-car-wash/${stateSlug}?from=thin-metro` : '/best-self-serve?from=thin-metro');
  }
  const ranked = [...all]
    .filter(selfServeTrophyEligible)
    .sort((a, b) => selfServeRankKey(b) - selfServeRankKey(a))
    .slice(0, 10);
  if (ranked.length === 0) {
    permanentRedirect(stateSlug ? `/self-serve-car-wash/${stateSlug}?from=no-winners` : '/best-self-serve?from=no-winners');
  }

  const year = new Date().getFullYear();
  const count = ranked.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0F2744] text-white">
        <div className="container mx-auto px-4 max-w-5xl py-8">
          <nav className="text-xs text-white/60 mb-3 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-[#22C55E]">Home</Link><ChevronRight className="w-3 h-3" />
            <Link href="/best-self-serve" className="hover:text-[#22C55E]">Best Self-Service</Link><ChevronRight className="w-3 h-3" />
            <span className="text-white/80">{metro.name}</span>
          </nav>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight">
            {count === 1 ? 'The Best' : `${count} Best`} Self-Service Car Wash{count === 1 ? '' : 'es'} in the {metro.name} Area
          </h1>
          <p className="text-white/80 mt-2 text-sm md:text-base">
            Coin-op &amp; wand-bay washes where you clean your own car — ranked by customer reviews and self-serve satisfaction. Updated {new Date().toLocaleString('en-US', { month: 'long' })} {year}.
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
                  <Badge className="bg-[#22C55E] text-white border-0 shrink-0 text-[11px]"><CheckCircle className="w-3 h-3 mr-1" />Self-Serve</Badge>
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
          <h2 className="text-lg font-bold text-[#0F2744] mb-2">About self-service car washes in {metro.name}</h2>
          <p>
            A self-service car wash lets you wash your own vehicle in an open bay using a high-pressure
            spray wand, foam brush, and coin- or card-operated timer — you control the process and pay
            only for the time you use. The {count} wash{count === 1 ? '' : 'es'} above are the top-rated
            self-serve options in the greater {metro.name} area, ranked from real customer reviews.
            {stateSlug ? <> Prefer an automatic, brushless wash? See our{' '}
              <Link href={`/best/${metro.slug}`} className="text-[#22C55E] hover:underline">best touchless car washes in {metro.name}</Link>.</> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
