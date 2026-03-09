'use client';

import { useState, useMemo } from 'react';
import {
  RefreshCw, Loader2, Map, ExternalLink, Search,
  Globe, Building2, MapPin, Trophy, Sparkles, FileText, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { AdminAuthGate } from '@/components/AdminAuthGate';

interface SitemapEntry {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
  category: string;
}

type Category = 'listings' | 'cities' | 'states' | 'best-of' | 'features' | 'blog' | 'other';

function categorizeUrl(loc: string): Category {
  const path = new URL(loc).pathname;

  // Individual listing: /state/{state}/{city}/{slug}
  if (/^\/state\/[^/]+\/[^/]+\/[^/]+$/.test(path)) return 'listings';
  // City page: /state/{state}/{city}
  if (/^\/state\/[^/]+\/[^/]+$/.test(path)) return 'cities';
  // State page: /state/{state}
  if (/^\/state\/[^/]+$/.test(path)) return 'states';
  // Best of: /best or /best/{slug}
  if (path.startsWith('/best')) return 'best-of';
  // Features: /features or /features/{slug} or /features/{slug}/{state}
  if (path.startsWith('/features')) return 'features';
  // Blog: /blog or /blog/{slug}
  if (path.startsWith('/blog')) return 'blog';

  return 'other';
}

function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const urlRegex = /<url>([\s\S]*?)<\/url>/g;
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1];
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1] ?? '';
    const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? null;
    const changefreq = block.match(/<changefreq>(.*?)<\/changefreq>/)?.[1] ?? null;
    const priority = block.match(/<priority>(.*?)<\/priority>/)?.[1] ?? null;
    if (loc) {
      entries.push({ loc, lastmod, changefreq, priority, category: categorizeUrl(loc) });
    }
  }
  return entries;
}

const CATEGORY_CONFIG: Record<Category, { label: string; icon: typeof Globe; color: string }> = {
  listings: { label: 'Listings', icon: MapPin, color: 'text-blue-600 bg-blue-50' },
  cities: { label: 'Cities', icon: Building2, color: 'text-purple-600 bg-purple-50' },
  states: { label: 'States', icon: Globe, color: 'text-green-600 bg-green-50' },
  'best-of': { label: 'Best Of', icon: Trophy, color: 'text-orange-600 bg-orange-50' },
  features: { label: 'Features', icon: Sparkles, color: 'text-pink-600 bg-pink-50' },
  blog: { label: 'Blog', icon: FileText, color: 'text-teal-600 bg-teal-50' },
  other: { label: 'Other', icon: Hash, color: 'text-gray-600 bg-gray-50' },
};

const CATEGORIES: Category[] = ['listings', 'cities', 'states', 'best-of', 'features', 'blog', 'other'];

function SitemapContent() {
  const [entries, setEntries] = useState<SitemapEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');

  async function fetchSitemap() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/sitemap.xml');
      if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`);
      const xml = await res.text();
      const parsed = parseSitemap(xml);
      setEntries(parsed);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Counts by category
  const counts = useMemo(() => {
    const map: Record<Category, number> = {
      listings: 0, cities: 0, states: 0, 'best-of': 0, features: 0, blog: 0, other: 0,
    };
    for (const e of entries) {
      map[e.category as Category] = (map[e.category as Category] || 0) + 1;
    }
    return map;
  }, [entries]);

  // Filtered entries
  const filtered = useMemo(() => {
    let list = entries;
    if (filterCategory !== 'all') {
      list = list.filter((e) => e.category === filterCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.loc.toLowerCase().includes(q));
    }
    return list;
  }, [entries, filterCategory, search]);

  // Show max 200 in table for performance
  const displayEntries = filtered.slice(0, 200);
  const hasMore = filtered.length > 200;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="container mx-auto px-4 max-w-7xl py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2744] flex items-center gap-2">
              <Map className="w-6 h-6" />
              Sitemap
            </h1>
            {lastFetched && (
              <p className="text-sm text-gray-500 mt-1">
                Last refreshed: {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-[#0F2744] flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Raw XML
            </a>
            <Button onClick={fetchSitemap} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {entries.length === 0 ? 'Load Sitemap' : 'Refresh'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {entries.length > 0 && (
          <>
            {/* Total count */}
            <Card className="mb-4 border-2 border-[#0F2744]/10">
              <CardContent className="py-4 px-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total URLs</p>
                  <p className="text-3xl font-bold text-[#0F2744]">
                    {entries.length.toLocaleString()}
                  </p>
                </div>
                <Globe className="w-10 h-10 text-[#0F2744]/20" />
              </CardContent>
            </Card>

            {/* Category breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              {CATEGORIES.map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                const Icon = config.icon;
                const count = counts[cat];
                if (count === 0) return null;
                const isActive = filterCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(isActive ? 'all' : cat)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isActive
                        ? 'border-orange-300 bg-orange-50 ring-2 ring-orange-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-xl font-bold text-[#0F2744]">{count.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{config.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Search & filter */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search URLs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                />
              </div>
              <p className="text-sm text-gray-500">
                {filtered.length === entries.length
                  ? `${entries.length.toLocaleString()} URLs`
                  : `${filtered.length.toLocaleString()} of ${entries.length.toLocaleString()} URLs`}
              </p>
            </div>

            {/* URL Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">URL</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Category</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Priority</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Last Modified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayEntries.map((entry, i) => {
                      const config = CATEGORY_CONFIG[entry.category as Category];
                      const path = new URL(entry.loc).pathname;
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <a
                              href={entry.loc}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                            >
                              {path || '/'}
                            </a>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                              {config.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-500">{entry.priority ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                            {entry.lastmod
                              ? new Date(entry.lastmod).toLocaleDateString()
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500 text-center">
                  Showing first 200 of {filtered.length.toLocaleString()} URLs. Use search to narrow results.
                </div>
              )}
              {displayEntries.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  No URLs match your search.
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && !error && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Map className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-[#0F2744] mb-2">
              Sitemap Viewer
            </h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Click &ldquo;Load Sitemap&rdquo; to fetch and parse your live sitemap.
              The sitemap is generated fresh from the database on every request.
            </p>
            <Button onClick={fetchSitemap} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Load Sitemap
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SitemapPage() {
  return (
    <AdminAuthGate>
      <SitemapContent />
    </AdminAuthGate>
  );
}
