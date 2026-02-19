'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Copy, Check, X, ExternalLink, Minus,
  Images, ChevronDown, ChevronUp, Ban, Sparkles, Star, Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

export type SubStepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

export interface SubStep {
  label: string;
  status: SubStepStatus;
  detail?: string;
}

export interface BatchVerifyResult {
  id: string;
  name: string;
  website: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  is_touchless: boolean | null;
  confidence: string | null;
  notes: string | null;
  error: string | null;
  duration_ms: number | null;
  steps: SubStep[];
  hero_image?: string | null;
  photos_count?: number;
  amenities_count?: number;
  photos?: string[];
  blocked_photos?: string[];
  website_url?: string | null;
}

interface BatchVerifyModalProps {
  results: BatchVerifyResult[];
  total: number;
  isRunning: boolean;
  onClose: () => void;
  onHeroSelected?: (listingId: string, heroUrl: string) => void;
  onBlockedPhotosChanged?: (listingId: string, blocked: string[]) => void;
}

const SUB_STEP_ICON = {
  idle: <Minus className="w-3 h-3 text-gray-300 shrink-0" />,
  running: <Loader2 className="w-3 h-3 animate-spin text-blue-500 shrink-0" />,
  success: <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />,
  error: <XCircle className="w-3 h-3 text-red-500 shrink-0" />,
  skipped: <Minus className="w-3 h-3 text-gray-300 shrink-0" />,
};

interface PhotoPanelProps {
  result: BatchVerifyResult;
  onHeroSelected: (listingId: string, heroUrl: string) => void;
  onBlockedPhotosChanged: (listingId: string, blocked: string[]) => void;
}

