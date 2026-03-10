import { supabase } from '@/lib/supabase';
import {
  BarChart3, ShieldCheck, Heart, Star, MessageSquareQuote, Trophy,
  Globe, Phone, Navigation, TrendingUp, Users, MapPin,
} from 'lucide-react';

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
    bestOfMetrosRes,
    bestOfRankingsRes,
    suggestedEditsRes,
    pendingEditsRes,
    // Event counts by type
    directionEventsRes,
    phoneEventsRes,
    websiteEventsRes,
    favoriteEventsRes,
    unfavoriteEventsRes,
    // Recent events (last 7 days)
    recentEventsRes,
    // State coverage
    stateCoverageRes,
  ] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_touchless', true),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_claimed', true),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('is_featured', true),
    supabase.from('review_snippets').select('id', { count: 'exact', head: true }),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('best_of_metros').select('id', { count: 'exact', head: true }),
    supabase.from('best_of_rankings').select('id', { count: 'exact', head: true }),
    supabase.from('suggested_edits').select('id', { count: 'exact', head: true }),
    supabase.from('suggested_edits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    // Event counts
    supabase.from('listing_events').select('id', { count: 'exact', head: true }).eq('event_type', 'directions'),
    supabase.from('listing_events').select('id', { count: 'exact', head: true }).eq('event_type', 'phone'),
    supabase.from('listing_events').select('id', { count: 'exact', head: true }).eq('event_type', 'website'),
    supabase.from('listing_events').select('id', { count: 'exact', head: true }).eq('event_type', 'favorite'),
    supabase.from('listing_events').select('id', { count: 'exact', head: true }).eq('event_type', 'unfavorite'),
    // Recent events (last 7 days)
    supabase.from('listing_events').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    // State coverage
    supabase.rpc('states_with_touchless_listings'),
  ]);

  // Top favorited listings
  const { data: topFavoritedRaw } = await supabase
    .from('listing_events')
    .select('listing_id')
    .eq('event_type', 'favorite')
    .order('created_at', { ascending: false })
    .limit(1000);

  // Count favorites per listing
  const favCounts: Record<string, number> = {};
  for (const row of topFavoritedRaw ?? []) {
    favCounts[row.listing_id] = (favCounts[row.listing_id] ?? 0) + 1;
  }
  const topFavoritedIds = Object.entries(favCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Fetch listing names for top favorited
  let topFavoritedListings: { id: string; name: string; city: string; state: string; count: number }[] = [];
  if (topFavoritedIds.length > 0) {
    const { data: listingData } = await supabase
      .from('listings')
      .select('id, name, city, state')
      .in('id', topFavoritedIds.map(([id]) => id));

    topFavoritedListings = topFavoritedIds.map(([id, count]) => {
      const listing = listingData?.find(l => l.id === id);
      return {
        id,
        name: listing?.name ?? 'Unknown',
        city: listing?.city ?? '',
        state: listing?.state ?? '',
        count,
      };
    });
  }

  // Top engaged listings (most total events)
  const { data: topEngagedRaw } = await supabase
    .from('listing_events')
    .select('listing_id')
    .in('event_type', ['directions', 'phone', 'website'])
    .order('created_at', { ascending: false })
    .limit(2000);

  const engageCounts: Record<string, number> = {};
  for (const row of topEngagedRaw ?? []) {
    engageCounts[row.listing_id] = (engageCounts[row.listing_id] ?? 0) + 1;
  }
  const topEngagedIds = Object.entries(engageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  let topEngagedListings: { id: string; name: string; city: string; state: string; count: number }[] = [];
  if (topEngagedIds.length > 0) {
    const { data: listingData } = await supabase
      .from('listings')
      .select('id, name, city, state')
      .in('id', topEngagedIds.map(([id]) => id));

    topEngagedListings = topEngagedIds.map(([id, count]) => {
      const listing = listingData?.find(l => l.id === id);
      return {
        id,
        name: listing?.name ?? 'Unknown',
        city: listing?.city ?? '',
        state: listing?.state ?? '',
        count,
      };
    });
  }

  // Net favorites = favorite events - unfavorite events
  const netFavorites = (favoriteEventsRes.count ?? 0) - (unfavoriteEventsRes.count ?? 0);

  return {
    totalListings: totalListingsRes.count ?? 0,
    touchlessListings: touchlessListingsRes.count ?? 0,
    claimedListings: claimedListingsRes.count ?? 0,
    featuredListings: featuredListingsRes.count ?? 0,
    reviewSnippets: reviewSnippetsRes.count ?? 0,
    blogPosts: blogPostsRes.count ?? 0,
    bestOfMetros: bestOfMetrosRes.count ?? 0,
    bestOfRankings: bestOfRankingsRes.count ?? 0,
    suggestedEdits: suggestedEditsRes.count ?? 0,
    pendingEdits: pendingEditsRes.count ?? 0,
    directionEvents: directionEventsRes.count ?? 0,
    phoneEvents: phoneEventsRes.count ?? 0,
    websiteEvents: websiteEventsRes.count ?? 0,
    favoriteEvents: favoriteEventsRes.count ?? 0,
    netFavorites: Math.max(0, netFavorites),
    recentEvents: recentEventsRes.count ?? 0,
    stateCoverage: Array.isArray(stateCoverageRes.data) ? stateCoverageRes.data.length : 0,
    topFavoritedListings,
    topEngagedListings,
  };
}

export default async function AdminStatsPage() {
  const stats = await getStats();
  const totalEngagement = stats.directionEvents + stats.phoneEvents + stats.websiteEvents;

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard icon={TrendingUp} label="Total Actions" value={totalEngagement + stats.favoriteEvents} sub="all time" color="blue" />
          <StatCard icon={TrendingUp} label="Last 7 Days" value={stats.recentEvents} color="green" />
          <StatCard icon={Navigation} label="Directions" value={stats.directionEvents} color="blue" />
          <StatCard icon={Phone} label="Phone Clicks" value={stats.phoneEvents} color="green" />
          <StatCard icon={Globe} label="Website Clicks" value={stats.websiteEvents} color="purple" />
          <StatCard icon={Heart} label="Favorites" value={stats.favoriteEvents} sub={`${stats.netFavorites} net saved`} color="red" />
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
