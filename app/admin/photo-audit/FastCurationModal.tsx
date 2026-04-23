'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { X, ExternalLink, Check, CheckCheck, Ban, Trash2, Sparkles, Loader2, Plus, RefreshCw, Upload } from 'lucide-react';
import { useFastCuration, type CandidatePhoto } from './useFastCuration';
import { PhotoGrid } from './PhotoGrid';
import { CropModal } from '../hero-review/CropModal';
import { autoEnhanceImage } from '../hero-review/autoEnhance';
import { EQUIPMENT_BRANDS } from '../hero-review/types';
import { useEquipmentVocabulary } from '../hooks/useEquipmentVocabulary';
import { getChainBrandImage } from '@/lib/chain-brand-images';

interface Props {
  listingId: string;
  onClose: () => void;
  onUpdate?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export function FastCurationModal({ listingId, onClose, onUpdate, onNext, onPrev }: Props) {
  const {
    listing, loading, candidates, discovering, saving, sourceCounts,
    selectedId, setSelectedId,
    classifying, classifyResult, classifyEvidence,
    tagPhoto, setAsHero, addToGallery, removeFromGallery, removeHero, skipPhoto,
    addCapture, addUpload, addHeroDirect, replaceUrl, updateWebsite, setFallbackHero,
    saveAll, approveAndNext, classifyEquipment, setEquipment,
    toggleTouchlessVerified, markNotTouchless, markClosed, deleteListing,
  } = useFastCuration(listingId);

  const [cropPhoto, setCropPhoto] = useState<CandidatePhoto | null>(null);
  const [enhancing, setEnhancing] = useState<string | null>(null);
  const [enhancedIds, setEnhancedIds] = useState<string[]>([]);
  const [originalUrls, setOriginalUrls] = useState<Record<string, string>>({}); // id -> original URL before enhance
  const { getModelsForBrand, reload: reloadVocabulary } = useEquipmentVocabulary();

  // Reset local state when listing changes
  useEffect(() => {
    setEnhancing(null);
    setEnhancedIds([]);
    setCropPhoto(null);
  }, [listingId]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const pasteRef = useRef<HTMLInputElement>(null);

  const [pasteStatus, setPasteStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [pasteError, setPasteError] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const awaitingClipboard = useRef(false);
  const [showClipboardBanner, setShowClipboardBanner] = useState(false);
  const candidatesRef = useRef<HTMLDivElement>(null);

  const scrollToCandidates = () => {
    candidatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Process a clipboard image: auto-crop to 16:9 and set as hero
  const processClipboardImage = useCallback(async (blob: Blob) => {
    if (!listing) return;
    setPasteStatus('uploading');
    try {
      const bitmap = await createImageBitmap(blob);
      const { width, height } = bitmap;
      const targetAspect = 16 / 9;
      const currentAspect = width / height;
      let srcX = 0, srcY = 0, srcW = width, srcH = height;
      if (currentAspect > targetAspect) {
        srcW = Math.round(height * targetAspect);
        srcX = Math.round((width - srcW) / 2);
      } else {
        srcH = Math.round(width / targetAspect);
        srcY = Math.round((height - srcH) / 2);
      }

      // Cap canvas output to max 2048px wide to avoid huge PNG uploads (Netlify 4.5MB body limit)
      const MAX_WIDTH = 2048;
      let outW = srcW, outH = srcH;
      if (outW > MAX_WIDTH) {
        outH = Math.round((MAX_WIDTH / outW) * outH);
        outW = MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      // Use JPEG (80% quality) to avoid huge file sizes; PNG can be 10MB+ for retina screens
      const cropped = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.85);
      });

      const formData = new FormData();
      formData.append('file', cropped, 'hero-screenshot.jpg');
      formData.append('type', 'hero');
      formData.append('listingId', listing.id);
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (res.ok) {
        const { url } = await res.json();
        addHeroDirect(url);
        setPasteStatus('success');
        setPasteError('');
      } else {
        // Show actual server error so we can debug
        let errMsg = `Upload failed (${res.status})`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        setPasteStatus('error');
        setPasteError(errMsg);
      }
    } catch (err) {
      setPasteStatus('error');
      setPasteError(err instanceof Error ? err.message : 'Failed to process image');
    }
    setTimeout(() => setPasteStatus('idle'), 5000);
  }, [listing, addHeroDirect]);

  // When tab regains focus after Street View, show banner prompting a click
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!awaitingClipboard.current) return;
      // Show the "click to apply" banner
      setShowClipboardBanner(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // When banner is showing and user clicks anywhere, read clipboard and apply as hero
  const handleClipboardClick = useCallback(async () => {
    if (!showClipboardBanner) return;
    awaitingClipboard.current = false;
    setShowClipboardBanner(false);
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await processClipboardImage(blob);
          return;
        }
      }
      // No image found — user probably used ⌘+Shift (saves file) instead of ⌘+Ctrl+Shift (clipboard)
      setPasteStatus('error');
      setPasteError('No image in clipboard. Use ⌘+Ctrl+Shift+4 (with Ctrl!) to copy screenshot to clipboard');
      setTimeout(() => setPasteStatus('idle'), 5000);
      // Re-show banner so they can try again
      awaitingClipboard.current = true;
      setShowClipboardBanner(true);
    } catch {
      setPasteStatus('error');
      setPasteError('Clipboard access denied. Try ⌘V to paste instead.');
      setTimeout(() => setPasteStatus('idle'), 3000);
    }
  }, [showClipboardBanner, processClipboardImage]);

  // Also keep ⌘V paste as fallback
  useEffect(() => {
    const handlePasteImage = async (e: ClipboardEvent) => {
      if (!listing) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          await processClipboardImage(file);
          return;
        }
      }
    };
    window.addEventListener('paste', handlePasteImage);
    return () => window.removeEventListener('paste', handlePasteImage);
  }, [listing, processClipboardImage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (cropPhoto) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (selectedId) {
        if (e.key === '1') { tagPhoto(selectedId, 'hero'); return; }
        if (e.key === '2') { tagPhoto(selectedId, 'gallery'); return; }
        if (e.key === '3') { tagPhoto(selectedId, 'equipment'); return; }
        if (e.key === 'x' || e.key === 'X') { tagPhoto(selectedId, 'skip'); return; }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSaveAndNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, cropPhoto, onClose]);

  const handleSaveOnly = async () => {
    const ok = await saveAll();
    if (ok) onUpdate?.();
  };

  const handleSaveAndNext = async () => {
    const ok = await saveAll();
    if (ok) {
      onUpdate?.();
      if (onNext) onNext();
      else onClose();
    }
  };

  const handleApproveAndNext = async () => {
    await approveAndNext(onUpdate, onNext, onClose);
  };

  const handleCrop = (photo: CandidatePhoto) => {
    setCropPhoto(photo);
  };

  const handleCropSave = async (croppedUrl: string) => {
    if (cropPhoto) {
      replaceUrl(cropPhoto.id, croppedUrl);
      setCropPhoto(null);
    }
  };

  const handleEnhance = async (photo: CandidatePhoto) => {
    // Toggle: if already enhanced, revert to original
    if (enhancedIds.includes(photo.id) && originalUrls[photo.id]) {
      replaceUrl(photo.id, originalUrls[photo.id]);
      setEnhancedIds(prev => prev.filter(id => id !== photo.id));
      return;
    }

    setEnhancing(photo.id);
    try {
      const enhanced = await autoEnhanceImage(photo.url);
      if (enhanced) {
        // Save original URL before replacing
        setOriginalUrls(prev => ({ ...prev, [photo.id]: photo.url }));

        // Upload via API route (uses service role key, bypasses RLS)
        const formData = new FormData();
        formData.append('file', enhanced, 'enhanced.jpg');
        formData.append('type', 'gallery');
        formData.append('listingId', listing!.id);
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json();
          alert('Failed to upload enhanced image: ' + (err.error || 'Unknown error'));
          return;
        }
        const { url } = await res.json();
        replaceUrl(photo.id, url);
        setEnhancedIds(prev => [...prev, photo.id]);
      }
    } catch (err) {
      console.error('Enhance failed:', err);
      alert('Enhancement failed — the image may be from an external source that blocks editing. Try saving first, then enhance.');
    } finally {
      setEnhancing(null);
    }
  };

  const handlePaste = async () => {
    if (!pasteValue.trim() || !listing) return;
    setPasteLoading(true);
    try {
      let imageUrl = pasteValue.trim();

      // Extract image URL from Google Maps/Street View URLs
      if (imageUrl.includes('google.com/maps')) {
        // Try to extract Street View panoid
        const panoidMatch = imageUrl.match(/!1s([a-zA-Z0-9_-]+)!2e/);
        const hasStreetView = imageUrl.includes('streetviewpixels') || imageUrl.includes('!3m7!1e1');
        if (panoidMatch && hasStreetView) {
          const yawMatch = imageUrl.match(/yaw%3D([\d.]+)/i) || imageUrl.match(/,(\d+\.?\d*)h,/);
          const heading = yawMatch ? yawMatch[1] : '0';
          const panoId = panoidMatch[1];

          // Get a signed high-res Street View URL via edge function (unlocks 2048x2048)
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          let thumbUrl: string;
          try {
            const params = new URLSearchParams({ pano: panoId, heading, pitch: '0', fov: '90' });
            const res = await fetch(`${supabaseUrl}/functions/v1/streetview-signed?${params}`, {
              headers: supabaseAnonKey ? { Authorization: `Bearer ${supabaseAnonKey}` } : {},
            });
            const data = await res.json();
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
            thumbUrl = data.url ?? `https://maps.googleapis.com/maps/api/streetview?size=1600x1200&pano=${panoId}&heading=${heading}&pitch=0&key=${apiKey}`;
          } catch {
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
            thumbUrl = `https://maps.googleapis.com/maps/api/streetview?size=1600x1200&pano=${panoId}&heading=${heading}&pitch=0&key=${apiKey}`;
          }

          addCapture(panoId, parseFloat(heading), thumbUrl);
          setPasteValue('');
          setPasteOpen(false);
          setPasteLoading(false);
          return;
        }

        // Try to extract embedded image URL
        const encodedUrl = imageUrl.match(/6shttps?:%2F%2F[^!]+/);
        if (encodedUrl) {
          imageUrl = decodeURIComponent(encodedUrl[0].slice(2));
          // Replace low-res thumbnail params with high-res
          imageUrl = imageUrl.replace(/=w\d+-h\d+-k-no/, '=w1600-h1200-k-no');
          imageUrl = imageUrl.replace(/=s\d+/, '=s1600');
        }
      }

      addUpload(imageUrl);
      setPasteValue('');
      setPasteOpen(false);
    } catch (err) {
      console.error('Paste failed:', err);
    } finally {
      setPasteLoading(false);
    }
  };

  if (loading || !listing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl p-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        {/* Clipboard banner — click anywhere to apply screenshot as hero */}
        {showClipboardBanner && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 cursor-pointer"
            onClick={handleClipboardClick}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">📷</div>
              <p className="text-2xl font-bold text-white mb-3">Click here to apply screenshot as hero</p>
              <div className="bg-white/10 rounded-xl px-6 py-4 mb-4 max-w-md mx-auto">
                <p className="text-sm text-yellow-300 font-medium mb-1">Make sure you used the right shortcut:</p>
                <p className="text-lg text-white font-mono">⌘ + Ctrl + Shift + 4</p>
                <p className="text-xs text-gray-400 mt-1">The <strong>Ctrl</strong> key copies to clipboard instead of saving a file</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowClipboardBanner(false); awaitingClipboard.current = false; }}
                className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{listing.name}</h2>
                {/* Status badge — shows whether listing is live, held, or reverted */}
                {(() => {
                  const rawNotes = (listing as { crawl_notes?: string | null }).crawl_notes ?? '';
                  const isReverted = listing.is_touchless === false;
                  const isApproved = listing.is_approved === true;
                  const wasReverted = /\bREVERTED\b/i.test(rawNotes);
                  const isHeld = isReverted === false && isApproved === false;
                  if (isReverted) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 cursor-help"
                        title={rawNotes || 'Reverted — no longer classified as touchless'}
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Not Touchless
                      </span>
                    );
                  }
                  if (isHeld) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 cursor-help"
                        title={rawNotes || 'Held — needs hero/enrichment before going live'}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Held (not live)
                      </span>
                    );
                  }
                  if (isApproved) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 cursor-help"
                        title={wasReverted ? `Previously reverted, now live again. ${rawNotes}` : 'Live on touchlesscarwashfinder.com'}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Live
                      </span>
                    );
                  }
                  return null;
                })()}
                {listing.touchless_verified === 'user_review' && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 cursor-help"
                    title={listing.touchless_evidence ?? 'Detected from user review'}
                  >
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    User Verified
                  </span>
                )}
                {listing.touchless_verified === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Admin Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{listing.city}, {listing.state}</p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/state/${listing.state?.toLowerCase()}/${listing.city?.toLowerCase().replace(/\s+/g, '-')}/${listing.slug}`}
                target="_blank"
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View listing
              </a>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable content — supports drag-and-drop of image files */}
          <div
            className={`flex-1 overflow-y-auto relative ${dragging ? 'ring-4 ring-inset ring-blue-400' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              dragCounter.current++;
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              dragCounter.current--;
              if (dragCounter.current <= 0) {
                dragCounter.current = 0;
                setDragging(false);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              dragCounter.current = 0;
              setDragging(false);
              if (!listing) return;
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
              if (files.length === 0) return;
              setPasteStatus('uploading');
              for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('type', 'gallery');
                formData.append('listingId', listing.id);
                try {
                  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
                  if (res.ok) {
                    const { url } = await res.json();
                    addUpload(url);
                  }
                } catch {}
              }
              setPasteStatus('success');
              setTimeout(() => setPasteStatus('idle'), 2000);
            }}
          >
            {/* Drop overlay */}
            {dragging && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/90 border-4 border-dashed border-blue-400 rounded-lg">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                  <p className="text-lg font-semibold text-blue-700">Drop screenshot here</p>
                  <p className="text-sm text-blue-500">Image will be added to candidates</p>
                </div>
              </div>
            )}

            {/* Source counts + actions bar */}
            <div className="px-6 py-3 border-b bg-white flex items-center gap-4 flex-wrap">
              {sourceCounts && (
                <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                  {sourceCounts.existing > 0 && <button onClick={scrollToCandidates} className="bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.existing} existing ↓</button>}
                  {sourceCounts.yelp > 0 && <button onClick={scrollToCandidates} className="bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.yelp} Yelp ↓</button>}
                  {sourceCounts.google_maps > 0 && <button onClick={scrollToCandidates} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.google_maps} Google Maps ↓</button>}
                  {sourceCounts.google_places > 0 && <button onClick={scrollToCandidates} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.google_places} Google API ↓</button>}
                  {sourceCounts.bing_search > 0 && <button onClick={scrollToCandidates} className="bg-cyan-50 text-cyan-600 hover:bg-cyan-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.bing_search} Bing ↓</button>}
                  {sourceCounts.website > 0 && <button onClick={scrollToCandidates} className="bg-teal-50 text-teal-600 hover:bg-teal-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">{sourceCounts.website} Website ↓</button>}
                  {sourceCounts.street_view > 0 && <button onClick={scrollToCandidates} className="bg-orange-50 text-orange-600 hover:bg-orange-100 px-2 py-1 rounded cursor-pointer transition-colors" title="Click to scroll to photos">Street View ↓</button>}
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files) return;
                    for (const file of Array.from(files)) {
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('type', 'gallery');
                      formData.append('listingId', listing!.id);
                      try {
                        const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
                        if (res.ok) {
                          const { url } = await res.json();
                          addUpload(url);
                        }
                      } catch {}
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                <button
                  onClick={() => { setPasteOpen(!pasteOpen); setTimeout(() => pasteRef.current?.focus(), 100); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Paste URL
                </button>
              </div>
            </div>

            {/* Paste URL input */}
            {pasteOpen && (
              <div className="px-6 py-2 border-b bg-gray-50 flex gap-2">
                <input
                  ref={pasteRef}
                  type="text"
                  value={pasteValue}
                  onChange={e => setPasteValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handlePaste(); if (e.key === 'Escape') setPasteOpen(false); }}
                  placeholder="Paste image URL or Google Maps URL..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
                <button
                  onClick={handlePaste}
                  disabled={pasteLoading || !pasteValue.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {pasteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                </button>
              </div>
            )}

            {/* WYSIWYG Photo Layout */}
            <div className="px-6 py-4">
              <PhotoGrid
                candidates={candidates}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onTag={tagPhoto}
                onSetAsHero={setAsHero}
                onAddToGallery={addToGallery}
                onRemoveFromGallery={removeFromGallery}
                onRemoveHero={removeHero}
                onSkipPhoto={skipPhoto}
                onCrop={handleCrop}
                onEnhance={handleEnhance}
                enhancingId={enhancing}
                enhancedIds={enhancedIds}
                discovering={discovering}
                streetViewUrl={listing.latitude && listing.longitude ? `https://www.google.com/maps/@${listing.latitude},${listing.longitude},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192` : undefined}
                googlePhotosUrl={listing.google_place_id ? `https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}` : undefined}
                listingId={listing.id}
                onHeroDropped={addHeroDirect}
                onStreetViewOpened={() => { awaitingClipboard.current = true; }}
                onFallbackHero={async () => { await setFallbackHero(); onUpdate?.(); if (onNext) onNext(); else onClose(); }}
                onClipboardPaste={processClipboardImage}
                hasHeroImage={!!candidates.find(c => c.tag === 'hero')}
                chainBrandImageUrl={
                  // Show chain brand image as the "effective hero" when no location-specific
                  // hero has been chosen — matches what the public listing page displays.
                  !candidates.find(c => c.tag === 'hero') && listing.hero_image_source !== 'manual'
                    ? getChainBrandImage(listing.parent_chain, listing.id)
                    : null
                }
                chainBrandName={listing.parent_chain ?? undefined}
                equipmentSlot={
                  <div className="my-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Equipment</h3>
                      {/* Brand selector — known brands use dropdown, "other" shows free-text */}
                      {(() => {
                        const knownBrand = EQUIPMENT_BRANDS.find(b => b.value === listing.equipment_brand);
                        const isCustomBrand = listing.equipment_brand && !knownBrand;
                        return (
                          <>
                            <select
                              value={isCustomBrand ? '__custom__' : (listing.equipment_brand ?? '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__custom__') {
                                  const custom = prompt('Enter manufacturer name:');
                                  if (custom?.trim()) {
                                    setEquipment(custom.trim(), null);
                                    reloadVocabulary();
                                  }
                                } else {
                                  setEquipment(val || null, null);
                                }
                              }}
                              className={`text-sm px-3 py-1.5 rounded-lg border cursor-pointer ${
                                listing.equipment_brand ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-500'
                              }`}
                            >
                              <option value="">Select manufacturer…</option>
                              {EQUIPMENT_BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                              <option value="__custom__">{isCustomBrand ? `✏️ ${listing.equipment_brand}` : '✏️ Enter custom…'}</option>
                            </select>
                            {isCustomBrand && (
                              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{listing.equipment_brand}</span>
                            )}
                          </>
                        );
                      })()}
                      {/* Model selector — known models use dropdown + "Other" for free-text */}
                      {listing.equipment_brand && (() => {
                        const models = getModelsForBrand(listing.equipment_brand);
                        const currentModel = listing.equipment_model ?? '';
                        const isCustomModel = currentModel && !models.includes(currentModel);
                        return (
                          <select
                            value={isCustomModel ? '__custom__' : currentModel}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                const custom = prompt('Enter model name:');
                                if (custom?.trim()) {
                                  setEquipment(listing.equipment_brand, custom.trim());
                                  // Pick up the new custom model in dropdowns for other listings.
                                  reloadVocabulary();
                                }
                              } else {
                                setEquipment(listing.equipment_brand, val || null);
                              }
                            }}
                            className={`text-sm px-3 py-1.5 rounded-lg border cursor-pointer ${
                              listing.equipment_model ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-500'
                            }`}
                          >
                            <option value="">Select model…</option>
                            {models.map(m => <option key={m} value={m}>{m}</option>)}
                            <option value="__custom__">{isCustomModel ? `✏️ ${currentModel}` : '✏️ Enter custom…'}</option>
                          </select>
                        );
                      })()}
                      <button
                        onClick={classifyEquipment}
                        disabled={classifying}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {classifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Classify with AI
                      </button>
                      {classifyResult && (
                        <span className={`text-sm font-medium ${classifyResult.includes('high') ? 'text-green-600' : classifyResult.includes('medium') ? 'text-orange-600' : 'text-gray-500'}`}>
                          {classifyResult}
                        </span>
                      )}
                    </div>
                    {classifyEvidence && (
                      <div className="mt-2 p-3 rounded-lg bg-violet-50 border border-violet-200 text-sm text-violet-800">
                        <span className="font-semibold text-violet-600">AI Evidence:</span> {classifyEvidence}
                      </div>
                    )}
                  </div>
                }
              />
            </div>

            {/* Street View — moved to hero section header as "Street View" button */}

            {/* Equipment section moved into PhotoGrid via equipmentSlot */}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-6 py-3 border-t bg-gray-50">
            <button
              onClick={async () => { await markNotTouchless(); onUpdate?.(); if (onNext) onNext(); else onClose(); }}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-medium disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Not Touchless
            </button>
            <button
              onClick={async () => { await deleteListing(); onUpdate?.(); if (onNext) onNext(); else onClose(); }}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>

            {/* Closed — dropdown with Permanent / Temporary.
                Permanent: business is gone for good; 301 redirect to nearest city.
                Temporary: business is currently closed (renovation, season); same redirect. */}
            <div className="relative group">
              <button
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium disabled:opacity-50 border border-red-200"
                title="Mark this location as closed. Unapproves the listing so its URL redirects to the nearest city with a 'closed' banner."
              >
                <Ban className="w-4 h-4" /> Closed ▾
              </button>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col gap-0.5 bg-white border rounded-lg shadow-lg p-1 z-10 min-w-[160px]">
                <button
                  onClick={async () => {
                    if (!confirm('Mark this listing as PERMANENTLY closed?\n\nIt will be unapproved and its URL will redirect to the nearest city.')) return;
                    await markClosed('permanent'); onUpdate?.(); if (onNext) onNext(); else onClose();
                  }}
                  disabled={saving}
                  className="text-left px-3 py-1.5 text-xs rounded hover:bg-red-50 text-red-700 whitespace-nowrap"
                >
                  Permanently closed
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Mark this listing as TEMPORARILY closed?\n\nIt will be unapproved and its URL will redirect to the nearest city.')) return;
                    await markClosed('temporary'); onUpdate?.(); if (onNext) onNext(); else onClose();
                  }}
                  disabled={saving}
                  className="text-left px-3 py-1.5 text-xs rounded hover:bg-amber-50 text-amber-700 whitespace-nowrap"
                >
                  Temporarily closed
                </button>
              </div>
            </div>

            <div className="flex-1" />

            <div className="relative group">
              <button
                onClick={() => listing.website ? window.open(listing.website, '_blank') : null}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm ${
                  listing.website
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300'
                }`}
              >
                {listing.website ? 'Website' : 'No Website'}
              </button>
              {/* Edit/Delete dropdown on hover */}
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex gap-1 bg-white border rounded-lg shadow-lg p-1 z-10">
                <button
                  onClick={() => {
                    const newUrl = prompt('Enter website URL (or leave empty to remove):', listing.website || '');
                    if (newUrl !== null) {
                      updateWebsite(newUrl.trim() || null);
                    }
                  }}
                  className="px-2 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 text-blue-700 whitespace-nowrap"
                >
                  ✏️ Edit
                </button>
                {listing.website && (
                  <button
                    onClick={() => {
                      if (confirm('Remove website URL?')) updateWebsite(null);
                    }}
                    className="px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 text-red-700 whitespace-nowrap"
                  >
                    🗑 Remove
                  </button>
                )}
              </div>
            </div>
            {listing.google_place_id && (
              <button
                onClick={() => window.open(`https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`, '_blank')}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
              >
                Google Maps
              </button>
            )}
            <button
              onClick={() => {
                if (listing.google_place_id) {
                  // Open directly to reviews tab via place_id (exact match, no ambiguity)
                  window.open(`https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}&hl=en#reviews`, '_blank');
                } else {
                  // Include full street address so Google doesn't pick the nearest unrelated business
                  const addrParts = [listing.address, listing.city, listing.state, listing.zip].filter(Boolean).join(', ');
                  const query = encodeURIComponent(`${listing.name} ${addrParts}`);
                  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                }
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm"
              title={listing.google_place_id ? 'Open exact Google listing reviews' : 'No Google place_id — searching by address (may show nearest match if business not on Maps)'}
            >
              Reviews{!listing.google_place_id ? ' ⚠' : ''}
            </button>
            <button
              onClick={toggleTouchlessVerified}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                listing.touchless_verified === 'admin'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title={listing.touchless_verified === 'admin' ? 'Click to un-verify' : 'Mark as admin verified touchless'}
            >
              <Check className="w-4 h-4" />
              {listing.touchless_verified === 'admin' ? 'Verified' : 'Verify'}
            </button>

            {onPrev && (
              <button
                onClick={async () => { await saveAll(); onUpdate?.(); onPrev(); }}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-2.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                ← Prev
              </button>
            )}
            {onNext && (
              <button
                onClick={async () => { await saveAll(); onUpdate?.(); onNext(); }}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-2.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium disabled:opacity-50 transition-colors"
                title="Save and go to next"
              >
                Next →
              </button>
            )}
            <button
              onClick={handleSaveOnly}
              disabled={saving}
              className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleSaveAndNext}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save & Next →'}
            </button>
            <button
              onClick={handleApproveAndNext}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Approve & Next →'}
            </button>
          </div>
        </div>
      </div>

      {/* Paste status toast */}
      {pasteStatus !== 'idle' && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-white text-sm font-medium shadow-lg transition-all ${
          pasteStatus === 'uploading' ? 'bg-blue-600' :
          pasteStatus === 'success' ? 'bg-green-600' :
          'bg-red-600'
        }`}>
          {pasteStatus === 'uploading' && '⏳ Cropping & setting as hero...'}
          {pasteStatus === 'success' && '✅ Screenshot set as hero!'}
          {pasteStatus === 'error' && `❌ ${pasteError || 'Failed to upload image'}`}
        </div>
      )}

      {/* Crop modal */}
      {cropPhoto && (
        <CropModal
          imageUrl={cropPhoto.url}
          listingId={listing.id}
          uploadType="gallery"
          onClose={() => setCropPhoto(null)}
          onSave={handleCropSave}
        />
      )}
    </>
  );
}
