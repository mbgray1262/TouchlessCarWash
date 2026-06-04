import { supabase } from '@/lib/supabase';
import { US_STATES } from '@/lib/constants';
import { getQualifyingMetros, type MetroWithCount } from '@/lib/metro-queries';

// listing_events has RLS that allows anon INSERTs (so /api/track works) but
// blocks anon SELECTs (so individual click data stays private). We expose
// AGGREGATES — counts only — through SECURITY DEFINER RPCs added in the
// 20260501000000_fix_listing_events_rls migration. This means the stats
// page can count clicks without seeing raw events, and we don't depend on
// SUPABASE_SERVICE_ROLE_KEY being set on the Netlify side.
import {
  BarChart3, ShieldCheck, Heart, Star, MessageSquareQuote, Trophy,
  Globe, Phone, Navigation, TrendingUp, Users, MapPin, Video,
} from 'lucide-react';

// Canonical US state codes (50 states + DC) used to dedupe non-US listings
// from coverage stats — the listings table contains a few Canadian entries
// (e.g. Ontario) that shouldn't count toward "States Covered".
const US_STATE_CODES = new Set(US_STATES.map(s => s.code));

export const revalidate = 0; // always fresh for admin

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}

function StatCard({ label, value, sub, icon: Icon, color = 'orange' }: StatCardProps) {
  const colors: Record<string, { bg: string; icon: string }> = {
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600' },
    green: { bg: 'bg-green-50', icon: 'text-green-600' },
    red: { bg: 'bg-red-50', icon: 'text-red-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600' },
  };
  const c = colors[color] ?? colors.orange;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#0F2744]">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

async function getStats() {
  const [
    totalListingsRes,
    touchlessListingsRes,
    claimedListingsRes,
    featuredListingsRes,
    reviewSnippetsRes,
    blogPostsRes,
    qualifyingMetros,       // live list of qualifying metros — drives BOTH Best Of Metros + Ranked Listings (no stale cache)
    suggestedEditsRes,
    pendingEditsRes,
    // Engagement aggregates — single RPC call that returns counts grouped
    // by event_type. Bypasses the anon-SELECT block on listing_events
    // because the RPC is SECURITY DEFINER (returns aggregates only, no raw
    // rows). Replaces six individual count queries that all returned 0.
    eventCountsRes,
    // Last-7-days RPC. Same SECURITY DEFINER pattern.
    recentEventsRes,
    // State coverage
    stateCoverageRes,
    // Top favorited + most engaged via SECURITY DEFINER RPC (returns
    // listing_id + count tuples; we resolve names below).
    topFavoritedIdsRes,
    topEngagedIdsRes,
  ] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }),
    // Match the homepage / about-page count — only approved touchless listings.
    // Without is_approved=true the count includes held / pending-enrichment
    // rows that the public site doesn't show, producing the 4,026 vs 3,971
    // mismatch reported in the dashboard audit.
    supabase.from('listings').select('id', { count: 'exact', head: true })
      .eq('is_touchless', true).eq('is_approved', true),
    supabase.from('listings').select('id', { count: 'exact', head: true })
      .eq('is_claimed', true).eq('is_approved', true),
    supabase.from('listings').select('id', { count: 'exact', head: true })
      .eq('is_featured', true).eq('is_approved', true),
    supabase.from('review_snippets').select('id', { count: 'exact', head: true }),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    // "Best Of Metros" + "Ranked Listings" both derive from the SAME live
    // function the /best index page uses, so the dashboard can never drift from
    // what's actually shown. (Previously read the best_of_rankings table — a
    // lazy cache only populated when a metro page is visited — so both
    // under-reported.) Best Of Metros = qualifying metros; Ranked Listings =
    // sum of up to 10 ranked spots per metro (matches scored.slice(0,10)).
    getQualifyingMetros(),
    supabase.from('suggested_edits').select('id', { count: 'exact', head: true }),
    supabase.from('suggested_edits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.rpc('listing_event_counts'),
    supabase.rpc('listing_events_recent_count', { p_days: 7 }),
    supabase.rpc('states_with_touchless_listings'),
    supabase.rpc('listing_event_top', { p_event_types: ['favorite'], p_limit: 5 }),
    supabase.rpc('listing_event_top', { p_event_types: ['directions', 'phone', 'website'], p_limit: 5 }),
  ]);

  // Tally engagement counts from the RPC result.
  type EventCountRow = { event_type: string; count: number };
  const eventCountMap: Record<string, number> = {};
  for (const row of (eventCountsRes.data ?? []) as EventCountRow[]) {
    eventCountMap[row.event_type] = Number(row.count) ?? 0;
  }
  const directionEventsRes = { count: eventCountMap.directions ?? 0 };
  const phoneEventsRes = { count: eventCountMap.phone ?? 0 };
  const websiteEventsRes = { count: eventCountMap.website ?? 0 };
  const favoriteEventsRes = { count: eventCountMap.favorite ?? 0 };
  const unfavoriteEventsRes = { count: eventCountMap.unfavorite ?? 0 };

  // Top favorited / top engaged: the RPC returned (listing_id, count) tuples.
  // Resolve listing names in a single batched query.
  type TopRow = { listing_id: string; count: number };
  const topFavoritedTuples = (topFavoritedIdsRes.data ?? []) as TopRow[];
  const topEngagedTuples = (topEngagedIdsRes.data ?? []) as TopRow[];
  const allTopIds = Array.from(new Set([
    ...topFavoritedTuples.map(t => t.listing_id),
    ...topEngagedTuples.map(t => t.listing_id),
  ]));

  let listingsById: Map<string, { name: string; city: string; state: string }> = new Map();
  if (allTopIds.length > 0) {
    const { data: listingData } = await supabase
      .from('listings')
      .select('id, name, city, state')
      .in('id', allTopIds);
    for (const l of listingData ?? []) {
      listingsById.set(l.id, { name: l.name, city: l.city, state: l.state });
    }
  }

  const topFavoritedListings = topFavoritedTuples.map(t => {
    const l = listingsById.get(t.listing_id);
    return {
      id: t.listing_id,
      name: l?.name ?? 'Unknown',
      city: l?.city ?? '',
      state: l?.state ?? '',
      count: Number(t.count),
    };
  });
  const topEngagedListings = topEngagedTuples.map(t => {
    const l = listingsById.get(t.listing_id);
    return {
      id: t.listing_id,
      name: l?.name ?? 'Unknown',
      city: l?.city ?? '',
      state: l?.state ?? '',
      count: Number(t.count),
    };
  });

  // Net favorites = favorite events - unfavorite events
  const netFavorites = (favoriteEventsRes.count ?? 0) - (unfavoriteEventsRes.count ?? 0);

  return {
    totalListings: totalListingsRes.count ?? 0,
    touchlessListings: touchlessListingsRes.count ?? 0,
    claimedListings: claimedListingsRes.count ?? 0,
    featuredListings: featuredListingsRes.count ?? 0,
    reviewSnippets: reviewSnippetsRes.count ?? 0,
    blogPosts: blogPostsRes.count ?? 0,
    bestOfMetros: (qualifyingMetros as MetroWithCount[]).length,
    bestOfRankings: (qualifyingMetros as MetroWithCount[]).reduce((sum, m) => sum + Math.min(m.listingCount, 10), 0),
    suggestedEdits: suggestedEditsRes.count ?? 0,
    pendingEdits: pendingEditsRes.count ?? 0,
    directionEvents: directionEventsRes.count ?? 0,
    phoneEvents: phoneEventsRes.count ?? 0,
    websiteEvents: websiteEventsRes.count ?? 0,
    favoriteEvents: favoriteEventsRes.count ?? 0,
    videoPlayEvents: eventCountMap.video_play ?? 0,
    netFavorites: Math.max(0, netFavorites),
    recentEvents: Number(recentEventsRes.data ?? 0),
    // Intersect with the canonical US state list so non-US codes (Canadian
    // "ON" / "Ontario" rows that slipped into the dataset) don't push this
    // above 51. RPC returns text[] of distinct states with touchless listings.
    stateCoverage: Array.isArray(stateCoverageRes.data)
      ? (stateCoverageRes.data as string[]).filter(code => US_STATE_CODES.has(code)).length
      : 0,
    topFavoritedListings,
    topEngagedListings,
  };
}

