'use client';

import { useState, useRef } from 'react';
import { X, Sparkles, CheckCircle2, Loader2, Image as ImageIcon, Star, Camera, Ban, Tag, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface PhotoGalleryModalProps {
  listingId: string;
  listingName: string;
  listingWebsite: string | null;
  photos: string[];
  blockedPhotos: string[];
  currentHeroImage: string | null;
  currentLogoPhoto: string | null;
  onClose: () => void;
  onHeroSelected: (listingId: string, heroUrl: string) => void;
  onBlockedPhotosChanged: (listingId: string, blocked: string[]) => void;
  onLogoPhotoChanged?: (listingId: string, logoUrl: string | null) => void;
  onPhotosChanged?: (listingId: string, photos: string[]) => void;
}

export default function PhotoGalleryModal({
  listingId,
  listingName,
  listingWebsite,
  photos,
  blockedPhotos: initialBlocked,
  currentHeroImage,
  currentLogoPhoto,
  onClose,
  onHeroSelected,
  onBlockedPhotosChanged,
  onLogoPhotoChanged,
  onPhotosChanged,
}: PhotoGalleryModalProps) {
  const [localPhotos, setLocalPhotos] = useState<string[]>(photos);
  const [selectedHero, setSelectedHero] = useState<string | null>(currentHeroImage || photos[0] || null);
  const [logoPhoto, setLogoPhoto] = useState<string | null>(currentLogoPhoto);
  const [suggestedUrl, setSuggestedUrl] = useState<string | null>(null);
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [blockedPhotos, setBlockedPhotos] = useState<string[]>(initialBlocked || []);
  const [savingBlocked, setSavingBlocked] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const blockedPhotosRef = useRef<string[]>(initialBlocked || []);
  const selectedHeroRef = useRef<string | null>(currentHeroImage || photos[0] || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateBlockedPhotos = (updated: string[]) => {
    blockedPhotosRef.current = updated;
    setBlockedPhotos(updated);
  };

  const updateSelectedHero = (url: string | null) => {
    selectedHeroRef.current = url;
    setSelectedHero(url);
  };

  const runAiSuggestion = async (photosToSuggest: string[]) => {
    setSuggesting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/suggest-hero-image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listing_id: listingId, photos: photosToSuggest, listing_name: listingName }),
        }
      );
      const result = await response.json();
      if (result.success) {
        setSuggestionReason(result.reason);

        if (result.blocked_urls && result.blocked_urls.length > 0) {
          const currentBlocked = blockedPhotosRef.current;
          const currentHero = selectedHeroRef.current;
          const newBlocked = result.blocked_urls.filter((url: string) => url !== currentHero);
          const mergedBlocked = Array.from(new Set([...currentBlocked, ...newBlocked]));
          updateBlockedPhotos(mergedBlocked);
          await supabase
            .from('listings')
            .update({ blocked_photos: mergedBlocked })
            .eq('id', listingId);
          onBlockedPhotosChanged(listingId, mergedBlocked);
        }

        if (result.no_good_photos) {
          updateSelectedHero(null);
          setSuggestedUrl(null);
        } else {
          setSuggestedUrl(result.suggested_url);
          const currentHero = selectedHeroRef.current;
          if (!currentHero || currentHero === photosToSuggest[0]) {
            updateSelectedHero(result.suggested_url);
          }
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
      const { error } = await supabase
        .from('listings')
        .update({ hero_image: selectedHero })
        .eq('id', listingId);
      if (error) throw error;
      onHeroSelected(listingId, selectedHero);
      onClose();
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
          body: JSON.stringify({ listing_id: listingId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to take screenshot');
      const screenshotUrl: string = result.screenshot_url;
      const updatedPhotos: string[] = result.photos ?? [...localPhotos, screenshotUrl];
      setLocalPhotos(updatedPhotos);
      onPhotosChanged?.(listingId, updatedPhotos);
      updateSelectedHero(screenshotUrl);
    } catch {
    } finally {
      setScreenshotting(false);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        let { width, height } = img;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Compressing ${i + 1} of ${files.length}...`);
      const compressedBlob = await compressImage(file);
      setUploadProgress(`Uploading ${i + 1} of ${files.length}...`);

      const fileName = `${listingId}/upload-${Date.now()}-${i}.jpg`;
      const compressedFile = new File([compressedBlob], fileName, { type: 'image/jpeg' });

      const { error: uploadError } = await supabase.storage
        .from('listing-photos')
        .upload(fileName, compressedFile, { contentType: 'image/jpeg', upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('listing-photos')
          .getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
    }

    if (newUrls.length > 0) {
      const updatedPhotos = [...localPhotos, ...newUrls];
      setLocalPhotos(updatedPhotos);

      await supabase
        .from('listings')
        .update({ photos: updatedPhotos })
        .eq('id', listingId);

      onPhotosChanged?.(listingId, updatedPhotos);

      if (!selectedHeroRef.current) {
        updateSelectedHero(newUrls[0]);
      }
    }

    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleBlock = async (url: string) => {
    const isBlocked = blockedPhotosRef.current.includes(url);
    const updated = isBlocked
      ? blockedPhotosRef.current.filter((u) => u !== url)
      : [...blockedPhotosRef.current, url];

    updateBlockedPhotos(updated);

    if (selectedHeroRef.current === url && !isBlocked) {
      updateSelectedHero(null);
    }

    setSavingBlocked(true);
    try {
      await supabase
        .from('listings')
        .update({ blocked_photos: updated })
        .eq('id', listingId);
      onBlockedPhotosChanged(listingId, updated);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  const toggleLogo = async (url: string) => {
    const newLogo = logoPhoto === url ? null : url;
    setLogoPhoto(newLogo);
    setSavingLogo(true);
    try {
      await supabase
        .from('listings')
        .update({ logo_photo: newLogo })
        .eq('id', listingId);
      onLogoPhotoChanged?.(listingId, newLogo);
    } catch {
    } finally {
      setSavingLogo(false);
    }
  };

  const blockAll = async () => {
    updateBlockedPhotos(localPhotos);
    updateSelectedHero(null);
    setSavingBlocked(true);
    try {
      await supabase
        .from('listings')
        .update({ blocked_photos: localPhotos })
        .eq('id', listingId);
      onBlockedPhotosChanged(listingId, localPhotos);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  const unblockAll = async () => {
    updateBlockedPhotos([]);
    setSavingBlocked(true);
    try {
      await supabase
        .from('listings')
        .update({ blocked_photos: [] })
        .eq('id', listingId);
      onBlockedPhotosChanged(listingId, []);
    } catch {
    } finally {
      setSavingBlocked(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#0F2744]">Photo Gallery</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {listingName} &mdash; {localPhotos.length} photo{localPhotos.length !== 1 ? 's' : ''}
              {blockedPhotos.length > 0 && (
                <span className="ml-2 text-red-500">({blockedPhotos.length} blocked)</span>
              )}
              {logoPhoto && (
                <span className="ml-2 text-amber-600">(logo tagged)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {localPhotos.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={unblockAll}
                  disabled={savingBlocked || blockedPhotos.length === 0}
                  className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs h-7 px-2"
                >
                  Unblock All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={blockAll}
                  disabled={savingBlocked || blockedPhotos.length === localPhotos.length}
                  className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-7 px-2"
                >
                  <Ban className="w-3 h-3 mr-1" />
                  Block All
                </Button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {suggesting && (
            <div className="flex items-center gap-2 mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              AI is reviewing photos — selecting hero and blocking low-quality images...
            </div>
          )}

          {!suggesting && suggestionReason && suggestedUrl && (
            <div className="flex items-start gap-3 mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-blue-900">AI Review: </span>
                <span className="text-blue-800">{suggestionReason}</span>
              </div>
            </div>
          )}

          {!suggesting && suggestionReason && !suggestedUrl && (
            <div className="flex items-start gap-3 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <Camera className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-900">No usable photos found. </span>
                <span className="text-amber-800">{suggestionReason} Taking a screenshot of the website as the hero image.</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <Tag className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-amber-800">
              Hover a photo and click the <strong>tag icon</strong> to mark it as the company logo. The logo is stored separately from the hero image.
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgress || 'Uploading...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Image
                </>
              )}
            </button>

            {listingWebsite && (
              <button
                onClick={takeScreenshot}
                disabled={screenshotting}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all duration-150 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {screenshotting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Screenshotting...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Screenshot Website
                  </>
                )}
              </button>
            )}
          </div>

          {localPhotos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ImageIcon className="w-12 h-12 mb-3" />
              <p className="text-sm">No photos yet. Upload an image or take a screenshot to get started.</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {localPhotos.map((url, idx) => {
              const isSelected = selectedHero === url;
              const isSuggested = suggestedUrl === url;
              const isBlocked = blockedPhotos.includes(url);
              const isLogo = logoPhoto === url;

              return (
                <div key={idx} className="relative group">
                  <button
                    onClick={() => !isBlocked && updateSelectedHero(url)}
                    className={`relative w-full rounded-xl overflow-hidden border-2 transition-all duration-200 aspect-video focus:outline-none ${
                      isBlocked
                        ? 'border-red-300 opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'border-[#22C55E] shadow-lg shadow-green-100 scale-[1.02]'
                        : isLogo
                        ? 'border-amber-400 shadow-md shadow-amber-100'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.broken-placeholder')) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'broken-placeholder w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 gap-1';
                          placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span style="font-size:10px">Image unavailable</span>';
                          parent.appendChild(placeholder);
                        }
                      }}
                    />

                    {isSelected && !isBlocked && (
                      <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                        <div className="bg-[#22C55E] rounded-full p-1">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}

                    {isBlocked && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <div className="bg-red-500 rounded-full p-1.5">
                          <Ban className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}

                    {isSuggested && !isBlocked && (
                      <div className="absolute top-2 right-2 bg-blue-600 rounded-full px-1.5 py-0.5 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-white" />
                        <span className="text-[10px] text-white font-medium">AI Pick</span>
                      </div>
                    )}

                    {isLogo && !isBlocked && (
                      <div className="absolute bottom-2 left-2 bg-amber-500 rounded-full px-1.5 py-0.5 flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5 text-white" />
                        <span className="text-[10px] text-white font-medium">Logo</span>
                      </div>
                    )}
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); toggleBlock(url); }}
                    disabled={savingBlocked}
                    title={isBlocked ? 'Unblock this photo' : 'Block this photo'}
                    className={`absolute top-2 left-2 rounded-full p-1 transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                      isBlocked
                        ? 'bg-red-500 text-white opacity-100'
                        : 'bg-white/90 text-gray-600 hover:bg-red-500 hover:text-white shadow'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLogo(url); }}
                    disabled={savingLogo || isBlocked}
                    title={isLogo ? 'Remove logo tag' : 'Tag as company logo'}
                    className={`absolute top-2 right-2 rounded-full p-1 transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                      isLogo
                        ? 'bg-amber-500 text-white opacity-100'
                        : 'bg-white/90 text-gray-600 hover:bg-amber-500 hover:text-white shadow'
                    } ${isBlocked ? 'hidden' : ''}`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-sm">
            {selectedHero ? (
              <span className="flex items-center gap-1.5 text-[#22C55E] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Hero image selected
              </span>
            ) : (
              <span className="text-gray-400">Click a photo to select it as the hero image</span>
            )}
          </div>
          <div className="flex gap-2">
            {!suggesting && localPhotos.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAiSuggestion(localPhotos)}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Re-suggest
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveHeroImage}
              disabled={!selectedHero || saving}
              className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving...</>
              ) : (
                <><Star className="w-4 h-4 mr-1.5" />Set as Hero</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
