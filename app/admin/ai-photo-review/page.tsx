'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Camera, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  ExternalLink, ChevronLeft, ChevronRight, ImageOff, Eye,
  ThumbsUp, ThumbsDown, Loader2, BarChart3, Crop, Trash2,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { CropModal } from '../hero-review/CropModal';
import { FastCurationModal } from '../photo-audit/FastCurationModal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Listing {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  hero_image: string | null;
  hero_image_source: string | null;
  hero_focal_point: string | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  photos: string[] | null;
  updated_at: string | null;
}

type ViewMode = 'recent' | 'rejected' | 'all';

const PAGE_SIZE = 36;

function FocalBadge({ fp }: { fp: string | null }) {
  const val = fp ?? 'center';
  const cls =
    val === 'top' ? 'bg-sky-100 text-sky-700' :
    val === 'bottom' ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{val}</span>;
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">none</span>;
  const colors: Record<string, string> = {
    gallery: 'bg-emerald-100 text-emerald-700',
    google: 'bg-blue-100 text-blue-700',
    street_view: 'bg-amber-100 text-amber-700',
    backfill: 'bg-purple-100 text-purple-700',
    places_api: 'bg-indigo-100 text-indigo-700',
    rehosted: 'bg-teal-100 text-teal-700',
  };
  const cls = colors[source] ?? 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{source.replace('_', ' ')}</span>;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${color}`}>
      <Icon className="w-5 h-5 shrink-0" />
      <div>
        <p className="text-2xl font-bold leading-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="text-xs opacity-70">{label}</p>
      </div>
    </div>
  );
}

function PhotoCard({ listing, onImgError, onCrop, onDeleteGalleryPhoto, onOpenEditor }: {
  listing: Listing;
  onImgError: (id: string) => void;
  onCrop: (listingId: string, url: string, type: 'hero' | 'gallery') => void;
  onDeleteGalleryPhoto: (listingId: string, url: string) => void;
  onOpenEditor: (listingId: string) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const gallery = (listing.photos ?? []).filter(p => p !== listing.hero_image);
  const hasHero = !!listing.hero_image && !imgErr;

  const focalPoint = listing.hero_focal_point ?? 'center';
  const objectPosition = focalPoint === 'top' ? 'center 20%' : focalPoint === 'bottom' ? 'center 80%' : 'center';

  return (
    <div className={`rounded-xl border overflow-hidden bg-white shadow-sm transition-all ${hasHero ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
      {/* Hero image area */}
      <div className="relative h-40 bg-gray-100 overflow-hidden group">
        {listing.hero_image && !imgErr ? (
          <>
            <img
              src={listing.hero_image}
              alt={listing.name}
              loading="lazy"
              decoding="async"
              width={320}
              height={160}
              className="w-full h-full object-cover"
              style={{ objectPosition }}
              onError={() => { setImgErr(true); onImgError(listing.id); }}
            />
            {/* Crop button — appears on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); onCrop(listing.id, listing.hero_image!, 'hero'); }}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 hover:bg-blue-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              title="Crop hero image"
            >
              <Crop className="w-3.5 h-3.5" />
            </button>
            {/* Focal point indicator line */}
            {focalPoint !== 'center' && (
              <div
                className={`absolute left-0 right-0 h-0.5 bg-cyan-400/60 pointer-events-none`}
                style={{ top: focalPoint === 'top' ? '20%' : '80%' }}
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <ImageOff className="w-8 h-8 text-red-300" />
            <span className="text-xs text-red-400 font-medium">
              {listing.hero_image ? 'Broken image' : 'No hero — all rejected'}
            </span>
          </div>
        )}

        {/* Gallery count badge */}
        {gallery.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[10px] font-medium transition-colors"
          >
            <Camera className="w-3 h-3" />
            {gallery.length}
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => onOpenEditor(listing.id)}
            className="text-sm font-semibold text-gray-800 truncate flex-1 text-left hover:text-blue-600 transition-colors cursor-pointer"
            title="Open in Photo Audit editor"
          >
            {listing.name}
          </button>
          <a
            href={`https://touchlesscarwashfinder.com/state/${encodeURIComponent(listing.state.toLowerCase())}/${encodeURIComponent(listing.city.toLowerCase().replace(/\s+/g, '-'))}/${listing.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-500 transition-colors shrink-0"
            title="View listing"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{listing.city}, {listing.state}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <SourceBadge source={listing.hero_image_source} />
          <FocalBadge fp={listing.hero_focal_point} />
          {gallery.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              {gallery.length} gallery
            </span>
          )}
        </div>
      </div>

      {/* Expanded gallery */}
      {expanded && gallery.length > 0 && (
        <div className="border-t border-gray-100 p-2 bg-gray-50">
          <div className="flex flex-wrap gap-1.5">
            {gallery.map((url, i) => (
              <div key={i} className="relative group/gal">
                <img
                  src={url}
                  alt={`Gallery ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  width={64}
                  height={48}
                  className="w-16 h-12 object-cover rounded border border-gray-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 group-hover/gal:opacity-100 transition-all rounded">
                  <button
                    onClick={() => onCrop(listing.id, url, 'gallery')}
                    className="w-6 h-6 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
                    title="Crop gallery photo"
                  >
                    <Crop className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDeleteGalleryPhoto(listing.id, url)}
                    className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Delete gallery photo"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIPhotoReviewPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('recent');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, withHero: 0, rejected: 0, pending: 0 });
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [cropInfo, setCropInfo] = useState<{ listingId: string; url: string; type: 'hero' | 'gallery' } | null>(null);
  const [editorListingId, setEditorListingId] = useState<string | null>(null);

  const handleCropSave = async (croppedUrl: string) => {
    if (!cropInfo) return;
    const { listingId, url: oldUrl, type } = cropInfo;

    if (type === 'hero') {
      await supabase.from('listings').update({ hero_image: croppedUrl }).eq('id', listingId);
    } else {
      // Replace the gallery photo URL in the photos array
      const listing = listings.find(l => l.id === listingId);
      if (listing?.photos) {
        const updatedPhotos = listing.photos.map(p => p === oldUrl ? croppedUrl : p);
        await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', listingId);
      }
    }

    // Update local state so the UI reflects the change immediately
    setListings(prev => prev.map(l => {
      if (l.id !== listingId) return l;
      if (type === 'hero') return { ...l, hero_image: croppedUrl };
      return { ...l, photos: (l.photos ?? []).map(p => p === oldUrl ? croppedUrl : p) };
    }));

    setCropInfo(null);
  };

  const handleDeleteGalleryPhoto = async (listingId: string, url: string) => {
    const listing = listings.find(l => l.id === listingId);
    if (!listing?.photos) return;
    const updatedPhotos = listing.photos.filter(p => p !== url);
    await supabase.from('listings').update({ photos: updatedPhotos }).eq('id', listingId);
    setListings(prev => prev.map(l => {
      if (l.id !== listingId) return l;
      return { ...l, photos: updatedPhotos };
    }));
  };

  const fetchStats = useCallback(async () => {
    // Total touchless listings
    const { count: totalTouchless } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true);

    // Total with photo audit results (AI has processed them)
    const { count: totalAudited } = await supabase
      .from('photo_audit_results')
      .select('id', { count: 'exact', head: true });

    // Touchless listings WITH a hero image (regardless of source)
    const { count: withHero } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .not('hero_image', 'is', null);

    // AI-processed with NO hero (all rejected by AI)
    const { count: noHero } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .eq('hero_image_source', 'gallery')
      .is('hero_image', null);

    // Still pending = total touchless minus those with audit results
    const total = totalTouchless ?? 0;
    const audited = totalAudited ?? 0;
    const pending = Math.max(0, total - audited);

    setStats({
      total: audited,
      withHero: withHero ?? 0,
      rejected: noHero ?? 0,
      pending,
    });
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('listings')
      .select('id, name, slug, city, state, hero_image, hero_image_source, hero_focal_point, google_photo_url, street_view_url, photos, updated_at', { count: 'exact' })
      .eq('is_touchless', true)
      .order('updated_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (view === 'rejected') {
      query = query.is('hero_image', null);
    } else if (view === 'recent') {
      query = query.not('hero_image', 'is', null);
    }

    const { data, count } = await query;
    setListings(data ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [view, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => { setPage(0); }, [view]);

  // Auto-refresh stats every 30s
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const progressPct = stats.total > 0 ? Math.round(((stats.total) / (stats.total + stats.pending)) * 100) : 0;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Eye className="w-6 h-6 text-blue-500" />
            AI Photo Selection Quality Review
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor hero images and galleries selected by the AI photo curation script.
          </p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchListings(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6 p-4 rounded-xl bg-white border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">
            Processing Progress
          </span>
          <span className="text-sm text-gray-500">
            {stats.total.toLocaleString()} / {(stats.total + stats.pending).toLocaleString()} ({progressPct}%)
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {stats.pending > 0 ? `~${stats.pending.toLocaleString()} listings still waiting for AI selection` : 'All listings processed!'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="AI Processed"
          value={stats.total}
          icon={BarChart3}
          color="bg-white border-gray-200 text-gray-700"
        />
        <StatCard
          label="Heroes Selected"
          value={stats.withHero}
          icon={CheckCircle}
          color="bg-emerald-50 border-emerald-200 text-emerald-700"
        />
        <StatCard
          label="All Rejected"
          value={stats.rejected}
          icon={XCircle}
          color="bg-red-50 border-red-200 text-red-700"
        />
        <StatCard
          label="Still Pending"
          value={stats.pending}
          icon={AlertTriangle}
          color="bg-amber-50 border-amber-200 text-amber-700"
        />
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { key: 'recent' as ViewMode, label: 'Heroes Selected', icon: ThumbsUp },
          { key: 'rejected' as ViewMode, label: 'All Rejected', icon: ThumbsDown },
          { key: 'all' as ViewMode, label: 'All Processed', icon: Camera },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}

        <span className="text-sm text-gray-400 ml-auto">
          {totalCount.toLocaleString()} listings
          {totalPages > 1 && ` \u00B7 Page ${page + 1} of ${totalPages}`}
        </span>
      </div>

      {/* Photo grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ImageOff className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium">No listings in this view yet</p>
          <p className="text-sm">The AI script is still running. Refresh in a few minutes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {listings.map((l) => (
            <PhotoCard
              key={l.id}
              listing={l}
              onImgError={(id) => setBrokenIds((s) => new Set(s).add(id))}
              onCrop={(listingId, url, type) => setCropInfo({ listingId, url, type })}
              onDeleteGalleryPhoto={handleDeleteGalleryPhoto}
              onOpenEditor={(id) => setEditorListingId(id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">Page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page + 1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                  setPage(val - 1);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              className="w-16 px-2 py-1.5 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
            <span className="text-sm text-gray-500">of {totalPages}</span>
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Crop modal */}
      {cropInfo && (() => {
        const listing = listings.find(l => l.id === cropInfo.listingId);
        const gallery = (listing?.photos ?? []).filter(p => p !== listing?.hero_image);
        const currentGalleryIdx = gallery.indexOf(cropInfo.url);
        const isGallery = cropInfo.type === 'gallery';

        return (
          <CropModal
            imageUrl={cropInfo.url}
            listingId={cropInfo.listingId}
            uploadType={cropInfo.type}
            onClose={() => setCropInfo(null)}
            onSave={handleCropSave}
            onDelete={isGallery ? () => {
              handleDeleteGalleryPhoto(cropInfo.listingId, cropInfo.url);
              // Navigate to next gallery image or close
              if (gallery.length > 1 && currentGalleryIdx < gallery.length - 1) {
                setCropInfo({ ...cropInfo, url: gallery[currentGalleryIdx + 1] });
              } else if (gallery.length > 1 && currentGalleryIdx > 0) {
                setCropInfo({ ...cropInfo, url: gallery[currentGalleryIdx - 1] });
              } else {
                setCropInfo(null);
              }
            } : undefined}
            onPrev={isGallery && currentGalleryIdx > 0 ? () => {
              setCropInfo({ ...cropInfo, url: gallery[currentGalleryIdx - 1] });
            } : undefined}
            onNext={isGallery && currentGalleryIdx < gallery.length - 1 ? () => {
              setCropInfo({ ...cropInfo, url: gallery[currentGalleryIdx + 1] });
            } : undefined}
            onEnhance={async () => {
              try {
                const { autoEnhanceImage } = await import('../hero-review/autoEnhance');
                const enhanced = await autoEnhanceImage(cropInfo.url);
                if (enhanced) {
                  const formData = new FormData();
                  formData.append('file', enhanced, 'enhanced.jpg');
                  formData.append('type', cropInfo.type);
                  formData.append('listingId', cropInfo.listingId);
                  const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
                  if (!res.ok) throw new Error('Upload failed');
                  const { url } = await res.json();
                  // Save the enhanced URL
                  handleCropSave(url);
                  setCropInfo(null);
                }
              } catch (err) {
                console.error('Enhance failed:', err);
                alert('Enhancement failed — the image may be from an external source that blocks editing.');
              }
            }}
            zIndex={60}
          />
        );
      })()}

      {/* Photo Audit editor modal */}
      {editorListingId && (
        <FastCurationModal
          listingId={editorListingId}
          onClose={() => { setEditorListingId(null); fetchListings(); }}
          onUpdate={() => fetchListings()}
        />
      )}
    </div>
  );
}