export default async function AdminStatsPage() {
  const stats = await getStats();
  const totalEngagement = stats.directionEvents + stats.phoneEvents + stats.websiteEvents;

  // AdminNav is already rendered by app/admin/layout.tsx — don't double it.
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 max-w-7xl py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#0F2744] flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-orange-500" />
            Site Stats & Reports
          </h1>
          <p className="text-gray-500 mt-1">Real-time overview of your directory</p>
        </div>

        {/* Listings Overview */}
        <h2 className="text-lg font-semibold text-[#0F2744] mb-3">Listings</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard icon={MapPin} label="Total Listings" value={stats.totalListings} color="blue" />
          <StatCard icon={Star} label="Touchless Verified" value={stats.touchlessListings} color="green" />
          <StatCard icon={ShieldCheck} label="Claimed by Owner" value={stats.claimedListings} sub={`${stats.touchlessListings > 0 ? ((stats.claimedListings / stats.touchlessListings) * 100).toFixed(1) : 0}% claim rate`} color="blue" />
          <StatCard icon={TrendingUp} label="Featured" value={stats.featuredListings} color="amber" />
          <StatCard icon={Globe} label="States Covered" value={`${stats.stateCoverage}/51`} color="purple" />
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold text-[#0F2744] mb-3">Content</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard icon={MessageSquareQuote} label="Review Snippets" value={stats.reviewSnippets} color="green" />
          <StatCard icon={Trophy} label="Best Of Metros" value={stats.bestOfMetros} color="amber" />
          <StatCard icon={Star} label="Ranked Listings" value={stats.bestOfRankings} color="amber" />
          <StatCard icon={Users} label="Blog Posts" value={stats.blogPosts} color="purple" />
          <StatCard icon={Users} label="Suggested Edits" value={stats.suggestedEdits} sub={stats.pendingEdits > 0 ? `${stats.pendingEdits} pending` : 'none pending'} color="red" />
        </div>

        {/* Engagement */}
        <h2 className="text-lg font-semibold text-[#0F2744] mb-3">User Engagement</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
          <StatCard icon={TrendingUp} label="Total Actions" value={totalEngagement + stats.favoriteEvents} sub="all time" color="blue" />
          <StatCard icon={TrendingUp} label="Last 7 Days" value={stats.recentEvents} color="green" />
          <StatCard icon={Navigation} label="Directions" value={stats.directionEvents} color="blue" />
          <StatCard icon={Phone} label="Phone Clicks" value={stats.phoneEvents} color="green" />
          <StatCard icon={Globe} label="Website Clicks" value={stats.websiteEvents} color="purple" />
          <StatCard icon={Heart} label="Favorites" value={stats.favoriteEvents} sub={`${stats.netFavorites} net saved`} color="red" />
          <StatCard icon={Video} label="Video Plays" value={stats.videoPlayEvents} color="amber" />
        </div>

        {/* Top Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Favorited */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" />
              Most Favorited Listings
            </h3>
            {stats.topFavoritedListings.length > 0 ? (
              <div className="space-y-3">
                {stats.topFavoritedListings.map((listing, i) => (
                  <div key={listing.id} className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-300 w-6 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0F2744] truncate">{listing.name}</p>
                      <p className="text-xs text-gray-400">{listing.city}, {listing.state}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-500">{listing.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No favorites recorded yet</p>
            )}
          </div>

          {/* Top Engaged */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-[#0F2744] uppercase tracking-wide mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Most Engaged Listings
            </h3>
            {stats.topEngagedListings.length > 0 ? (
              <div className="space-y-3">
                {stats.topEngagedListings.map((listing, i) => (
                  <div key={listing.id} className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-300 w-6 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0F2744] truncate">{listing.name}</p>
                      <p className="text-xs text-gray-400">{listing.city}, {listing.state}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-500">{listing.count} actions</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No engagement events recorded yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
