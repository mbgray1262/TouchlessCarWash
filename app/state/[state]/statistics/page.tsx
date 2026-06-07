import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { ChevronRight, MapPin, Star, Clock, Sparkles, Building2, TrendingUp, Users, BookOpen } from 'lucide-react';
import { US_STATES, getStateName, slugify } from '@/lib/constants';
import { getStateStats } from '@/lib/state-stats';
import type { Metadata } from 'next';

// Force dynamic so the page reflects the current DB state on every request;
// Netlify CDN s-maxage from netlify.toml handles the per-request cost.
export const revalidate = 3600; // ISR: edge-cache full-body response (replaces force-dynamic no-store bypass that caused slow TTFB); 304-bug-safe, validated on /best canary
// ISR on-demand: prerender none at build, but mark the route static so each
// render is cached at the Netlify edge. A dynamic [param] route WITHOUT
// generateStaticParams is treated as fully dynamic (no-store) and bypasses the CDN.
export function generateStaticParams() { return []; }

const SITE_URL = 'https://touchlesscarwashfinder.com';
const ORG_NAME = 'Touchless Car Wash Finder';

interface StatePageProps {
  params: { state: string };
}

function getStateCode(stateSlug: string): string | null {
  const state = US_STATES.find((s) => slugify(s.name) === stateSlug);
  return state ? state.code : null;
}

// No generateStaticParams: combining it with dynamic='force-dynamic' causes
// Next.js to error at request time on some routes. Pages render on demand;
// Netlify CDN caches via netlify.toml's s-maxage rules.

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateCode = getStateCode(params.state);
  if (!stateCode) return { title: 'Not Found' };
  const stats = await getStateStats(stateCode);
  if (!stats) return { title: 'Not Found' };
  const stateName = getStateName(stateCode);
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  const url = `${SITE_URL}/state/${params.state}/statistics`;
  const title = `Touchless Car Wash Statistics in ${stateName} (${month} ${year})`;
  const desc = `${stats.totalLocations} verified touchless car wash locations in ${stateName}, ${stats.avgRating ? `with an average rating of ${stats.avgRating} stars` : 'with verified Google ratings'}, ${stats.pctTwentyFourHour != null ? `${stats.pctTwentyFourHour}% open 24 hours, ` : ''}and ${stats.pctChain}% chain operated. First-party data from ${stats.totalReviews.toLocaleString()} customer reviews.`;
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description: desc, url, siteName: ORG_NAME, type: 'article' },
  };
}

