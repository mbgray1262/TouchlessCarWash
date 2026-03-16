'use client';

import { useState } from 'react';
import { usePhotoAudit, AuditResult } from './usePhotoAudit';
import { Camera, Wrench, Trash2, Play, Loader2, Check, X, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';

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

function PhotoThumb({ url, size = 80 }: { url: string; size?: number }) {
  return (
    <div className="relative shrink-0 rounded overflow-hidden bg-gray-100" style={{ width: size, height: size }}>
      <Image src={url} alt="" fill className="object-cover" sizes={`${size}px`} />
    </div>
  );
}

function EquipmentRow({ result, onApply, onReject, onUndo }: {
  result: AuditResult;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        {result.equipment_source_photo && (
          <PhotoThumb url={result.equipment_source_photo} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{result.listing_name}</p>
          <p className="text-xs text-gray-500">{result.listing_city}, {result.listing_state}</p>
          <div className="flex items-center gap-2 mt-1">
            {result.equipment_brand && (
              <span className="text-sm font-semibold text-indigo-700">{result.equipment_brand}</span>
            )}
            {result.equipment_model && (
              <span className="text-sm text-gray-600">· {result.equipment_model}</span>
            )}
            {result.equipment_confidence && (
              <Badge text={result.equipment_confidence} className={CONFIDENCE_COLORS[result.equipment_confidence] ?? 'bg-gray-100 text-gray-600'} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {expanded && result.raw_response && (
        <div className="px-4 pb-3">
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto max-h-48">
            {JSON.stringify(result.raw_response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function HeroRow({ result }: { result: AuditResult }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <div className="flex items-center gap-2">
        {result.listing_hero && <PhotoThumb url={result.listing_hero} />}
        <span className="text-gray-400 text-sm">→</span>
        {result.suggested_hero_url && <PhotoThumb url={result.suggested_hero_url} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{result.listing_name}</p>
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
  return (
    <div className="px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <div className="flex items-center gap-3 mb-2">
        <p className="text-sm font-medium text-gray-800 truncate flex-1">{result.listing_name}</p>
        <Badge text={`${result.photos_to_remove.length} flagged`} className="bg-red-100 text-red-700" />
        {result.applied && <Badge text="Auto-removed" className="bg-green-100 text-green-700" />}
      </div>
      <div className="flex gap-2 flex-wrap">
        {result.photos_to_remove.slice(0, 6).map((url, i) => (
          <PhotoThumb key={i} url={url} size={60} />
        ))}
        {result.photos_to_remove.length > 6 && (
          <div className="w-[60px] h-[60px] flex items-center justify-center bg-gray-100 rounded text-xs text-gray-500">
            +{result.photos_to_remove.length - 6}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PhotoAuditPage() {
  const {
    results, loading, tab, setTab, running, runProgress, stats,
    runBatch, applyEquipment, rejectResult, applyAllHighConfidence, undoApply,
  } = usePhotoAudit();

  const [batchLimit, setBatchLimit] = useState(10);

  // Filter results by tab
  const equipmentResults = results.filter(r => r.equipment_brand);
  const heroResults = results.filter(r => r.hero_quality === 'poor' && r.suggested_hero_url);
  const cleanupResults = results.filter(r => r.photos_to_remove.length > 0);

  const pendingEquipment = equipmentResults.filter(r => !r.applied && !r.reviewed);
  const appliedEquipment = equipmentResults.filter(r => r.applied);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Photo Audit Pipeline</h1>
      <p className="text-sm text-gray-500 mb-6">
        AI-powered batch processing for equipment classification, hero image quality, and photo cleanup.
      </p>

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
          <button
            onClick={() => runBatch(batchLimit, true)}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Dry Run
          </button>
          <button
            onClick={() => runBatch(batchLimit, false)}
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
          <p className="text-2xl font-bold text-green-600">{stats.applied}</p>
          <p className="text-xs text-gray-500">Auto-applied</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          <p className="text-xs text-gray-500">Pending review</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{stats.equipment}</p>
          <p className="text-xs text-gray-500">Equipment to review</p>
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
          <Wrench className="w-4 h-4" /> Equipment ({equipmentResults.length})
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
            {/* Equipment tab */}
            {tab === 'equipment' && (
              <>
                {pendingEquipment.length > 0 && (
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {pendingEquipment.length} pending review
                    </span>
                    <button
                      onClick={applyAllHighConfidence}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
                    >
                      <Check className="w-3 h-3" /> Apply All High Confidence
                    </button>
                  </div>
                )}

                {appliedEquipment.length > 0 && (
                  <div className="px-4 py-2 bg-green-50 border-b">
                    <span className="text-xs font-medium text-green-700">
                      {appliedEquipment.length} auto-applied
                    </span>
                  </div>
                )}

                {equipmentResults.length === 0 ? (
                  <p className="px-4 py-12 text-center text-sm text-gray-500">
                    No equipment detections yet. Run a batch to get started.
                  </p>
                ) : (
                  equipmentResults.map(r => (
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
