'use client';

import { useState, useEffect } from 'react';
import { usePhotoAudit, AuditResult, ViewFilter, LowResListing } from './usePhotoAudit';
import { supabase } from '@/lib/supabase';
import { Camera, Wrench, Trash2, Play, Loader2, Check, X, Undo2, ChevronDown, ChevronUp, ExternalLink, Filter, ChevronLeft, ChevronRight, ScanLine, Search, Trophy } from 'lucide-react';
import { getStateSlug, slugify } from '@/lib/constants';
import { FastCurationModal } from './FastCurationModal';
import { getChainBrandImage } from '@/lib/chain-brand-images';

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
          <img src={url} alt="" className="absolute inset-0 w-full h-full object-contain" referrerPolicy="no-referrer" />
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
      <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
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
        {/* Thumbnail — always the listing's hero image. If there's no hero,
            show an empty placeholder so what you click matches what the
            curation modal opens to. */}
        {result.listing_hero ? (
          <PhotoThumb url={result.listing_hero} onClick={onOpenEditor} />
        ) : (
          <button
            onClick={onOpenEditor}
            className="shrink-0 w-20 h-20 rounded bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide hover:bg-gray-200"
          >
            No Hero
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onOpenEditor} className="text-sm font-medium text-gray-800 truncate hover:text-orange-600 transition-colors text-left">{result.listing_name}</button>
            <ListingLink result={result} />
            {/* Closed-status pill — surfaces in the held-list view so admins
                can skip closed locations without opening the modal. Source
                is set by markClosed() in useFastCuration.ts. */}
            {(() => {
              const cs = result.listing_classification_source || '';
              if (/closed_permanently/i.test(cs)) {
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700" title="Permanently closed — skip review">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Permanently Closed
                  </span>
                );
              }
              if (/closed_temporarily/i.test(cs)) {
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800" title="Temporarily closed — skip review">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Temporarily Closed
                  </span>
                );
              }
              return null;
            })()}
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
        <span className="text-gray-400 text-sm">&rarr;</span>
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

function LowResCard({ listing, onEdit, onDismiss }: { listing: LowResListing; onEdit: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 overflow-hidden bg-white hover:shadow-md transition-shadow">
      <div className="relative w-full aspect-[4/3] bg-gray-100 cursor-pointer" onClick={onEdit}>
        {listing.hero_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.hero_image} alt={listing.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <Camera className="w-8 h-8" />
          </div>
        )}
        <div className="absolute top-1 left-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          LOW RES
        </div>
      </div>
      <div className="p-2 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{listing.name}</p>
          <p className="text-[10px] text-gray-500 truncate">{listing.city}, {listing.state}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          title="Mark as fixed — removes from this list"
          className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-[10px] font-medium transition-colors"
        >
          <Check className="w-3 h-3" /> Fixed
        </button>
      </div>
    </div>
  );
}

// Medal colors for the gold/silver/bronze trophy pill.
const TROPHY_COLORS: Record<number, string> = {
  1: 'bg-amber-100 text-amber-800',
  2: 'bg-gray-200 text-gray-700',
  3: 'bg-orange-100 text-orange-800',
};

