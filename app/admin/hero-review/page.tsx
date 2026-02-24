'use client';

import { useEffect, useCallback } from 'react';
import { AdminNav } from '@/components/AdminNav';
import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { US_STATES } from '@/lib/constants';
import { FilterSource } from './types';
import { HeroCard } from './HeroCard';
import { StatsBar } from './StatsBar';
import { useHeroReview } from './useHeroReview';

const SOURCE_FILTERS: { value: FilterSource; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'google', label: 'Google' },
  { value: 'street_view', label: 'Street View' },
  { value: 'website', label: 'Website' },
  { value: 'none', label: 'No Hero' },
];

export default function HeroReviewPage() {
  const {
    listings,
    loading,
    totalCount,
    totalWithHero,
    totalPages,
    page,
    setPage,
    filterSource, setFilterSource,
    filterState, setFilterState,
    searchName, setSearchName,
    showFlaggedOnly, setShowFlaggedOnly,
    expandedId, setExpandedId,
    focusedId, setFocusedId,
    confirmMap,
    stats,
    getReplacements,
    handleReplace,
    handleFlag,
    navigateFocus,
    reload,
  } = useHeroReview();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateFocus(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateFocus(-1);
    } else if (e.key === 'Escape') {
      setExpandedId(null);
    }
  }, [navigateFocus, setExpandedId]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSearchChange = useCallback((val: string) => {
    setSearchName(val);
    setPage(0);
  }, [setSearchName, setPage]);

  const handleSourceChange = useCallback((val: FilterSource) => {
    setFilterSource(val);
    setPage(0);
  }, [setFilterSource, setPage]);

  const handleStateChange = useCallback((val: string) => {
    setFilterState(val);
    setPage(0);
  }, [setFilterState, setPage]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hero Review</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Scan hero images, reject bad ones, and pick replacements
            </p>
          </div>
          <div className="flex items-center gap-4">
            <StatsBar
              totalWithHero={totalWithHero}
              replacements={stats.replacements}
              flagged={stats.flagged}
            />
            <button
              onClick={reload}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search listings..."
              value={searchName}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {SOURCE_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSourceChange(value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterSource === value
                    ? 'bg-white text-orange-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={filterState}
            onChange={(e) => handleStateChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
          >
            <option value="">All States</option>
            {US_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFlaggedOnly}
              onChange={(e) => { setShowFlaggedOnly(e.target.checked); setPage(0); }}
              className="rounded border-gray-300 text-orange-500 focus:ring-orange-300"
            />
            Flagged only
          </label>

          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
            {totalCount.toLocaleString()} listings
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="rounded-xl border-2 border-gray-200 overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-2.5 bg-white space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-lg">No listings found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) => {
              const replacements = getReplacements(listing);
              const isExpanded = expandedId === listing.id;
              const isFocused = focusedId === listing.id;
              const confirmIndex = confirmMap[listing.id] ?? null;

              return (
                <HeroCard
                  key={listing.id}
                  listing={listing}
                  replacements={replacements}
                  isFocused={isFocused}
                  isExpanded={isExpanded}
                  onExpand={() => {
                    setExpandedId(listing.id);
                    setFocusedId(listing.id);
                  }}
                  onCollapse={() => setExpandedId(null)}
                  onReplace={(url, source) => {
                    const idx = replacements.findIndex(r => r.url === url);
                    handleReplace(listing.id, url, source, idx);
                  }}
                  onFlag={() => handleFlag(listing.id)}
                  onFocus={() => setFocusedId(listing.id)}
                  confirmIndex={confirmIndex}
                />
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            <span className="text-sm text-gray-600">
              Page {page + 1} of {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="mt-6 p-3 bg-white rounded-lg border border-gray-200 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Keyboard shortcuts:</span>{' '}
          Arrow keys to navigate cards &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">X</kbd> to open/close replace panel &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">1</kbd>-<kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">5</kbd> to select replacement &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">Esc</kbd> to close panel
        </div>
      </div>
    </div>
  );
}
