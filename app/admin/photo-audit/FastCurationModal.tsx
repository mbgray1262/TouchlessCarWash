'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { X, ExternalLink, Check, Ban, Trash2, Sparkles, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useFastCuration, type CandidatePhoto } from './useFastCuration';
import { PhotoGrid } from './PhotoGrid';
import { StreetViewPanel } from './StreetViewPanel';
import { CropModal } from '../hero-review/CropModal';
import { autoEnhanceImage } from '../hero-review/autoEnhance';
import { EQUIPMENT_BRANDS, EQUIPMENT_MODELS } from '../hero-review/types';

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
    addCapture, addUpload, replaceUrl,
    saveAll, discoverPhotos, classifyEquipment,
    markNotTouchless, deleteListing,
  } = useFastCuration(listingId);

  const [cropPhoto, setCropPhoto] = useState<CandidatePhoto | null>(null);
  const [enhancing, setEnhancing] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const pasteRef = useRef<HTMLInputElement>(null);

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
    setEnhancing(photo.id);
    try {
      const enhanced = await autoEnhanceImage(photo.url);
      if (enhanced) {
        // Upload as FormData (the API expects a file upload)
        const formData = new FormData();
        formData.append('file', enhanced, `enhanced-${Date.now()}.jpg`);
        formData.append('type', 'gallery');
        if (listing?.id) formData.append('listingId', listing.id);

        const res = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          replaceUrl(photo.id, data.url);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error('Upload failed:', res.status, errData);
          alert('Failed to upload enhanced image');
        }
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
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
          const thumbUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&pano=${panoId}&heading=${heading}&pitch=0&key=${apiKey}`;
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

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{listing.name}</h2>
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

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">

            {/* Source counts + actions bar */}
            <div className="px-6 py-3 border-b bg-white flex items-center gap-4 flex-wrap">
              {sourceCounts && (
                <div className="flex gap-3 text-xs text-gray-500">
                  {sourceCounts.existing > 0 && <span className="bg-gray-100 px-2 py-1 rounded">{sourceCounts.existing} existing</span>}
                  {sourceCounts.google_places > 0 && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">{sourceCounts.google_places} Google</span>}
                  {sourceCounts.google_search > 0 && <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded">{sourceCounts.google_search} Search</span>}
                  {sourceCounts.website > 0 && <span className="bg-teal-50 text-teal-600 px-2 py-1 rounded">{sourceCounts.website} Website</span>}
                  {sourceCounts.street_view > 0 && <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded">Street View</span>}
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => { setPasteOpen(!pasteOpen); setTimeout(() => pasteRef.current?.focus(), 100); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Paste URL
                </button>
                <button
                  onClick={discoverPhotos}
                  disabled={discovering}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} /> Refresh
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
                discovering={discovering}
              />
            </div>

            {/* Street View */}
            {listing.latitude && listing.longitude && (
              <div className="px-6 pb-4">
                <StreetViewPanel
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  apiKey={googleMapsApiKey}
                  onCapture={(panoId, heading, url) => addCapture(panoId, heading, url)}
                />
              </div>
            )}

            {/* Equipment */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Equipment</h3>
                <span className="text-sm text-gray-500">
                  {listing.equipment_brand
                    ? `${EQUIPMENT_BRANDS.find(b => b.value === listing.equipment_brand)?.label ?? listing.equipment_brand}${listing.equipment_model ? ` — ${listing.equipment_model}` : ''}`
                    : 'Not classified'}
                </span>
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

            <div className="flex-1" />

            {listing.website && (
              <button
                onClick={() => window.open(listing.website!, '_blank')}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
              >
                Website
              </button>
            )}
            {listing.google_place_id && (
              <button
                onClick={() => window.open(`https://www.google.com/maps/place/?q=place_id:${listing.google_place_id}`, '_blank')}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
              >
                Google Maps
              </button>
            )}

            {onPrev && (
              <button
                onClick={onPrev}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-2.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                ← Prev
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
          </div>
        </div>
      </div>

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
