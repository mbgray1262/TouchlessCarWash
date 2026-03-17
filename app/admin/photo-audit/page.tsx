'use client';

import { useState } from 'react';
import { usePhotoAudit, AuditResult } from './usePhotoAudit';
import { Camera, Wrench, Trash2, Play, Loader2, Check, X, Undo2, ChevronDown, ChevronUp, ExternalLink, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { getStateSlug, slugify } from '@/lib/constants';
import { ListingEditorModal } from './ListingEditorModal';

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

const HERO_QUALITY_COLORS: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  acceptable: 'bg-amber-100 text-amber-700',
  poor: 'bg-red-100 text-red-700',
};

function Badge({ text, className }: { text: string; className: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${className}`}>{text}</span>;
}

function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="relative w-full h-[75vh] rounded-lg overflow-hidden bg-gray-900">
          <Image src={url} alt="" fill className="object-contain" sizes="(max-width: 1024px) 100vw, 900px" />
        </div>
      </div>
    </div>
  );
}

function PhotoThumb({ url, size = 80, onClick }: { url: string; size?: number; onClick?: () => void }) {
  return (
    <div
      className={`relative shrink-0 rounded overflow-hidden bg-gray-100 ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-orange-400 transition-shadow' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <Image src={url} alt="" fill className="object-cover" sizes={`${size}px`} />
    </div>
  );
}

