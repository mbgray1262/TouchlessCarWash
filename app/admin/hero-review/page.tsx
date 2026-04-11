'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, ChevronsUpDown, X } from 'lucide-react';
import { US_STATES } from '@/lib/constants';
import { FilterSource, EQUIPMENT_BRANDS } from './types';
import { HeroCard } from './HeroCard';
import { StatsBar } from './StatsBar';
import { useHeroReview } from './useHeroReview';
import { EquipmentImport } from './EquipmentImport';
import { BatchEquipmentBar } from './BatchEquipmentBar';

const SOURCE_FILTERS: { value: FilterSource; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'google', label: 'Google' },
  { value: 'street_view', label: 'Street View' },
  { value: 'website', label: 'Website' },
  { value: 'none', label: 'No Hero' },
];

function VendorCombobox({ vendors, value, onChange }: {
  vendors: { id: number; name: string }[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedVendor = vendors.find(v => String(v.id) === value);

  const filtered = search
    ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setTimeout(() => inputRef.current?.focus(), 0); }}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white flex items-center gap-1 min-w-[12rem] max-w-[16rem] text-left"
      >
        <span className="truncate flex-1">{selectedVendor?.name || 'All Vendors'}</span>
        {value ? (
          <X
            className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 shrink-0"
            onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); setOpen(false); }}
          />
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-64">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors..."
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setSearch(''); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 ${!value ? 'bg-orange-50 font-medium' : ''}`}
            >
              All Vendors
            </button>
            {filtered.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(String(v.id)); setSearch(''); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 truncate ${String(v.id) === value ? 'bg-orange-50 font-medium' : ''}`}
              >
                {v.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">No vendors found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HeroReviewPage() {
  const {
    listings,
    loading,
    totalCount,
    totalWithHero,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    filterSource, setFilterSource,
    filterState, setFilterState,
    filterVendorId, setFilterVendorId,
    vendors,
    searchName, setSearchName,
    showFlaggedOnly, setShowFlaggedOnly,
    showNoEquipmentOnly, setShowNoEquipmentOnly,
    filterEquipmentBrand, setFilterEquipmentBrand,
    expandedId, setExpandedId,
    focusedId, setFocusedId,
    confirmMap,
    stats,
    getReplacements,
    handleReplace,
    handleRemoveHero,
    handleDeleteHeroPhoto,
    handleDeleteExternalPhoto,
    handleRemoveGalleryPhoto,
    handleCropSave,
    handleEnhanceHero,
    handleEnhancePhoto,
    handleRevertEnhance,
    handleUploadHero,
    handleMarkNotTouchless,
    handleSetEquipment,
    handleBatchSetEquipment,
    getModelsForBrand,
    customBrands,
    handleFlag,
    navigateFocus,
    selectedIds,
    toggleSelected,
    selectAllVisible,
    clearSelection,
    reload,
  } = useHeroReview();

  // Local state for page input so user can clear/retype freely
  const [pageInputValue, setPageInputValue] = useState(String(page + 1));
  useEffect(() => {
    setPageInputValue(String(page + 1));
  }, [page]);

  const commitPageInput = () => {
    const val = parseInt(pageInputValue, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      setPage(val - 1);
    } else {
      setPageInputValue(String(page + 1));
    }
  };

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

  const handleVendorChange = useCallback((val: string) => {
    setFilterVendorId(val);
    setPage(0);
  }, [setFilterVendorId, setPage]);

  return (
    <div className="min-h-screen bg-gray-50">

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

          <VendorCombobox
            vendors={vendors}
            value={filterVendorId}
            onChange={handleVendorChange}
          />

          <select
            value={filterEquipmentBrand}
            onChange={(e) => { setFilterEquipmentBrand(e.target.value); setPage(0); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
          >
            <option value="">All Equipment</option>
            {EQUIPMENT_BRANDS.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
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

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showNoEquipmentOnly}
              onChange={(e) => { setShowNoEquipmentOnly(e.target.checked); setPage(0); }}
              className="rounded border-gray-300 text-orange-500 focus:ring-orange-300"
            />
            No Equipment
          </label>

          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
            {totalCount.toLocaleString()} listings
          </span>
        </div>

        <EquipmentImport onComplete={reload} getModelsForBrand={getModelsForBrand} customBrands={customBrands} />

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
                    const idx = url ? replacements.findIndex(r => r.url === url) : -1;
                    handleReplace(listing.id, url, source, idx);
                  }}
                  onRemoveHero={() => handleRemoveHero(listing.id)}
                  onDeleteHero={() => handleDeleteHeroPhoto(listing.id)}
                  onDeleteExternalPhoto={(field) => handleDeleteExternalPhoto(listing.id, field)}
                  onRemoveGalleryPhoto={(url) => handleRemoveGalleryPhoto(listing.id, url)}
                  onCropSave={(url) => handleCropSave(listing.id, url)}
                  onEnhance={(imageUrl) => handleEnhanceHero(listing.id, imageUrl)}
                  onEnhancePhoto={(imageUrl) => handleEnhancePhoto(listing.id, imageUrl)}
                  onRevertEnhance={(originalUrl, originalSource) => handleRevertEnhance(listing.id, originalUrl, originalSource)}
                  onUploadHero={(file) => handleUploadHero(listing.id, file)}
                  onMarkNotTouchless={() => handleMarkNotTouchless(listing.id)}
                  onSetEquipment={(brand, model) => handleSetEquipment(listing.id, brand, model)}
                  getModelsForBrand={getModelsForBrand}
                  customBrands={customBrands}
                  onFlag={() => handleFlag(listing.id)}
                  onFocus={() => setFocusedId(listing.id)}
                  confirmIndex={confirmIndex}
                  isSelected={selectedIds.has(listing.id)}
                  onToggleSelect={() => toggleSelected(listing.id)}
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

            <span className="text-sm text-gray-600 flex items-center gap-1.5">
              Page
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    commitPageInput();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-16 px-2 py-1 text-sm text-center rounded-md border border-gray-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              />
              of {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
              className="ml-4 px-2 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-600 cursor-pointer"
              title="Cards per page"
            >
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        )}

        <div className="mt-6 p-3 bg-white rounded-lg border border-gray-200 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Keyboard shortcuts:</span>{' '}
          Arrow keys to navigate cards &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">X</kbd> to open/close replace panel &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">1</kbd>-<kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">5</kbd> to select replacement &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">Del</kbd>/<kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">Backspace</kbd> delete photo in lightbox &bull; <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">Esc</kbd> to close panel
        </div>

      </div>

      {/* Batch equipment assignment bar */}
      {selectedIds.size > 0 && (
        <BatchEquipmentBar
          selectedCount={selectedIds.size}
          totalVisible={listings.length}
          onSelectAll={selectAllVisible}
          onClearSelection={clearSelection}
          onApply={(brand, model) => handleBatchSetEquipment(Array.from(selectedIds), brand, model)}
          getModelsForBrand={getModelsForBrand}
          customBrands={customBrands}
        />
      )}
    </div>
  );
}