function PhotoPanel({ result, onHeroSelected, onBlockedPhotosChanged }: PhotoPanelProps) {
  const [selectedHero, setSelectedHero] = useState<string | null>(result.hero_image || null);
  const [blockedPhotos, setBlockedPhotos] = useState<string[]>(result.blocked_photos || []);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingBlocked, setSavingBlocked] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);

  const photos = result.photos || [];

  const runAiSuggestion = async () => {
    if (photos.length === 0) return;
    setSuggesting(true);
    setSuggestionReason(null);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/suggest-hero-image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listing_id: result.id, photos, listing_name: result.name }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setSuggestionReason(data.reason || null);
        if (data.blocked_urls && data.blocked_urls.length > 0) {
          const merged = Array.from(new Set([...blockedPhotos, ...data.blocked_urls]));
          setBlockedPhotos(merged);
          await supabase.from('listings').update({ blocked_photos: merged }).eq('id', result.id);
          onBlockedPhotosChanged(result.id, merged);
        }
        if (!data.no_good_photos && data.suggested_url) {
          setSelectedHero(data.suggested_url);
        } else if (data.no_good_photos) {
          setSelectedHero(null);
          await takeScreenshot();
        }
      }
    } catch {
    } finally {
      setSuggesting(false);
    }
  };

  const saveHeroImage = async () => {
    if (!selectedHero) return;
    setSaving(true);
    try {
      await supabase.from('listings').update({ hero_image: selectedHero }).eq('id', result.id);
      onHeroSelected(result.id, selectedHero);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const takeScreenshot = async () => {
    setScreenshotting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/screenshot-hero`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listing_id: result.id }),
        }
      );
      const data = await response.json();
      if (data.hero_image) {
        setSelectedHero(data.hero_image);
        onHeroSelected(result.id, data.hero_image);
      }
    } catch {
    } finally {
      setScreenshotting(false);
    }
  };

  const toggleBlock = async (url: string) => {
    const isBlocked = blockedPhotos.includes(url);
    const updated = isBlocked ? blockedPhotos.filter((u) => u !== url) : [...blockedPhotos, url];
    setBlockedPhotos(updated);
    if (selectedHero === url && !isBlocked) setSelectedHero(null);
    setSavingBlocked(true);
    try {
      await supabase.from('listings').update({ blocked_photos: updated }).eq('id', result.id);
      onBlockedPhotosChanged(result.id, updated);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  const blockAll = async () => {
    setBlockedPhotos(photos);
    setSelectedHero(null);
    setSavingBlocked(true);
    try {
      await supabase.from('listings').update({ blocked_photos: photos }).eq('id', result.id);
      onBlockedPhotosChanged(result.id, photos);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  const unblockAll = async () => {
    setBlockedPhotos([]);
    setSavingBlocked(true);
    try {
      await supabase.from('listings').update({ blocked_photos: [] }).eq('id', result.id);
      onBlockedPhotosChanged(result.id, []);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  const isBusy = suggesting || screenshotting || saving || savingBlocked;

  if (photos.length === 0 && !result.website_url) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {suggestionReason && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>{suggestionReason}</span>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="flex-1">No photos extracted.</span>
          {result.website_url && (
            <Button
              size="sm"
              variant="outline"
              onClick={takeScreenshot}
              disabled={screenshotting}
              className="border-sky-300 text-sky-700 hover:bg-sky-50 h-7 text-xs"
            >
              {screenshotting ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Screenshotting...</>
              ) : (
                <><Camera className="w-3 h-3 mr-1" />Screenshot Hero</>
              )}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{photos.length}</span> photos
              {blockedPhotos.length > 0 && (
                <span className="text-red-500">({blockedPhotos.length} blocked)</span>
              )}
              {selectedHero && (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" />hero selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={unblockAll}
                disabled={isBusy || blockedPhotos.length === 0}
                className="h-6 px-2 text-xs border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Unblock All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={blockAll}
                disabled={isBusy || blockedPhotos.length === photos.length}
                className="h-6 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
              >
                <Ban className="w-3 h-3 mr-1" />Block All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={runAiSuggestion}
                disabled={isBusy}
                className="h-6 px-2 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                {suggesting ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Thinking...</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" />Re-suggest</>
                )}
              </Button>
              {result.website_url && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={takeScreenshot}
                  disabled={isBusy}
                  className="h-6 px-2 text-xs border-sky-200 text-sky-600 hover:bg-sky-50"
                >
                  {screenshotting ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Screenshotting...</>
                  ) : (
                    <><Camera className="w-3 h-3 mr-1" />Screenshot</>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mb-2">
            {photos.map((url, idx) => {
              const isSelected = selectedHero === url;
              const isBlocked = blockedPhotos.includes(url);
              return (
                <div key={idx} className="relative group">
                  <button
                    onClick={() => !isBlocked && setSelectedHero(url)}
                    disabled={isBlocked}
                    className={`relative w-full rounded-lg overflow-hidden border-2 transition-all duration-150 aspect-video focus:outline-none ${
                      isBlocked
                        ? 'border-red-300 opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'border-green-500 shadow-md shadow-green-100 scale-[1.03]'
                        : 'border-gray-200 hover:border-gray-400 cursor-pointer'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const t = e.currentTarget;
                        t.style.display = 'none';
                        const p = t.parentElement;
                        if (p && !p.querySelector('.bp')) {
                          const d = document.createElement('div');
                          d.className = 'bp w-full h-full flex items-center justify-center bg-gray-100 text-gray-300';
                          d.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>';
                          p.appendChild(d);
                        }
                      }}
                    />
                    {isSelected && !isBlocked && (
                      <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                        <div className="bg-green-500 rounded-full p-0.5">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    )}
                    {isBlocked && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <div className="bg-red-500 rounded-full p-0.5">
                          <Ban className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => toggleBlock(url)}
                    disabled={savingBlocked}
                    title={isBlocked ? 'Unblock' : 'Block'}
                    className={`absolute top-1 left-1 rounded-full p-0.5 transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                      isBlocked
                        ? 'bg-red-500 text-white opacity-100'
                        : 'bg-white/90 text-gray-600 hover:bg-red-500 hover:text-white shadow'
                    }`}
                  >
                    <Ban className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {selectedHero && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={saveHeroImage}
                disabled={saving || isBusy}
                className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving...</>
                ) : (
                  <><Star className="w-3 h-3 mr-1" />Set as Hero</>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BatchVerifyModal({
  results,
  total,
  isRunning,
  onClose,
  onHeroSelected,
  onBlockedPhotosChanged,
}: BatchVerifyModalProps) {
  const [copied, setCopied] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const runningRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!isRunning) return;
    if (runningRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const el = runningRef.current;
      const elBottom = el.offsetTop + el.offsetHeight;
      const containerBottom = container.scrollTop + container.clientHeight;
      if (elBottom > containerBottom) {
        container.scrollTo({ top: elBottom - container.clientHeight + 16, behavior: 'smooth' });
      }
    }
  }, [results, isRunning]);

  const completed = results.filter((r) => r.status !== 'pending' && r.status !== 'running').length;
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const touchlessCount = results.filter((r) => r.status === 'success' && r.is_touchless === true).length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyJson = () => {
    const exportData = results.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      status: r.status,
      is_touchless: r.is_touchless,
      confidence: r.confidence,
      notes: r.notes,
      error: r.error,
      duration_ms: r.duration_ms,
      photos_count: r.photos_count ?? null,
      amenities_count: r.amenities_count ?? null,
      hero_image: r.hero_image ?? null,
      steps: r.steps.map((s) => ({ label: s.label, status: s.status, detail: s.detail ?? null })),
    }));
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusIcon = (status: BatchVerifyResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
      case 'skipped':
        return <XCircle className="w-4 h-4 text-gray-400 shrink-0" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />;
    }
  };

  const getTouchlessLabel = (r: BatchVerifyResult) => {
    if (r.status !== 'success' && r.status !== 'running') return null;
    if (r.is_touchless === true) {
      const color =
        r.confidence === 'high'
          ? 'bg-green-100 text-green-800'
          : r.confidence === 'medium'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-yellow-100 text-yellow-800';
      return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
          Touchless {r.confidence ? `(${r.confidence})` : ''}
        </span>
      );
    }
    if (r.is_touchless === false) {
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800">
          Not Touchless
        </span>
      );
    }
    return null;
  };

  const canExpandPhotos = (r: BatchVerifyResult) =>
    r.status === 'success' &&
    r.is_touchless === true &&
    ((r.photos && r.photos.length > 0) || !!r.website_url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-auto flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#0F2744]">Batch Verification</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isRunning
                ? `Processing ${completed} of ${total}...`
                : `Completed — ${completed} of ${total} processed`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyJson}
              disabled={results.length === 0}
              className="gap-2"
            >
              {copied ? (
                <><Check className="w-4 h-4 text-green-600" />Copied!</>
              ) : (
                <><Copy className="w-4 h-4" />Copy JSON</>
              )}
            </Button>
            {!isRunning && (
              <Button size="sm" variant="ghost" onClick={onClose} className="w-8 h-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-[#22C55E] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700 tabular-nums w-12 text-right">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span><span className="font-semibold text-green-600">{successCount}</span> verified</span>
            <span><span className="font-semibold text-[#22C55E]">{touchlessCount}</span> touchless</span>
            <span><span className="font-semibold text-red-500">{errorCount}</span> failed</span>
            <span><span className="font-semibold text-gray-400">{skippedCount}</span> skipped</span>
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-2 min-h-0">
          {results.map((r) => {
            const expanded = expandedIds.has(r.id);
            const hasPhotos = canExpandPhotos(r);

            return (
              <div
                key={r.id}
                ref={r.status === 'running' ? runningRef : null}
                className={`rounded-lg border transition-all duration-300 ${
                  r.status === 'running'
                    ? 'bg-blue-50 border-blue-200'
                    : r.status === 'success'
                    ? 'bg-white border-gray-200'
                    : r.status === 'error'
                    ? 'bg-red-50 border-red-200'
                    : r.status === 'skipped'
                    ? 'bg-gray-50 border-gray-200 opacity-60'
                    : 'bg-gray-50 border-gray-100 opacity-40'
                }`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getStatusIcon(r.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-[#0F2744] truncate">{r.name}</span>
                        {getTouchlessLabel(r)}
                        {r.duration_ms !== null && (r.status === 'success' || r.status === 'error') && (
                          <span className="text-xs text-gray-400 ml-auto shrink-0">
                            {(r.duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {r.website && (
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline inline-flex items-center gap-0.5 mt-0.5 truncate max-w-full"
                        >
                          {r.website.replace(/^https?:\/\//, '')}
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      )}

                      {r.steps.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {r.steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2">
                              {SUB_STEP_ICON[step.status]}
                              <span
                                className={`text-xs ${
                                  step.status === 'running'
                                    ? 'text-blue-600 font-medium'
                                    : step.status === 'success'
                                    ? 'text-gray-600'
                                    : step.status === 'error'
                                    ? 'text-red-600'
                                    : 'text-gray-400'
                                }`}
                              >
                                {step.label}
                                {step.detail && (
                                  <span className="ml-1 text-gray-400">— {step.detail}</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {r.status === 'success' && r.is_touchless && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                          {(r.photos_count ?? 0) > 0 && (
                            <span><span className="font-medium text-gray-700">{r.photos_count}</span> photos saved</span>
                          )}
                          {(r.amenities_count ?? 0) > 0 && (
                            <span><span className="font-medium text-gray-700">{r.amenities_count}</span> amenities</span>
                          )}
                          {r.hero_image && (
                            <span className="text-[#22C55E] font-medium flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current" />Hero set
                            </span>
                          )}
                        </div>
                      )}

                      {r.error && (
                        <p className="text-xs text-red-600 mt-1">{r.error}</p>
                      )}
                    </div>

                    {hasPhotos && (
                      <button
                        onClick={() => toggleExpand(r.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors"
                      >
                        <Images className="w-3.5 h-3.5" />
                        Photos
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {expanded && hasPhotos && onHeroSelected && onBlockedPhotosChanged && (
                    <PhotoPanel
                      result={r}
                      onHeroSelected={onHeroSelected}
                      onBlockedPhotosChanged={onBlockedPhotosChanged}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!isRunning && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Batch complete.{' '}
                <span className="font-semibold text-[#22C55E]">{touchlessCount} touchless</span>{' '}
                confirmed out of {successCount} verified.
              </p>
              <Button onClick={onClose} className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white">
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