function ListingLink({ result }: { result: AuditResult }) {
  if (!result.listing_name || !result.listing_slug || !result.listing_city || !result.listing_state) return null;
  const stateSlug = getStateSlug(result.listing_state);
  const citySlug = slugify(result.listing_city);
  return (
    <a
      href={`/state/${stateSlug}/${citySlug}/${result.listing_slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-400 hover:text-orange-500 transition-colors"
      title="View listing (new tab)"
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}

function EquipmentRow({ result, onApply, onReject, onUndo, onOpenEditor }: {
  result: AuditResult;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
  onOpenEditor: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const hasEquipment = !!result.equipment_brand;
  const rawEquip = (result.raw_response ?? {}) as Record<string, unknown>;
  const equipData = (rawEquip.equipment ?? null) as Record<string, unknown> | null;
  const heroData = (rawEquip.hero_assessment ?? null) as Record<string, unknown> | null;
  const visibleText = equipData ? String(equipData.visible_text ?? '') : '';

  return (
    <div className={`border-b border-gray-100 last:border-0 ${!hasEquipment ? 'opacity-70' : ''}`}>
      {modalUrl && <PhotoModal url={modalUrl} onClose={() => setModalUrl(null)} />}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        {/* Thumbnail — click to open listing editor */}
        {(result.equipment_source_photo || result.listing_hero) && (
          <PhotoThumb
            url={result.equipment_source_photo || result.listing_hero!}
            onClick={onOpenEditor}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={onOpenEditor} className="text-sm font-medium text-gray-800 truncate hover:text-orange-600 transition-colors text-left">{result.listing_name}</button>
            <ListingLink result={result} />
          </div>
          <p className="text-xs text-gray-500">{result.listing_city}, {result.listing_state}</p>
          {hasEquipment ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold text-indigo-700">{result.equipment_brand}</span>
              {result.equipment_model && (
                <span className="text-sm text-gray-600">· {result.equipment_model}</span>
              )}
              <Badge text={result.equipment_confidence!} className={CONFIDENCE_COLORS[result.equipment_confidence!] ?? 'bg-gray-100 text-gray-600'} />
              {visibleText && (
                <span className="text-xs text-gray-400 italic">&quot;{visibleText}&quot;</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">No equipment detected</span>
              {result.hero_quality && (
                <Badge text={`hero: ${result.hero_quality}`} className={HERO_QUALITY_COLORS[result.hero_quality] ?? 'bg-gray-100 text-gray-600'} />
              )}
              {result.photos_to_remove.length > 0 && (
                <Badge
                  text={`${result.photos_to_remove.length} ${result.applied ? 'removed' : 'flagged'}`}
                  className={result.applied ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}
                />
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasEquipment && (
            <>
              {result.applied ? (
                <>
                  <Badge text="Auto-applied" className="bg-green-100 text-green-700" />
                  <button onClick={onUndo} className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-orange-500" title="Undo">
                    <Undo2 className="w-4 h-4" />
                  </button>
                </>
              ) : result.reviewed ? (
                <Badge text="Rejected" className="bg-gray-100 text-gray-500" />
              ) : (
                <>
                  <button onClick={onApply} className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button onClick={onReject} className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </>
              )}
            </>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Show AI reasoning in a readable format */}
          {heroData && (
            <div className="text-xs text-gray-600 bg-blue-50 px-3 py-2 rounded">
              <strong>Hero:</strong> {String(heroData.current_hero_quality)} — {String(heroData.reason)}
            </div>
          )}
          {equipData && hasEquipment && (
            <div className="text-xs text-gray-600 bg-indigo-50 px-3 py-2 rounded">
              <strong>Equipment:</strong> {String(equipData.brand)} {equipData.model ? `· ${String(equipData.model)}` : ''} ({String(equipData.confidence)})
              {visibleText && <> — saw &quot;{visibleText}&quot;</>}
            </div>
          )}
          {result.raw_response && (
            <details className="text-xs">
              <summary className="text-gray-400 cursor-pointer hover:text-gray-600">Raw JSON</summary>
              <pre className="bg-gray-50 p-3 rounded overflow-x-auto max-h-48 mt-1">
                {JSON.stringify(result.raw_response, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function HeroRow({ result }: { result: AuditResult }) {
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      {modalUrl && <PhotoModal url={modalUrl} onClose={() => setModalUrl(null)} />}
      <div className="flex items-center gap-2">
        {result.listing_hero && <PhotoThumb url={result.listing_hero} onClick={() => setModalUrl(result.listing_hero!)} />}
        <span className="text-gray-400 text-sm">→</span>
        {result.suggested_hero_url && <PhotoThumb url={result.suggested_hero_url} onClick={() => setModalUrl(result.suggested_hero_url!)} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800 truncate">{result.listing_name}</p>
          <ListingLink result={result} />
        </div>
        <p className="text-xs text-gray-500">{result.suggested_hero_reason}</p>
      </div>
      <div className="shrink-0">
        {result.applied ? (
          <Badge text="Auto-replaced" className="bg-green-100 text-green-700" />
        ) : (
          <Badge text={result.hero_quality ?? 'unknown'} className={HERO_QUALITY_COLORS[result.hero_quality ?? ''] ?? 'bg-gray-100 text-gray-600'} />
        )}
      </div>
    </div>
  );
}

function CleanupRow({ result }: { result: AuditResult }) {
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rawResponse = result.raw_response as Record<string, unknown> | null;
  const verdicts = (rawResponse?.photo_verdicts as Array<{ index: number; keep: boolean; reason: string }>) ?? [];
  const removeVerdicts = verdicts.filter(v => !v.keep);

  return (
    <div className="px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      {modalUrl && <PhotoModal url={modalUrl} onClose={() => setModalUrl(null)} />}
      <div className="flex items-center gap-3 mb-2">
        <p className="text-sm font-medium text-gray-800 truncate flex-1">{result.listing_name}</p>
        <ListingLink result={result} />
        <Badge text={`${result.photos_to_remove.length} flagged`} className="bg-red-100 text-red-700" />
        {result.applied && <Badge text="Auto-removed" className="bg-green-100 text-green-700" />}
        <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex gap-3 flex-wrap">
        {result.photos_to_remove.slice(0, 8).map((url, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <PhotoThumb url={url} size={70} onClick={() => setModalUrl(url)} />
            {removeVerdicts[i] && (
              <span className="text-[10px] text-red-500 max-w-[70px] text-center leading-tight truncate" title={removeVerdicts[i].reason}>
                {removeVerdicts[i].reason}
              </span>
            )}
          </div>
        ))}
        {result.photos_to_remove.length > 8 && (
          <div className="w-[70px] h-[70px] flex items-center justify-center bg-gray-100 rounded text-xs text-gray-500">
            +{result.photos_to_remove.length - 8}
          </div>
        )}
      </div>
      {expanded && removeVerdicts.length > 0 && (
        <div className="mt-2 space-y-1">
          {removeVerdicts.map((v, i) => (
            <div key={i} className="text-xs text-gray-600 bg-red-50 px-3 py-1.5 rounded">
              <span className="font-medium text-red-600">Photo {v.index}:</span> {v.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

type ViewFilter = 'all' | 'review' | 'equipment' | 'heroes' | 'cleanup';

export default function PhotoAuditPage() {
  const {
    results, loading, tab, setTab, running, runProgress, stats, queueStats,
    includeGooglePhotos, setIncludeGooglePhotos, activeJob,
    runBatch, applyEquipment, rejectResult, applyAllHighConfidence, undoApply, reload,
  } = usePhotoAudit();

  const [batchLimit, setBatchLimit] = useState(100);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [page, setPage] = useState(1);
  const [editorListingId, setEditorListingId] = useState<string | null>(null);

  // Derived lists
  const equipmentDetected = results.filter(r => r.equipment_brand);
  const pendingEquipment = equipmentDetected.filter(r => !r.applied && !r.reviewed);
  const poorHeroes = results.filter(r => r.hero_quality === 'poor' && r.suggested_hero_url && !r.applied);
  const cleanupResults = results.filter(r => r.photos_to_remove.length > 0);
  const pendingCleanup = cleanupResults.filter(r => !r.applied);
  // Need Review = anything with an unresolved action (pending equipment, poor heroes, or flagged-not-removed photos)
  const needsReviewSet = new Set<string>();
  const needsReview = results.filter(r => {
    const needs = (r.equipment_brand && !r.applied && !r.reviewed) ||
      (r.hero_quality === 'poor' && r.suggested_hero_url && !r.applied) ||
      (r.photos_to_remove.length > 0 && !r.applied);
    if (needs && !needsReviewSet.has(r.id)) {
      needsReviewSet.add(r.id);
      return true;
    }
    return false;
  });

  // Filtered results
  const filteredResults = (() => {
    switch (viewFilter) {
      case 'review': return needsReview;
      case 'equipment': return equipmentDetected;
      case 'heroes': return results.filter(r => r.hero_quality === 'poor' && r.suggested_hero_url);
      case 'cleanup': return cleanupResults;
      default: return results;
    }
  })();

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedResults = filteredResults.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when filter changes
  const setFilterAndReset = (f: ViewFilter) => { setViewFilter(f); setPage(1); };

  // Progress percentage — totalUntagged is the full universe of touchless listings with images
  const totalListings = queueStats.totalUntagged;
  const progressPct = totalListings > 0 ? Math.max(1, (queueStats.alreadyAudited / totalListings) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Photo Audit Pipeline</h1>
      <p className="text-sm text-gray-500 mb-6">
        AI-powered batch processing for equipment classification, hero image quality, and photo cleanup.
      </p>

      {/* Progress + Run controls combined */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4">
        {/* Progress bar */}
        {totalListings > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-gray-700">
                {queueStats.alreadyAudited.toLocaleString()} / {totalListings.toLocaleString()} audited
              </p>
              <p className="text-sm text-gray-500">
                {queueStats.remaining.toLocaleString()} remaining
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-400 to-orange-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Run controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Batch size:</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={batchLimit}
              onChange={e => setBatchLimit(Number(e.target.value))}
              className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeGooglePhotos}
              onChange={e => setIncludeGooglePhotos(e.target.checked)}
              className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-gray-700">Fetch Google Photos</span>
            <span className="text-xs text-gray-400">(+~10s/listing)</span>
          </label>
          <button
            onClick={() => runBatch(batchLimit, false, includeGooglePhotos)}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0F2744] text-white rounded-lg text-sm font-medium hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running...' : 'Run Batch'}
          </button>
          <button
            onClick={() => runBatch(queueStats.remaining, false, includeGooglePhotos)}
            disabled={running || queueStats.remaining === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run All ({queueStats.remaining.toLocaleString()})
          </button>
        </div>
        {/* Job progress */}
        {runProgress && (
          <div className="space-y-2">
            {activeJob && activeJob.status === 'running' && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${activeJob.total_requested > 0 ? Math.max(2, (activeJob.total_processed / activeJob.total_requested) * 100) : 0}%` }}
                />
              </div>
            )}
            <p className={`text-sm p-3 rounded ${
              activeJob?.status === 'failed' ? 'text-red-600 bg-red-50' :
              activeJob?.status === 'running' ? 'text-blue-600 bg-blue-50' :
              'text-gray-600 bg-gray-50'
            }`}>
              {running && <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" />}
              {runProgress}
              {running && <span className="text-xs text-gray-400 ml-2">(runs in background — you can navigate away)</span>}
            </p>
          </div>
        )}
      </div>

      {/* Single filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {([
              { key: 'all', label: `All (${results.length})` },
              { key: 'review', label: `Need Review (${needsReview.length})` },
              { key: 'equipment', label: `Equipment (${equipmentDetected.length})` },
              { key: 'heroes', label: `Poor Heroes (${poorHeroes.length})` },
              { key: 'cleanup', label: `Cleanup (${cleanupResults.length})` },
            ] as { key: ViewFilter; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilterAndReset(f.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewFilter === f.key
                    ? f.key === 'review' && needsReview.length > 0
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white text-gray-900 shadow-sm'
                    : f.key === 'review' && needsReview.length > 0
                      ? 'text-amber-600 font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {pendingEquipment.length > 0 && (
            <button
              onClick={applyAllHighConfidence}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
            >
              <Check className="w-3 h-3" /> Apply All High Confidence
            </button>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filteredResults.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            {results.length === 0 ? 'No audit results yet. Run a batch to get started.' : 'No results match this filter.'}
          </p>
        ) : (
          <>
            {(viewFilter === 'heroes' ? paginatedResults.map(r => <HeroRow key={r.id} result={r} />) :
              viewFilter === 'cleanup' ? paginatedResults.map(r => <CleanupRow key={r.id} result={r} />) :
              paginatedResults.map(r => (
                <EquipmentRow
                  key={r.id}
                  result={r}
                  onApply={() => applyEquipment(r.id, r.listing_id, r.equipment_brand!, r.equipment_model)}
                  onReject={() => rejectResult(r.id)}
                  onUndo={() => undoApply(r.id, r.listing_id)}
                  onOpenEditor={() => setEditorListingId(r.listing_id)}
                />
              ))
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredResults.length)} of {filteredResults.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    // Show pages around current page
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (safePage <= 4) {
                      pageNum = i + 1;
                    } else if (safePage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = safePage - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded text-xs font-medium ${
                          pageNum === safePage ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Listing editor modal */}
      {editorListingId && (
        <ListingEditorModal
          listingId={editorListingId}
          onClose={() => setEditorListingId(null)}
          onUpdate={reload}
        />
      )}
    </div>
  );
}
