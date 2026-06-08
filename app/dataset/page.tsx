import Link from 'next/link';
import { ChevronRight, Database, MapPin, Star, ThumbsUp, ThumbsDown, Minus, MessageSquareQuote, Download, BarChart3, Globe, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getStateName, getStateSlug, US_STATES } from '@/lib/constants';

const VALID_STATE_CODES = new Set(US_STATES.map((s) => s.code));
import type { Metadata } from 'next';

export const revalidate = 3600; // 1 hour

const SITE_URL = 'https://touchlesscarwashfinder.com';

export const metadata: Metadata = {
  title: 'Touchless Car Wash Dataset — 5,000+ Locations Across 49 States',
  description:
    'Explore the most comprehensive public dataset of touchless car wash locations in the United States. 5,000+ verified locations with ratings, review sentiment, and features across 49 states.',
  alternates: { canonical: `${SITE_URL}/dataset` },
  openGraph: {
    title: 'Touchless Car Wash Dataset | Touchless Car Wash Finder',
    description:
      'The most comprehensive public dataset of touchless car wash locations in the US. 5,000+ verified locations with ratings, sentiment analysis, and more.',
    url: `${SITE_URL}/dataset`,
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
  },
};

type StateStats = {
  state: string;
  stateName: string;
  stateSlug: string;
  count: number;
  avgRating: number;
  ratedCount: number;
  reviewedCount: number;
  positive: number;
  negative: number;
  neutral: number;
};

async function getDatasetStats() {
  // Fetch all touchless listings with basic stats in one query
  const allListings: Array<{
    state: string;
    rating: number | null;
    review_count: number | null;
    touchless_sentiment: string | null;
  }> = [];

  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data } = await supabase
      .from('listings')
      .select('state, rating, review_count, touchless_sentiment')
      .eq('is_touchless', true)
      .eq('is_approved', true)  // live listings only — match the rest of the site
      .range(offset, offset + 999);

    if (!data || data.length === 0) break;
    allListings.push(...data);
    if (data.length < 1000) break;
  }

  // Total review snippets count
  const { count: totalReviews } = await supabase
    .from('review_snippets')
    .select('id', { count: 'exact', head: true })
    .eq('is_touchless_evidence', true);

  // Compute aggregate stats
  const totalListings = allListings.length;
  let totalRatingSum = 0;
  let totalRatedCount = 0;
  let totalReviewedCount = 0;
  let totalPositive = 0;
  let totalNegative = 0;
  let totalNeutral = 0;

  // Per-state aggregation
  const stateMap = new Map<string, {
    count: number;
    ratingSum: number;
    rated: number;
    reviewed: number;
    positive: number;
    negative: number;
    neutral: number;
  }>();

  for (const listing of allListings) {
    // Totals
    if (listing.rating && listing.rating > 0) {
      totalRatingSum += listing.rating;
      totalRatedCount++;
    }
    if (listing.review_count && listing.review_count > 0) {
      totalReviewedCount++;
    }
    if (listing.touchless_sentiment === 'positive') totalPositive++;
    else if (listing.touchless_sentiment === 'negative') totalNegative++;
    else if (listing.touchless_sentiment === 'neutral') totalNeutral++;

    // Per-state — skip non-US/invalid state codes so we never render a state
    // card linking to /state/<bad> (which 404s). Belt-and-suspenders alongside
    // the is_approved filter above.
    const st = listing.state;
    if (!VALID_STATE_CODES.has(st)) continue;
    if (!stateMap.has(st)) {
      stateMap.set(st, { count: 0, ratingSum: 0, rated: 0, reviewed: 0, positive: 0, negative: 0, neutral: 0 });
    }
    const s = stateMap.get(st)!;
    s.count++;
    if (listing.rating && listing.rating > 0) {
      s.ratingSum += listing.rating;
      s.rated++;
    }
    if (listing.review_count && listing.review_count > 0) {
      s.reviewed++;
    }
    if (listing.touchless_sentiment === 'positive') s.positive++;
    else if (listing.touchless_sentiment === 'negative') s.negative++;
    else if (listing.touchless_sentiment === 'neutral') s.neutral++;
  }

  // Build sorted state array
  const states: StateStats[] = [];
  for (const [abbr, data] of Array.from(stateMap.entries())) {
    const name = getStateName(abbr) || abbr;
    const slug = getStateSlug(abbr);
    states.push({
      state: abbr,
      stateName: name,
      stateSlug: slug,
      count: data.count,
      avgRating: data.rated > 0 ? Math.round((data.ratingSum / data.rated) * 10) / 10 : 0,
      ratedCount: data.rated,
      reviewedCount: data.reviewed,
      positive: data.positive,
      negative: data.negative,
      neutral: data.neutral,
    });
  }
  states.sort((a, b) => b.count - a.count);

  return {
    totalListings,
    totalStates: states.length,
    totalReviews: totalReviews || 0,
    avgRating: totalRatedCount > 0 ? Math.round((totalRatingSum / totalRatedCount) * 100) / 100 : 0,
    totalReviewedCount,
    totalPositive,
    totalNegative,
    totalNeutral,
    states,
  };
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${accent || 'bg-blue-50 text-blue-600'}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl md:text-3xl font-bold text-[#0F2744]">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function SentimentBar({ positive, negative, neutral }: { positive: number; negative: number; neutral: number }) {
  const total = positive + negative + neutral;
  if (total === 0) return null;
  const pPct = Math.round((positive / total) * 100);
  const nPct = Math.round((negative / total) * 100);
  const mPct = 100 - pPct - nPct;

  return (
    <div className="w-full">
      <div className="flex h-3 rounded-full overflow-hidden">
        {pPct > 0 && <div className="bg-green-400" style={{ width: `${pPct}%` }} />}
        {mPct > 0 && <div className="bg-gray-300" style={{ width: `${mPct}%` }} />}
        {nPct > 0 && <div className="bg-red-400" style={{ width: `${nPct}%` }} />}
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> {pPct}% Positive</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> {mPct}% Mixed</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {nPct}% Negative</span>
      </div>
    </div>
  );
}

