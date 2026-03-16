'use client';

import { useState } from 'react';
import { usePhotoAudit, AuditResult } from './usePhotoAudit';
import { Camera, Wrench, Trash2, Play, Loader2, Check, X, Undo2, ChevronDown, ChevronUp, ExternalLink, Eye, Filter } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getStateSlug, slugify } from '@/lib/constants';

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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-8" onClick={onClose}>
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

function EquipmentRow({ result, onApply, onReject, onUndo }: {
  result: AuditResult;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
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
        {/* Thumbnail — show source photo if equipment found, otherwise hero */}
        {(result.equipment_source_photo || result.listing_hero) && (
          <PhotoThumb
            url={result.equipment_source_photo || result.listing_hero!}
            onClick={() => setModalUrl(result.equipment_source_photo || result.listing_hero!)}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-800 truncate">{result.listing_name}</p>
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
                <Badge text={`${result.photos_to_remove.length} removed`} className="bg-red-50 text-red-500" />
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

type EquipmentFilter = 'all' | 'detected' | 'none' | 'pending';

export default function PhotoAuditPage() {
  const {
    results, loading, tab, setTab, running, runProgress, stats, queueStats,
    includeGooglePhotos, setIncludeGooglePhotos,
    runBatch, applyEquipment, rejectResult, applyAllHighConfidence, undoApply,
  } = usePhotoAudit();

  const [batchLimit, setBatchLimit] = useState(10);
  const [equipFilter, setEquipFilter] = useState<EquipmentFilter>('all');

  // Filter results by tab
  const allResults = results;
  const equipmentDetected = results.filter(r => r.equipment_brand);
  const equipmentNone = results.filter(r => !r.equipment_brand);
  const heroResults = results.filter(r => r.hero_quality === 'poor' && r.suggested_hero_url);
  const cleanupResults = results.filter(r => r.photos_to_remove.length > 0);

  const pendingEquipment = equipmentDetected.filter(r => !r.applied && !r.reviewed);
  const appliedEquipment = equipmentDetected.filter(r => r.applied);

  // Equipment tab filtering
  const filteredEquipmentResults = (() => {
    switch (equipFilter) {
      case 'detected': return equipmentDetected;
      case 'none': return equipmentNone;
      case 'pending': return pendingEquipment;
      default: return allResults;
    }
  })();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Photo Audit Pipeline</h1>
      <p className="text-sm text-gray-500 mb-6">
        AI-powered batch processing for equipment classification, hero image quality, and photo cleanup.
      </p>

      {/* Pipeline progress */}
      {queueStats.totalUntagged > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Pipeline Progress</p>
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{queueStats.alreadyAudited}</span>
              {' / '}
              <span className="font-semibold text-gray-900">{queueStats.totalUntagged + queueStats.alreadyAudited}</span>
              {' listings processed'}
              <span className="text-gray-400 ml-2">
                ({queueStats.remaining.toLocaleString()} remaining)
              </span>
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-400 to-orange-500 h-3 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(1, (queueStats.alreadyAudited / (queueStats.totalUntagged + queueStats.alreadyAudited)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Touchless listings with images
          </p>
        </div>
      )}

      {/* Run controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Batch size:</label>
            <input
              type="number"
              min={1}
              max={500}
              value={batchLimit}
              onChange={e => setBatchLimit(Number(e.target.value))}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
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
            onClick={() => runBatch(batchLimit, true, includeGooglePhotos)}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Dry Run
          </button>
          <button
            onClick={() => runBatch(batchLimit, false, includeGooglePhotos)}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0F2744] text-white rounded-lg text-sm font-medium hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Batch
          </button>
        </div>
        {runProgress && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded">{runProgress}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total audited</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{equipmentDetected.length}</p>
          <p className="text-xs text-gray-500">Equipment found</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingEquipment.length}</p>
          <p className="text-xs text-gray-500">Need review</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{cleanupResults.length}</p>
          <p className="text-xs text-gray-500">Photos cleaned</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('equipment')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'equipment' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Wrench className="w-4 h-4" /> All Results ({allResults.length})
        </button>
        <button
          onClick={() => setTab('heroes')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'heroes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Camera className="w-4 h-4" /> Heroes ({heroResults.length})
        </button>
        <button
          onClick={() => setTab('cleanup')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'cleanup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Trash2 className="w-4 h-4" /> Cleanup ({cleanupResults.length})
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Equipment / All Results tab */}
            {tab === 'equipment' && (
              <>
                {/* Filter bar */}
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    {(['all', 'detected', 'none', 'pending'] as EquipmentFilter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setEquipFilter(f)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          equipFilter === f
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {f === 'all' && `All (${allResults.length})`}
                        {f === 'detected' && `Equipment (${equipmentDetected.length})`}
                        {f === 'none' && `No match (${equipmentNone.length})`}
                        {f === 'pending' && `Pending (${pendingEquipment.length})`}
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

                {filteredEquipmentResults.length === 0 ? (
                  <p className="px-4 py-12 text-center text-sm text-gray-500">
                    {allResults.length === 0
                      ? 'No audit results yet. Run a batch to get started.'
                      : 'No results match this filter.'}
                  </p>
                ) : (
                  filteredEquipmentResults.map(r => (
                    <EquipmentRow
                      key={r.id}
                      result={r}
                      onApply={() => applyEquipment(r.id, r.listing_id, r.equipment_brand!, r.equipment_model)}
                      onReject={() => rejectResult(r.id)}
                      onUndo={() => undoApply(r.id, r.listing_id)}
                    />
                  ))
                )}
              </>
            )}

            {/* Heroes tab */}
            {tab === 'heroes' && (
              heroResults.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-gray-500">
                  No hero replacements suggested yet.
                </p>
              ) : (
                heroResults.map(r => <HeroRow key={r.id} result={r} />)
              )
            )}

            {/* Cleanup tab */}
            {tab === 'cleanup' && (
              cleanupResults.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-gray-500">
                  No photos flagged for removal yet.
                </p>
              ) : (
                cleanupResults.map(r => <CleanupRow key={r.id} result={r} />)
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
