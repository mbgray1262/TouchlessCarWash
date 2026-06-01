'use client';

import { useState } from 'react';
import {
  Plus, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, ExternalLink, Loader2, Check, X, Pencil,
} from 'lucide-react';
import { EQUIPMENT_BRAND_DATA, EQUIPMENT_MODEL_DATA } from '@/lib/equipment-data';

export type EquipmentVideoRow = {
  id: string;
  youtube_id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  brand_slug: string | null;
  model_slug: string | null;
};

// Brand-grouped model list for the "show on equipment page" dropdown. Built
// once from the static equipment catalog. Option value is "brand|model".
const MODEL_OPTIONS = EQUIPMENT_BRAND_DATA
  .map((brand) => ({
    label: brand.label,
    models: EQUIPMENT_MODEL_DATA.filter((m) => m.brandSlug === brand.slug),
  }))
  .filter((g) => g.models.length > 0);

export default function VideosManager({ initial }: { initial: EquipmentVideoRow[] }) {
  const [videos, setVideos] = useState<EquipmentVideoRow[]>(initial);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const activeCount = videos.filter((v) => v.is_active).length;

  async function refresh() {
    const r = await fetch('/api/admin/videos', { cache: 'no-store' });
    const d = await r.json();
    if (Array.isArray(d.videos)) setVideos(d.videos);
  }

  async function addVideo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!url.trim()) return;
    setAdding(true);
    try {
      const r = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not add that video.');
      } else {
        setUrl('');
        setNotice(`Added: ${d.video?.title ?? 'video'}`);
        await refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, fields: Partial<EquipmentVideoRow>) {
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch('/api/admin/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || 'Update failed.');
      else await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Remove "${title}" from the pool? This can't be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch('/api/admin/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || 'Delete failed.');
      else await refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Swap sort_order with the neighbor in the given direction.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= videos.length) return;
    const a = videos[index];
    const b = videos[target];
    setBusyId(a.id);
    setError(null);
    try {
      await fetch('/api/admin/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, sort_order: b.sort_order }),
      });
      await fetch('/api/admin/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, sort_order: a.sort_order }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Tag (or untag) a video to an equipment model. Value is "brand|model" or
  // "" to clear. Cleared tags send empty strings; the API turns those to null.
  async function setModelTag(id: string, value: string) {
    const [brand_slug, model_slug] = value ? value.split('|') : ['', ''];
    await patch(id, { brand_slug, model_slug } as Partial<EquipmentVideoRow>);
  }

  function startEdit(v: EquipmentVideoRow) {
    setEditId(v.id);
    setEditTitle(v.title);
  }
  async function saveEdit(id: string) {
    await patch(id, { title: editTitle });
    setEditId(null);
  }

  return (
    <div>
      {/* Add form */}
      <form onSubmit={addVideo} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <label className="block text-sm font-medium text-[#0F2744] mb-2">
          Add a video
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube link (e.g. https://www.youtube.com/watch?v=...)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add video
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          We automatically check the video is public and can be embedded, and pull in its title.
          Only videos showing real touchless equipment should be added.
        </p>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <X className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            <Check className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
          </div>
        )}
      </form>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {videos.length} video{videos.length !== 1 ? 's' : ''} · {activeCount} shown to users
        </h2>
      </div>

      {videos.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm">
          No videos yet. Paste a YouTube link above to add the first one.
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((v, i) => (
            <li
              key={v.id}
              className={`bg-white rounded-xl border p-3 flex gap-4 items-center ${
                v.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              {/* Thumbnail */}
              <button
                type="button"
                onClick={() => setPreview(v.youtube_id)}
                className="relative shrink-0 w-40 aspect-video rounded-lg overflow-hidden bg-black group"
                aria-label={`Preview ${v.title}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`}
                  alt={v.title}
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                  <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-gray-800">
                    Preview
                  </span>
                </span>
              </button>

              {/* Details */}
              <div className="flex-1 min-w-0">
                {editId === v.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button onClick={() => saveEdit(v.id)} className="text-green-600 hover:text-green-700" aria-label="Save title">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600" aria-label="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[#0F2744] truncate">{v.title}</p>
                    <button onClick={() => startEdit(v)} className="text-gray-300 hover:text-gray-500 shrink-0" aria-label="Edit title">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="font-mono">{v.youtube_id}</span>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-orange-600"
                  >
                    Open on YouTube <ExternalLink className="w-3 h-3" />
                  </a>
                  {!v.is_active && <span className="text-amber-600 font-medium">Hidden</span>}
                </div>
                {/* Equipment-page tag */}
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-400 shrink-0">Show on equipment page:</label>
                  <select
                    value={v.brand_slug && v.model_slug ? `${v.brand_slug}|${v.model_slug}` : ''}
                    onChange={(e) => setModelTag(v.id, e.target.value)}
                    disabled={busyId !== null}
                    className="max-w-[16rem] rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none disabled:opacity-50"
                  >
                    <option value="">— Not shown on an equipment page —</option>
                    {MODEL_OPTIONS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.models.map((m) => (
                          <option key={`${m.brandSlug}|${m.slug}`} value={`${m.brandSlug}|${m.slug}`}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || busyId !== null}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === videos.length - 1 || busyId !== null}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => patch(v.id, { is_active: !v.is_active })}
                  disabled={busyId !== null}
                  className={`p-1.5 rounded hover:bg-gray-100 ${v.is_active ? 'text-green-600' : 'text-gray-400'}`}
                  aria-label={v.is_active ? 'Hide from users' : 'Show to users'}
                  title={v.is_active ? 'Shown to users — click to hide' : 'Hidden — click to show'}
                >
                  {busyId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : v.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => remove(v.id, v.title)}
                  disabled={busyId !== null}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${preview}?autoplay=1&rel=0&modestbranding=1`}
                title="Video preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <button
              onClick={() => setPreview(null)}
              className="mt-3 mx-auto block rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