export default async function DatasetPage() {
  const stats = await getDatasetStats();

  const sentimentTotal = stats.totalPositive + stats.totalNegative + stats.totalNeutral;
  const positivePct = sentimentTotal > 0 ? Math.round((stats.totalPositive / sentimentTotal) * 100) : 0;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Dataset', item: `${SITE_URL}/dataset` },
    ],
  };

  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Touchless Car Wash Locations in the United States',
    description: `A comprehensive dataset of ${stats.totalListings.toLocaleString()} verified touchless car wash locations across ${stats.totalStates} U.S. states, including ratings, customer review sentiment analysis, and location details.`,
    url: `${SITE_URL}/dataset`,
    license: 'https://creativecommons.org/licenses/by-nc/4.0/',
    creator: {
      '@type': 'Organization',
      name: 'Touchless Car Wash Finder',
      url: SITE_URL,
    },
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'text/csv',
      contentUrl: `${SITE_URL}/api/dataset/csv`,
    },
    temporalCoverage: '2024/..',
    spatialCoverage: {
      '@type': 'Place',
      name: 'United States',
    },
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Location Count', value: stats.totalListings },
      { '@type': 'PropertyValue', name: 'States Covered', value: stats.totalStates },
      { '@type': 'PropertyValue', name: 'Customer Reviews Analyzed', value: stats.totalReviews },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
      />

      {/* Hero */}
      <div className="bg-[#0F2744] py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Dataset</span>
          </nav>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Database className="w-6 h-6 text-[#22C55E]" />
            </div>
            <p className="text-[#22C55E] text-sm font-semibold uppercase tracking-widest">Open Data</p>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Touchless Car Wash Dataset
          </h1>
          <p className="text-lg text-blue-100 leading-relaxed max-w-3xl">
            The most comprehensive public dataset of touchless car wash locations in the United States.
            {' '}{stats.totalListings.toLocaleString()} verified locations across {stats.totalStates} states with ratings,
            customer review sentiment, and feature data.
          </p>
          <div className="mt-8">
            <a
              href="/api/dataset/csv"
              className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              Download CSV
            </a>
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="container mx-auto px-4 max-w-6xl -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Verified Locations"
            value={stats.totalListings.toLocaleString()}
            icon={<MapPin className="w-6 h-6" />}
            accent="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="States Covered"
            value={stats.totalStates.toString()}
            icon={<Globe className="w-6 h-6" />}
            accent="bg-purple-50 text-purple-600"
          />
          <StatCard
            label="Customer Reviews Analyzed"
            value={stats.totalReviews.toLocaleString()}
            icon={<MessageSquareQuote className="w-6 h-6" />}
            accent="bg-amber-50 text-amber-600"
          />
          <StatCard
            label="Average Rating"
            value={`${stats.avgRating} / 5`}
            icon={<Star className="w-6 h-6" />}
            accent="bg-yellow-50 text-yellow-600"
          />
        </div>
      </div>

      {/* Overview + Sentiment */}
      <div className="container mx-auto px-4 max-w-6xl py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* About */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#22C55E]" />
              About This Dataset
            </h2>
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              <p>
                This dataset is compiled from public business listings and customer reviews.
                Every location has been verified as offering a touchless (friction-free) car wash option.
              </p>
              <p>
                Our AI-powered sentiment analysis processes individual customer reviews that specifically
                mention the touchless wash experience, classifying each as positive, negative, or mixed.
                The overall listing sentiment is computed from these per-review classifications.
              </p>
              <p>
                Data is continuously updated as new locations are discovered and reviews are analyzed.
                The downloadable CSV includes basic location data (name, city, state, rating) for
                research and analysis purposes.
              </p>
            </div>
          </div>

          {/* Sentiment Overview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-[#0F2744] mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#22C55E]" />
              Sentiment Analysis Overview
            </h2>
            <div className="mb-6">
              <SentimentBar
                positive={stats.totalPositive}
                negative={stats.totalNegative}
                neutral={stats.totalNeutral}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-xl bg-green-50 border border-green-100">
                <ThumbsUp className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700">{stats.totalPositive.toLocaleString()}</p>
                <p className="text-xs text-green-600">Positive</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-gray-50 border border-gray-200">
                <Minus className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-700">{stats.totalNeutral.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Mixed</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-red-50 border border-red-100">
                <ThumbsDown className="w-5 h-5 text-red-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-700">{stats.totalNegative.toLocaleString()}</p>
                <p className="text-xs text-red-600">Negative</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">
              Based on AI analysis of {stats.totalReviews.toLocaleString()} customer reviews mentioning the touchless wash experience
            </p>
          </div>
        </div>

        {/* Key Insights */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl">
          <h3 className="font-bold text-[#0F2744] mb-3">Key Findings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
            <div className="flex items-start gap-2">
              <Star className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
              <p>The average touchless car wash has a <strong>{stats.avgRating}-star</strong> rating across {stats.totalReviewedCount.toLocaleString()} rated locations</p>
            </div>
            <div className="flex items-start gap-2">
              <ThumbsUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <p><strong>{positivePct}%</strong> of locations with touchless-specific reviews have predominantly positive customer sentiment</p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p><strong>Texas</strong> leads with the most touchless car wash locations, followed by Ohio, California, and Pennsylvania</p>
            </div>
          </div>
        </div>
      </div>

      {/* State Breakdown Table */}
      <div className="container mx-auto px-4 max-w-6xl pb-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-xl font-bold text-[#0F2744] mb-2 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#22C55E]" />
            Locations by State
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Touchless car wash coverage across {stats.totalStates} states
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 font-semibold text-[#0F2744]">State</th>
                  <th className="text-right py-3 px-3 font-semibold text-[#0F2744]">Locations</th>
                  <th className="text-right py-3 px-3 font-semibold text-[#0F2744]">Avg Rating</th>
                  <th className="text-center py-3 px-3 font-semibold text-[#0F2744] hidden md:table-cell">Sentiment</th>
                  <th className="text-right py-3 px-3 font-semibold text-green-600 hidden sm:table-cell">Positive</th>
                  <th className="text-right py-3 px-3 font-semibold text-gray-500 hidden sm:table-cell">Mixed</th>
                  <th className="text-right py-3 px-3 font-semibold text-red-600 hidden sm:table-cell">Negative</th>
                </tr>
              </thead>
              <tbody>
                {stats.states.map((st, i) => {
                  const sentTotal = st.positive + st.negative + st.neutral;
                  const pPct = sentTotal > 0 ? Math.round((st.positive / sentTotal) * 100) : 0;
                  const nPct = sentTotal > 0 ? Math.round((st.negative / sentTotal) * 100) : 0;
                  const mPct = sentTotal > 0 ? 100 - pPct - nPct : 0;
                  return (
                    <tr key={st.state} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`/state/${st.stateSlug}`}
                          className="font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                        >
                          {st.stateName}
                        </Link>
                      </td>
                      <td className="text-right py-2.5 px-3 font-semibold text-[#0F2744]">{st.count}</td>
                      <td className="text-right py-2.5 px-3">
                        {st.avgRating > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                            {st.avgRating}
                          </span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell">
                        {sentTotal > 0 ? (
                          <div className="flex h-2 rounded-full overflow-hidden w-full min-w-[80px]">
                            {pPct > 0 && <div className="bg-green-400" style={{ width: `${pPct}%` }} />}
                            {mPct > 0 && <div className="bg-gray-300" style={{ width: `${mPct}%` }} />}
                            {nPct > 0 && <div className="bg-red-400" style={{ width: `${nPct}%` }} />}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">No data</span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-3 text-green-600 hidden sm:table-cell">{st.positive}</td>
                      <td className="text-right py-2.5 px-3 text-gray-500 hidden sm:table-cell">{st.neutral}</td>
                      <td className="text-right py-2.5 px-3 text-red-600 hidden sm:table-cell">{st.negative}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="py-3 px-3 text-[#0F2744]">Total</td>
                  <td className="text-right py-3 px-3 text-[#0F2744]">{stats.totalListings.toLocaleString()}</td>
                  <td className="text-right py-3 px-3">
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                      {stats.avgRating}
                    </span>
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell" />
                  <td className="text-right py-3 px-3 text-green-600 hidden sm:table-cell">{stats.totalPositive.toLocaleString()}</td>
                  <td className="text-right py-3 px-3 text-gray-500 hidden sm:table-cell">{stats.totalNeutral.toLocaleString()}</td>
                  <td className="text-right py-3 px-3 text-red-600 hidden sm:table-cell">{stats.totalNegative.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Methodology + Download CTA */}
      <div className="container mx-auto px-4 max-w-6xl pb-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-xl font-bold text-[#0F2744] mb-4">Methodology</h2>
          <div className="space-y-3 text-sm text-gray-700 leading-relaxed max-w-3xl">
            <p>
              <strong>Data Collection:</strong> Locations are sourced from public business directories
              and verified through a combination of automated checks and manual review. Each location
              is confirmed to offer at least one touchless (friction-free, brushless) wash option.
            </p>
            <p>
              <strong>Sentiment Analysis:</strong> Customer reviews that specifically mention the touchless
              wash experience are identified using keyword matching. Each relevant review is individually
              classified as positive, negative, or neutral using AI-powered natural language processing.
              The overall location sentiment is computed from these per-review classifications: 70%+ positive
              reviews = Positive, 70%+ negative = Negative, otherwise Mixed.
            </p>
            <p>
              <strong>Ratings:</strong> Star ratings are sourced from Google Business Profiles and represent
              the overall business rating (not touchless-specific). The sentiment analysis provides the
              touchless-specific quality signal.
            </p>
            <p>
              <strong>Updates:</strong> This dataset is continuously updated as new locations are discovered,
              reviews are published, and existing data is refreshed.
            </p>
          </div>
        </div>
      </div>

      {/* Download CTA */}
      <section className="py-16 px-4 bg-[#0F2744]">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Download the Full Dataset</h2>
          <p className="text-blue-200 mb-6">
            Get a CSV file with all {stats.totalListings.toLocaleString()} touchless car wash locations
            including name, city, state, rating, review count, and sentiment classification.
          </p>
          <a
            href="/api/dataset/csv"
            className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Download CSV
          </a>
          <p className="text-xs text-white/40 mt-4">
            Licensed under CC BY-NC 4.0. Free for research and non-commercial use.
          </p>
        </div>
      </section>
    </div>
  );
}