function BestOfRow({ result, onOpenEditor, onMarkReviewed, onUnmarkReviewed }: {
  result: AuditResult;
  onOpenEditor: () => void;
  onMarkReviewed: () => void;
  onUnmarkReviewed: () => void;
}) {
  const labels = result.best_of_labels ?? [];
  const rank = result.best_of_rank ?? 99;
  const noHero = !result.listing_hero;
  const lowRes = result.hero_quality === 'poor';
  const reviewed = result.reviewed;

  return (
    <div className={`flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
      reviewed ? 'opacity-60' :
      noHero ? 'bg-red-50 border-l-4 border-l-red-400' : lowRes ? 'bg-amber-50 border-l-4 border-l-amber-400' : ''
    }`}>
      {result.listing_hero ? (
        <img
          src={result.listing_hero}
          alt={result.listing_name}
          className="w-20 h-14 rounded object-cover flex-shrink-0 cursor-pointer border border-gray-200"
          loading="lazy"
          referrerPolicy="no-referrer"
          onClick={onOpenEditor}
        />
      ) : (
        <button
          onClick={onOpenEditor}
          className="w-20 h-14 rounded bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-[10px] font-semibold text-gray-400 uppercase flex-shrink-0 hover:bg-gray-200"
        >
          No Hero
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${TROPHY_COLORS[rank] ?? 'bg-teal-100 text-teal-700'}`}>
            <Trophy className="w-3 h-3" /> {rank <= 3 ? `#${rank}` : `Top ${rank}`}
          </span>
          <button onClick={onOpenEditor} className="text-sm font-medium text-gray-800 truncate hover:text-orange-600 transition-colors text-left">
            {result.listing_name}
          </button>
          <ListingLink result={result} />
          {noHero && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">NO HERO</span>}
          {lowRes && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-medium">LOW RES</span>}
          {reviewed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              <Check className="w-3 h-3" /> Reviewed
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">{result.listing_city}, {result.listing_state}</p>
        {labels.length > 0 && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5" title={labels.join(' · ')}>
            🏆 {labels.slice(0, 3).join(' · ')}{labels.length > 3 ? ` · +${labels.length - 3} more` : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onOpenEditor}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white"
        >
          {noHero || lowRes ? 'Fix Hero' : 'Review Hero'}
        </button>
        {reviewed ? (
          <button
            onClick={onUnmarkReviewed}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 hover:bg-gray-300 text-gray-700"
            title="Move back to the To Review queue"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        ) : (
          <button
            onClick={onMarkReviewed}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white"
            title="Hero looks good — mark reviewed and remove from the queue"
          >
            <Check className="w-3.5 h-3.5" /> Looks Good
          </button>
        )}
      </div>
    </div>
  );
}

export default function PhotoAuditPage() {
  const {
    results, loading, running, runProgress, stats, queueStats,
    includeGooglePhotos, setIncludeGooglePhotos, activeJob,
    washType, setWashType,
    stateFilter, setStateFilter, selfServeStateCounts,
    viewFilter, unreviewedOnly, setUnreviewedOnly, searchQuery, setSearch, page, filteredTotal, totalPages, pageSize,
    changeFilter, changePage,
    runBatch, applyEquipment, rejectResult, applyAllHighConfidence, undoApply, reload,
    noHeroCount, noHeroUnprocessed, heldCount, secondLookCount, bestOfCount, removeFromResults,
    bestOfReviewedCount, bestOfTotal, bestOfSubFilter, setBestOfSubFilter, markBestOfReviewed, unmarkBestOfReviewed, aiPickedCount,
    noHeroSubFilter, setNoHeroSubFilter, markAllChainListingsAudited,
    lowResListings, lowResTotal, lowResPage, lowResTotalPages, changeLowResPage,
    dismissLowRes, scanForLowRes, scanProgress,
    equipmentBrand, equipmentBrands, setEquipmentBrand,
  } = usePhotoAudit();

  const [batchLimit, setBatchLimit] = useState(100);
  const [editorListingId, setEditorListingId] = useState<string | null>(null);
  // Stable navigation list — snapshot of listing IDs when modal opens
  const [navList, setNavList] = useState<string[]>([]);
  const [navIndex, setNavIndex] = useState(0);

  // Open the editor modal and snapshot the navigation list
  const openEditor = (listingId: string) => {
    const ids = viewFilter === 'low_res'
      ? lowResListings.map(l => l.id)
      : results.map(r => r.listing_id);
    const idx = ids.indexOf(listingId);
    setNavList(ids);
    setNavIndex(idx >= 0 ? idx : 0);
    setEditorListingId(listingId);
  };

  // Deep-link: /admin/photo-audit?edit=<listingId> opens that listing's editor
  // directly, without it needing to be in the current queue. The modal fetches
  // its own data by id (ListingEditorModal loads .eq('id', listingId)), so this
  // just needs to set the id. Used by the AI spot-check contact sheet so each
  // card opens the SAME editor — pick a different Google photo / Street View,
  // mark not-self-serve / also-touchless — instead of only the read-only listing.
  // Read once on mount from window.location (no useSearchParams → no Suspense).
  // ?wash=self_serve also flips the wash-type toggle, so the editor shows the
  // self-serve action buttons ("Not Self-Serve" / "Also Touchless" / "Confirm
  // Self-Serve & Approve") rather than the default touchless set.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('wash') === 'self_serve') setWashType('self_serve');
    const id = p.get('edit');
    if (id) { setNavList([id]); setNavIndex(0); setEditorListingId(id); }
  }, [setWashType]);

  const navigateNext = () => {
    if (navIndex < navList.length - 1) {
      const nextIdx = navIndex + 1;
      setNavIndex(nextIdx);
      setEditorListingId(navList[nextIdx]);
    } else {
      setEditorListingId(null);
    }
  };

  const navigatePrev = () => {
    if (navIndex > 0) {
      const prevIdx = navIndex - 1;
      setNavIndex(prevIdx);
      setEditorListingId(navList[prevIdx]);
    }
  };

  const safePage = Math.min(page, totalPages);

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
                {queueStats.alreadyAudited.toLocaleString()} / {totalListings.toLocaleString()} touchless listings scanned by AI
              </p>
              <p className="text-sm text-gray-500">
                {queueStats.remaining.toLocaleString()} not yet scanned
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

        {/* Paid-API cost warning */}
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <div>
            <div className="font-bold mb-1">⚠️ &ldquo;Run Batch&rdquo; / &ldquo;Run All&rdquo; use paid Anthropic API credits</div>
            <div>
              Each listing processed makes Claude vision API calls (Haiku + Sonnet) for photo classification.
              Rough cost: <strong>~$0.02–$0.05 per listing</strong>. &ldquo;Run All ({(viewFilter === 'no_hero' ? noHeroUnprocessed : queueStats.remaining).toLocaleString()})&rdquo; would cost roughly <strong>${(((viewFilter === 'no_hero' ? noHeroUnprocessed : queueStats.remaining) * 0.035).toFixed(0))}</strong> in API credits.
            </div>
          </div>
          <div className="pt-2 border-t border-amber-300">
            <div className="font-bold mb-1">✅ Free manual curation</div>
            <div>
              <strong>Click any listing name below</strong> to open the manual photo curator — you can pick an existing photo, upload a new one, or paste an image URL as the hero. No AI, no API cost. Ignore the Run Batch / Run All buttons entirely.
            </div>
          </div>
        </div>

        {/* Run controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Batch size:</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={batchLimit}
              onChange={e => setBatchLimit(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <button
            onClick={() => {
              const estCost = (batchLimit * 0.035).toFixed(2);
              if (confirm(`This will cost approximately $${estCost} in paid Anthropic API credits (${batchLimit} listings × ~$0.035 each). Continue?`)) {
                runBatch(batchLimit, false, viewFilter === 'no_hero' ? true : includeGooglePhotos);
              }
            }}
            disabled={running || batchLimit < 1}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0F2744] text-white rounded-lg text-sm font-medium hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running...' : 'Run Batch (paid)'}
          </button>
          <button
            onClick={() => {
              const n = viewFilter === 'no_hero' ? noHeroUnprocessed : queueStats.remaining;
              const estCost = (n * 0.035).toFixed(0);
              if (confirm(`⚠️ This will cost approximately $${estCost} in paid Anthropic API credits (${n} listings × ~$0.035 each). Are you sure?`)) {
                runBatch(n, false, viewFilter === 'no_hero' ? true : includeGooglePhotos);
              }
            }}
            disabled={running || (viewFilter === 'no_hero' ? noHeroUnprocessed === 0 : queueStats.remaining === 0)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run All ({(viewFilter === 'no_hero' ? noHeroUnprocessed : queueStats.remaining).toLocaleString()}) (paid)
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

      {/* Wash-type scope — which directory the photo tools operate on */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Wash type:</span>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {([['touchless', 'Touchless'], ['self_serve', 'Self-Service']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setWashType(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${washType === key ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {washType === 'self_serve' && (
          <>
            <span className="ml-2 text-xs font-medium text-gray-500 uppercase tracking-wide">State:</span>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 max-w-[220px]"
              title="Work one state at a time, densest first, so state pages launch with depth. Counts are remaining (unreviewed) self-serve listings."
            >
              <option value="">All states ({selfServeStateCounts.reduce((n, s) => n + s.count, 0).toLocaleString()} left)</option>
              {selfServeStateCounts.map(({ state, count }) => (
                <option key={state} value={state}>{state} ({count})</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">On the <strong>All</strong> tab, listings are grouped by state → city so whole areas finish together.</span>
          </>
        )}
      </div>

      {/* Single filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {([
              { key: 'all' as ViewFilter, label: `All (${viewFilter === 'all' ? filteredTotal : queueStats.totalUntagged})` },
              { key: 'review' as ViewFilter, label: `Need Review (${stats.needs_review})` },
              // Self-serve only: the AI-handled listings to spot-check (AI-picked hero, not yet
              // human-confirmed). Replaces the standalone contact sheet with a live in-tool queue.
              ...(washType === 'self_serve' ? [{ key: 'ai_picked' as ViewFilter, label: `🤖 AI-Picked (${viewFilter === 'ai_picked' ? filteredTotal : aiPickedCount})` }] : []),
              { key: 'equipment' as ViewFilter, label: `Equipment (${stats.equipment_total})` },
              { key: 'heroes' as ViewFilter, label: `Poor Heroes (${stats.heroes_total})` },
              { key: 'cleanup' as ViewFilter, label: `Cleanup (${stats.cleanup_total})` },
              { key: 'best_of' as ViewFilter, label: `🏆 Best-Of Winners (${bestOfCount})` },
              { key: 'no_hero' as ViewFilter, label: `No hero picked (${viewFilter === 'no_hero' ? filteredTotal : noHeroCount})` },
              { key: 'low_res' as ViewFilter, label: `Low Res${stats.low_res_total > 0 ? ` (${stats.low_res_total})` : ''}` },
              { key: 'held' as ViewFilter, label: `Held (${viewFilter === 'held' ? filteredTotal : heldCount})` },
              { key: 'second_look' as ViewFilter, label: `Second Look (${viewFilter === 'second_look' ? filteredTotal : secondLookCount})` },
              { key: 'unscanned' as ViewFilter, label: `Unscanned (${viewFilter === 'unscanned' ? filteredTotal : queueStats.remaining})` },
              { key: 'no_evidence' as ViewFilter, label: `No Review Evidence${viewFilter === 'no_evidence' ? ` (${filteredTotal})` : ''}` },
              { key: 'tier2_recheck' as ViewFilter, label: `♻️ Tier-2 Recheck${viewFilter === 'tier2_recheck' ? ` (${filteredTotal})` : ''}` },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => changeFilter(f.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewFilter === f.key
                    ? f.key === 'review' && stats.needs_review > 0
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white text-gray-900 shadow-sm'
                    : f.key === 'review' && stats.needs_review > 0
                      ? 'text-amber-600 font-semibold'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
            {/* Equipment-brand review: pick a maker to review ALL its listings */}
            <select
              value={equipmentBrand}
              onChange={e => setEquipmentBrand(e.target.value)}
              title="Review every listing tagged with a specific equipment maker (to fix classification errors)"
              className={`ml-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                viewFilter === 'by_equipment'
                  ? 'bg-white text-gray-900 border-orange-300 shadow-sm'
                  : 'text-gray-500 border-gray-200 hover:text-gray-700'
              }`}
            >
              <option value="">🔧 Equipment brand…</option>
              {equipmentBrands.map(b => (
                <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>
              ))}
            </select>
          </div>
          {viewFilter === 'all' && (
            <div className="relative ml-2">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or URL…"
                className="w-64 pl-8 pr-7 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-orange-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {viewFilter !== 'no_hero' && viewFilter !== 'best_of' && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={unreviewedOnly}
                onChange={e => setUnreviewedOnly(e.target.checked)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span className={unreviewedOnly ? 'text-violet-700 font-semibold' : 'text-gray-500'}>Unreviewed only</span>
            </label>
          )}
          {viewFilter === 'no_hero' && (
            <div className="flex items-center gap-2 ml-2 flex-wrap">
              <span className="text-xs text-gray-500">Show:</span>
              {([
                { key: 'non_chain' as const, label: 'Non-chain only (truly missing)', desc: 'Independent listings with no hero — these genuinely need you to pick a photo.' },
                { key: 'chain_only' as const, label: 'Chain only (has brand image)', desc: 'Chain locations — already render their brand image on the public site; no action needed.' },
                { key: 'all' as const, label: 'All', desc: 'Both groups combined' },
              ]).map(o => (
                <button
                  key={o.key}
                  onClick={() => setNoHeroSubFilter(o.key)}
                  title={o.desc}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${noHeroSubFilter === o.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {o.label}
                </button>
              ))}
              <button
                onClick={async () => {
                  const n = await markAllChainListingsAudited();
                  alert(`Auto-approved ${n} chain listings (they render their brand image; no hero curation needed).`);
                }}
                className="px-2.5 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                title="Mark every chain listing with a null hero as audited — they render the CHAIN_BRAND_IMAGES brand photo automatically."
              >
                ✓ Auto-approve all chain listings
              </button>
            </div>
          )}
          {viewFilter === 'best_of' && (
            <div className="flex items-center gap-2 ml-2 flex-wrap">
              <span className="text-xs text-gray-500">Show:</span>
              {([
                { key: 'to_review' as const, label: `To Review (${bestOfCount})`, desc: 'Trophy winners whose hero you have not checked yet this pass.' },
                { key: 'reviewed' as const, label: `Reviewed (${bestOfReviewedCount})`, desc: 'Winners you have already marked reviewed.' },
                { key: 'all' as const, label: `All (${bestOfTotal})`, desc: 'Every trophy winner, reviewed or not.' },
              ]).map(o => (
                <button
                  key={o.key}
                  onClick={() => setBestOfSubFilter(o.key)}
                  title={o.desc}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${bestOfSubFilter === o.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {stats.equipment > 0 && viewFilter !== 'low_res' && (
            <button
              onClick={applyAllHighConfidence}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700"
            >
              <Check className="w-3 h-3" /> Apply All High Confidence
            </button>
          )}
          {viewFilter === 'low_res' && (
            <button
              onClick={scanForLowRes}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
            >
              <ScanLine className="w-3 h-3" /> {lowResTotal > 0 || scanProgress ? 'Re-scan All Heroes' : 'Scan for Low Res Heroes'}
            </button>
          )}
        </div>
        {viewFilter === 'low_res' && scanProgress && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">{scanProgress}</div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : viewFilter === 'low_res' ? (
          lowResListings.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-500">
              No low-res heroes found yet. Click &ldquo;Scan for Low Res Heroes&rdquo; to detect listings with small hero images.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
                {lowResListings.map((listing) => (
                  <LowResCard key={listing.id} listing={listing} onEdit={() => openEditor(listing.id)} onDismiss={() => dismissLowRes(listing.id)} />
                ))}
              </div>
              {lowResTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Showing {(lowResPage - 1) * 50 + 1}&ndash;{Math.min(lowResPage * 50, lowResTotal)} of {lowResTotal}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => changeLowResPage(Math.max(1, lowResPage - 1))}
                      disabled={lowResPage <= 1}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-gray-600 px-2">Page {lowResPage} of {lowResTotalPages}</span>
                    <button
                      onClick={() => changeLowResPage(Math.min(lowResTotalPages, lowResPage + 1))}
                      disabled={lowResPage >= lowResTotalPages}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        ) : filteredTotal === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">
            {stats.total === 0 ? 'No audit results yet. Run a batch to get started.' : 'No results match this filter.'}
          </p>
        ) : (
          <>
            {(viewFilter === 'heroes' ? results.map(r => <HeroRow key={r.id} result={r} />) :
              viewFilter === 'cleanup' ? results.map(r => <CleanupRow key={r.id} result={r} />) :
              viewFilter === 'best_of' ? results.map(r => (
                <BestOfRow
                  key={r.id}
                  result={r}
                  onOpenEditor={() => openEditor(r.listing_id)}
                  onMarkReviewed={() => markBestOfReviewed(r.listing_id)}
                  onUnmarkReviewed={() => unmarkBestOfReviewed(r.listing_id)}
                />
              )) :
              viewFilter === 'no_hero' ? results.map(r => (
                <div key={r.id} className={`border-b border-gray-100 last:border-0 ${
                  r.hero_quality === 'pending_approval' ? 'bg-blue-50 border-l-4 border-l-blue-500' :
                  r.hero_quality === 'has_candidates' ? 'bg-yellow-50 border-l-4 border-l-yellow-400' :
                  r.hero_quality === 'no_photos' ? 'bg-red-50 border-l-4 border-l-red-400' : ''
                }`}>
                  <div className="flex items-center gap-4 px-4 py-3">
                    {r.listing_hero ? (
                      <img
                        src={r.listing_hero}
                        alt={r.listing_name}
                        className="w-20 h-14 rounded object-cover flex-shrink-0 cursor-pointer border-2 border-blue-400"
                        loading="lazy"
                        onClick={() => openEditor(r.listing_id)}
                      />
                    ) : (
                      <div className="w-20 h-14 rounded bg-gray-200 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">
                        No image
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditor(r.listing_id)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate block text-left"
                        >
                          {r.listing_name}
                        </button>
                        {r.hero_quality === 'pending_approval' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white font-medium">REVIEW HERO</span>
                        )}
                        {r.hero_quality === 'has_candidates' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500 text-white font-medium">NEEDS HERO</span>
                        )}
                        {r.hero_quality === 'no_photos' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">NO PHOTOS FOUND</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{r.listing_city}, {r.listing_state}</p>
                    </div>
                    {r.hero_quality === 'pending_approval' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            await supabase.from('listings').update({ is_approved: true }).eq('id', r.listing_id);
                            await supabase.from('photo_audit_results').update({ reviewed: true, applied: true }).eq('listing_id', r.listing_id);
                            removeFromResults(r.listing_id);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500 hover:bg-green-600 text-white"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => openEditor(r.listing_id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const brandUrl = getChainBrandImage(r.listing_parent_chain ?? null, r.listing_id);
                          if (!brandUrl) return null;
                          return (
                            <button
                              onClick={async () => {
                                await supabase.from('listings').update({
                                  hero_image: brandUrl,
                                  hero_image_source: 'chain_brand',
                                  photo_audited_at: new Date().toISOString(),
                                }).eq('id', r.listing_id);
                                removeFromResults(r.listing_id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500 hover:bg-purple-600 text-white"
                              title={`Use ${r.listing_parent_chain} brand image`}
                            >
                              <img src={brandUrl} alt="" className="w-5 h-5 rounded object-cover" />
                              Use Brand Image
                            </button>
                          );
                        })()}
                        <button
                          onClick={() => openEditor(r.listing_id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          Add Photos
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )) :
              results.map(r => (
                <EquipmentRow
                  key={r.id}
                  result={r}
                  onApply={() => applyEquipment(r.id, r.listing_id, r.equipment_brand!, r.equipment_model)}
                  onReject={() => rejectResult(r.id)}
                  onUndo={() => undoApply(r.id, r.listing_id)}
                  onOpenEditor={() => openEditor(r.listing_id)}
                />
              ))
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {(safePage - 1) * pageSize + 1}&ndash;{Math.min(safePage * pageSize, filteredTotal)} of {filteredTotal}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changePage(Math.max(1, safePage - 1))}
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
                        onClick={() => changePage(pageNum)}
                        className={`w-8 h-8 rounded text-xs font-medium ${
                          pageNum === safePage ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => changePage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {/* Jump to specific page — useful for resuming manual review from where you left off */}
                  <form
                    className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.currentTarget.elements.namedItem('jumpPage') as HTMLInputElement);
                      const n = parseInt(input.value, 10);
                      if (Number.isFinite(n) && n >= 1 && n <= totalPages) {
                        changePage(n);
                        input.value = '';
                        input.blur();
                      }
                    }}
                  >
                    <label htmlFor="jumpPage" className="text-xs text-gray-500">Go to</label>
                    <input
                      id="jumpPage"
                      name="jumpPage"
                      type="number"
                      min={1}
                      max={totalPages}
                      placeholder={String(safePage)}
                      className="w-16 h-8 px-2 text-xs text-center border border-gray-200 rounded focus:outline-none focus:border-orange-400"
                    />
                    <button
                      type="submit"
                      className="h-8 px-2 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded"
                    >
                      Go
                    </button>
                    <span className="text-xs text-gray-400">of {totalPages}</span>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Listing editor modal */}
      {editorListingId && (
        <FastCurationModal
          listingId={editorListingId}
          washType={washType}
          onClose={() => setEditorListingId(null)}
          onUpdate={() => {
            // On No Hero / Unscanned / No-Review-Evidence tabs, immediately remove the
            // approved listing from the queue so the count decrements and the user
            // doesn't see it again. (Approve stamps photo_audited_at, which is exactly
            // what each of these tabs filters on, so it's gone on the next reload too.)
            if ((viewFilter === 'no_hero' || viewFilter === 'unscanned' || viewFilter === 'no_evidence') && editorListingId) {
              removeFromResults(editorListingId);
            }
            // In self-serve mode the All tab is the working queue — approving a
            // listing stamps self_service_reviewed_at, so drop it from the current
            // list immediately for progress feedback (it also stays gone on reload
            // when "Unreviewed only" is checked).
            if (washType === 'self_serve' && (viewFilter === 'all' || viewFilter === 'ai_picked') && editorListingId) {
              // AI-Picked: confirming stamps self_service_source='admin_review', which the
              // tab's query excludes — so drop it now for instant feedback, gone on reload too.
              removeFromResults(editorListingId);
            }
            // On the Best-Of tab, approving/saving a winner counts as having
            // hero-reviewed it: persist the mark so it leaves the To Review queue.
            if (viewFilter === 'best_of' && editorListingId && bestOfSubFilter !== 'reviewed') {
              markBestOfReviewed(editorListingId);
            }
            setTimeout(() => reload(), 500);
          }}
          onNext={navigateNext}
          onPrev={navIndex > 0 ? navigatePrev : undefined}
        />
      )}
    </div>
  );
}