function StatCard({ label, value, sub, icon: Icon, anchor }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  anchor?: string;
}) {
  return (
    <div id={anchor} className="bg-white rounded-2xl border border-gray-200 p-6 scroll-mt-20">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-3xl font-bold text-[#0F2744]">{value}</div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default async function StateStatisticsPage({ params }: StatePageProps) {
  const stateCode = getStateCode(params.state);
  // Unknown state slug → redirect to /states (matches the empty-city redirect
  // pattern used elsewhere; avoids 404s for typo URLs Google may have indexed).
  if (!stateCode) permanentRedirect('/states?from=unknown-state');

  const stats = await getStateStats(stateCode);
  // States below the threshold (HI, DC, etc.) → 308 to the master statistics
  // post. Generating sparse state pages invites misleading reads from low N
  // and triggers Google's scaled-content penalty.
  if (!stats) permanentRedirect('/blog/touchless-car-wash-statistics?from=thin-state-stats');

  const stateName = getStateName(stateCode);
  const stateSlug = params.state;
  const url = `${SITE_URL}/state/${stateSlug}/statistics`;
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // ── JSON-LD ───────────────────────────────────────────────────────────
  const variableMeasured: Array<Record<string, unknown>> = [
    { '@type': 'PropertyValue', name: `Verified touchless car wash locations in ${stateName}`, value: stats.totalLocations, unitText: 'locations', url: `${url}#total-locations` },
  ];
  if (stats.avgRating != null) {
    variableMeasured.push({ '@type': 'PropertyValue', name: `Average Google rating across ${stateName} touchless car washes`, value: stats.avgRating, unitText: 'stars', url: `${url}#avg-rating` });
  }
  if (stats.pctTwentyFourHour != null) {
    variableMeasured.push({ '@type': 'PropertyValue', name: `Touchless car washes in ${stateName} operating 24 hours daily`, value: stats.pctTwentyFourHour, unitText: '%', url: `${url}#twenty-four-hour` });
  }
  if (stats.pctFreeVacuum != null) {
    variableMeasured.push({ '@type': 'PropertyValue', name: `Touchless car washes in ${stateName} offering free vacuum stations`, value: stats.pctFreeVacuum, unitText: '%', url: `${url}#free-vacuum` });
  }
  variableMeasured.push({ '@type': 'PropertyValue', name: `Touchless car wash locations in ${stateName} operated by recognized chains`, value: stats.pctChain, unitText: '%', url: `${url}#chain-vs-independent` });

  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Touchless Car Wash Statistics — ${stateName}`,
    description: `First-party data on ${stats.totalLocations} verified touchless car wash locations in ${stateName}, including ratings, hours, amenities, chain breakdown, and customer sentiment.`,
    url,
    sameAs: url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: ORG_NAME, url: SITE_URL },
    spatialCoverage: { '@type': 'AdministrativeArea', name: stateName },
    temporalCoverage: now.toISOString().slice(0, 10),
    keywords: [
      `touchless car wash ${stateName.toLowerCase()}`,
      `touchless car wash statistics ${stateName.toLowerCase()}`,
      `car washes in ${stateName.toLowerCase()}`,
      'touchless car wash',
      'car wash data',
    ],
    variableMeasured,
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: url }],
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'States', item: `${SITE_URL}/states` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${SITE_URL}/state/${stateSlug}` },
      { '@type': 'ListItem', position: 4, name: 'Statistics', item: url },
    ],
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />

      {/* Hero */}
      <div className="bg-[#0F2744] text-white py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/states" className="hover:text-white transition-colors">States</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href={`/state/${stateSlug}`} className="hover:text-white transition-colors">{stateName}</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white/80">Statistics</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
            Touchless Car Wash Statistics in {stateName}
          </h1>
          <p className="text-lg text-white/80 max-w-3xl leading-relaxed">
            First-party data on every verified touchless car wash in {stateName} — sourced from{' '}
            <Link href={`/state/${stateSlug}`} className="underline hover:text-white">
              our directory
            </Link>{' '}
            of {stats.totalLocations} locations and {stats.totalReviews.toLocaleString()} aggregated Google reviews.
            Data current as of {monthYear}.
          </p>
        </div>
      </div>

      {/* Headline stats */}
      <section className="container mx-auto px-4 max-w-5xl py-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            anchor="total-locations"
            icon={MapPin}
            label="Total locations"
            value={stats.totalLocations.toLocaleString()}
            sub="Verified touchless"
          />
          {stats.avgRating != null && (
            <StatCard
              anchor="avg-rating"
              icon={Star}
              label="Average rating"
              value={`${stats.avgRating} ★`}
              sub={`${stats.totalReviews.toLocaleString()} Google reviews`}
            />
          )}
          {stats.pctTwentyFourHour != null && (
            <StatCard
              anchor="twenty-four-hour"
              icon={Clock}
              label="Open 24 hours"
              value={`${stats.pctTwentyFourHour}%`}
              sub={`${stats.twentyFourHourCount.toLocaleString()} of ${stats.totalLocations.toLocaleString()} locations`}
            />
          )}
          {stats.pctFreeVacuum != null && (
            <StatCard
              anchor="free-vacuum"
              icon={Sparkles}
              label="Free vacuums"
              value={`${stats.pctFreeVacuum}%`}
              sub={`${stats.freeVacuumCount.toLocaleString()} locations`}
            />
          )}
        </div>
      </section>

      {/* Chain vs Independent */}
      <section id="chain-vs-independent" className="container mx-auto px-4 max-w-5xl pb-10 scroll-mt-20">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-blue-600" />
          Chain vs Independent
        </h2>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-gray-700 leading-relaxed mb-4">
            <strong>{stats.pctChain}%</strong> of verified touchless car washes in {stateName} are operated by recognized chains
            ({stats.chainCount.toLocaleString()} locations), while <strong>{100 - stats.pctChain}%</strong> are independently
            operated ({stats.independentCount.toLocaleString()} locations).
          </p>
          {stats.topChains.length > 0 && (
            <div>
              <h3 className="font-semibold text-[#0F2744] mb-2">Top chains by location count:</h3>
              <ol className="list-decimal pl-6 space-y-1">
                {stats.topChains.map((c) => (
                  <li key={c.chain} className="text-gray-700">
                    <span className="font-medium">{c.chain}</span> — {c.count} {c.count === 1 ? 'location' : 'locations'}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {/* Top cities */}
      {stats.topCities.length > 0 && (
        <section id="top-cities" className="container mx-auto px-4 max-w-5xl pb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            Top Cities by Touchless Car Wash Count
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0F2744] text-white">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Rank</th>
                  <th className="px-5 py-3 text-left font-semibold">City</th>
                  <th className="px-5 py-3 text-right font-semibold">Locations</th>
                </tr>
              </thead>
              <tbody>
                {stats.topCities.map((c, i) => (
                  <tr key={c.city} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-5 py-3 text-gray-700 font-medium">{i + 1}</td>
                    <td className="px-5 py-3 text-gray-700">
                      <Link href={`/state/${stateSlug}/${slugify(c.city)}`} className="hover:text-blue-600 hover:underline">
                        {c.city}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 font-medium">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sentiment */}
      {stats.sentimentBreakdown && (
        <section id="customer-sentiment" className="container mx-auto px-4 max-w-5xl pb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Customer Sentiment
          </h2>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <p className="text-gray-700 mb-4">
              Based on natural-language analysis of <strong>{stats.sentimentBreakdown.sample.toLocaleString()}</strong> review
              snippets that explicitly mention touchless or brushless service from{' '}
              {stateName} locations:
            </p>
            {(() => {
              const total = stats.sentimentBreakdown.sample;
              const pctPos = Math.round((stats.sentimentBreakdown.positive / total) * 100);
              const pctNeg = Math.round((stats.sentimentBreakdown.negative / total) * 100);
              const pctMix = 100 - pctPos - pctNeg;
              return (
                <ul className="space-y-2 text-gray-700">
                  <li><span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span><strong>{pctPos}% positive</strong> ({stats.sentimentBreakdown.positive.toLocaleString()} snippets)</li>
                  <li><span className="inline-block w-3 h-3 rounded-full bg-gray-400 mr-2"></span><strong>{pctMix}% mixed or neutral</strong></li>
                  <li><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span><strong>{pctNeg}% negative</strong> ({stats.sentimentBreakdown.negative.toLocaleString()} snippets)</li>
                </ul>
              );
            })()}
          </div>
        </section>
      )}

      {/* Top-rated location */}
      {stats.topRated && (
        <section id="top-rated-location" className="container mx-auto px-4 max-w-5xl pb-10 scroll-mt-20">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500" />
            Highest-Rated Location in {stateName}
          </h2>
          <Link
            href={`/state/${stateSlug}/${slugify(stats.topRated.city)}/${stats.topRated.slug}`}
            className="block bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition p-6"
          >
            <div className="font-bold text-[#0F2744] text-lg mb-1">{stats.topRated.name}</div>
            <div className="text-gray-500 text-sm mb-2">{stats.topRated.city}, {stateCode}</div>
            <div className="flex items-center gap-1 text-sm text-gray-700">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{stats.topRated.rating.toFixed(1)}</span>
              <span className="text-gray-500">·</span>
              <span>{stats.topRated.reviewCount.toLocaleString()} reviews</span>
            </div>
          </Link>
        </section>
      )}

      {/* Methodology + cross-link */}
      <section className="container mx-auto px-4 max-w-5xl pb-16">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#0F2744] mb-2 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            Methodology
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            Statistics are computed live from the {ORG_NAME} database of approved touchless car wash locations in {stateName}.
            Locations are verified through chain-level operator confirmation, AI-powered analysis of Google reviews
            (scanning for touchless / brushless / no-touch mentions), website data extraction, and community submissions.
            Ratings and review counts are sourced from Google Places. Sentiment classification uses NLP to label review
            tone as positive, neutral, or negative.
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            For nationwide statistics and additional industry data points, see our{' '}
            <Link href="/blog/touchless-car-wash-statistics" className="text-blue-700 hover:underline font-medium">
              Touchless Car Wash Statistics 2026
            </Link>{' '}
            report — 54 data points sourced from industry research firms, trade associations, and our database of
            4,300+ verified locations across all 50 states.
          </p>
        </div>
      </section>

      {/* CTA: directory */}
      <section className="container mx-auto px-4 max-w-5xl pb-16">
        <Link
          href={`/state/${stateSlug}`}
          className="block bg-white rounded-2xl border border-gray-200 hover:border-[#22C55E] hover:shadow-md transition p-6 group"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#22C55E] uppercase tracking-wide mb-1">Directory</p>
              <h3 className="text-lg font-bold text-[#0F2744] group-hover:text-[#22C55E] transition-colors">
                Browse all {stats.totalLocations.toLocaleString()} touchless car washes in {stateName}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Maps, hours, ratings, and customer reviews for every verified location.
              </p>
            </div>
            <Users className="w-6 h-6 text-gray-400 group-hover:text-[#22C55E] transition-colors flex-shrink-0" />
          </div>
        </Link>
      </section>
    </main>
  );
}
