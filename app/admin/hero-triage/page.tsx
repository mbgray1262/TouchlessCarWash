'use client';

/**
 * Fast batch hero-image triage.
 *
 * Shows 12 heroes at a time in a grid with clear actions:
 *   - Keep / Hold / Revert (fast triage)
 *   - Fix Hero (opens the manual photo curator to upload/paste/pick Google photos)
 *   - Google Maps / Street View quick links
 */
import { useEffect, useCallback, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CheckCircle2, PauseCircle, XCircle, RefreshCw, ExternalLink, Filter,
  Pencil, Map as MapIcon, Eye, AlertTriangle,
} from 'lucide-react';
import { FastCurationModal } from '../photo-audit/FastCurationModal';
import { getChainBrandImage } from '@/lib/chain-brand-images';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Queue = 'bad_hero' | 'uncertain_audit' | 'held_no_audit' | 'approved_risky';

interface TriageCard {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  hero_image: string | null;
  hero_image_source: string | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  google_place_id: string | null;
  is_approved: boolean;
  is_touchless: boolean;
  website: string | null;
  parent_chain: string | null;
  touchless_verified: string | null;
  amenities: string[] | null;
  crawl_notes: string | null;
  review_count: number | null;
  latitude: number | null;
  longitude: number | null;
  audit_verdict: string | null;
  audit_confidence: number | null;
  audit_flags: string[] | null;
  audit_reasoning: string | null;
  hero_quality: string | null;
  hero_reasoning: string | null;
}

const PAGE_SIZE = 12;

const QUEUE_OPTIONS: { value: Queue; label: string; desc: string }[] = [
  { value: 'bad_hero', label: 'BAD Heroes', desc: 'AI flagged hero image as bad (contact imagery, low-res, poor composition)' },
  { value: 'uncertain_audit', label: 'Uncertain Classifications', desc: 'AI audit UNCERTAIN — needs human judgment' },
  { value: 'held_no_audit', label: 'Held (no audit yet)', desc: 'Held listings that haven\'t been AI-audited' },
  { value: 'approved_risky', label: 'Approved + user_review only', desc: 'Currently live but classified from a single Yelp snippet' },
];

export default function HeroTriagePage() {
  const [queue, setQueue] = useState<Queue>('bad_hero');
  const [cards, setCards] = useState<TriageCard[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
  const [curatorListingId, setCuratorListingId] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/triage-queue?queue=${queue}&offset=${offset}&limit=${PAGE_SIZE}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setCards(json.cards);
      setTotal(json.total);
    } catch (e) {
      console.error('loadPage failed', e);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [queue, offset]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const act = useCallback(async (id: string, action: 'keep' | 'hold' | 'revert') => {
    setActionStatus(s => ({ ...s, [id]: 'pending' }));
    const patch: Partial<{ is_approved: boolean; is_touchless: boolean; touchless_verified: null; hero_image: null; hero_image_source: null; crawl_notes: string; photo_audited_at: string; reviewed_at: string }> = {};
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    if (action === 'keep') {
      patch.is_approved = true;
      patch.photo_audited_at = now;
      patch.reviewed_at = now;
      patch.crawl_notes = `[${today}] Admin kept via hero-triage.`;
    } else if (action === 'hold') {
      patch.is_approved = false;
      patch.hero_image = null;
      patch.hero_image_source = null;
      patch.crawl_notes = `[${today}] Held via hero-triage (hero cleared; awaiting replacement).`;
    } else {
      patch.is_approved = false;
      patch.is_touchless = false;
      patch.touchless_verified = null;
      patch.hero_image = null;
      patch.hero_image_source = null;
      patch.crawl_notes = `[${today}] Reverted via hero-triage (admin judgment).`;
    }
    const { error } = await supabase.from('listings').update(patch).eq('id', id);
    if (error) {
      console.error('update failed', error);
      setActionStatus(s => ({ ...s, [id]: 'error' }));
      return;
    }
    setActionStatus(s => ({ ...s, [id]: 'done' }));
    setTimeout(() => setCards(cs => cs.filter(c => c.id !== id)), 250);
  }, []);

  const next = useCallback(() => {
    setOffset(o => o + PAGE_SIZE);
    setActionStatus({});
  }, []);
  const prev = useCallback(() => {
    setOffset(o => Math.max(0, o - PAGE_SIZE));
    setActionStatus({});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hero Triage</h1>
            <p className="text-sm text-gray-500">Fast batch review — Keep, Hold, Revert, or open the curator to pick a better hero</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadPage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
            </button>
          </div>
        </div>

        {/* How to use box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
          <div className="font-semibold mb-1">How to use this page</div>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li><strong>Keep</strong>: hero + classification are OK. Approves listing + marks audited.</li>
            <li><strong>Hold</strong>: clears the bad hero; listing goes off the live site until you add a new hero via the curator.</li>
            <li><strong>Revert</strong>: this isn&rsquo;t really touchless → remove from the directory entirely.</li>
            <li><strong>Fix Hero</strong> (pencil icon): opens the same manual curator as Photo Audit — upload a file, paste a URL, pick from Google Photos / Street View candidates.</li>
            <li><strong>Maps</strong>: quick link to verify the location on Google Maps before deciding.</li>
          </ul>
        </div>

        {/* Queue selector */}
        <div className="bg-white border rounded-lg p-3 mb-4 flex items-start gap-3">
          <Filter className="w-4 h-4 text-gray-400 mt-1" />
          <div className="flex flex-wrap gap-2 flex-1">
            {QUEUE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setQueue(opt.value); setOffset(0); }}
                className={`px-3 py-1.5 rounded-lg text-sm ${queue === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-500 mb-2 flex items-center gap-4">
          <span>Queue total: <strong>{total}</strong></span>
          <span>Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}</span>
          <span className="ml-auto text-gray-400">Keyboard on hovered card: 1=Keep, 2=Hold, 3=Revert, 4=Fix Hero</span>
        </div>

        {loading && <div className="text-center py-12 text-gray-400">Loading…</div>}
        {!loading && cards.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            Queue empty. Switch queues or click Reload.
          </div>
        )}

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(c => (
            <TriageCardView
              key={c.id}
              card={c}
              status={actionStatus[c.id]}
              onAction={act}
              onFixHero={() => setCuratorListingId(c.id)}
            />
          ))}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={prev}
              disabled={offset === 0}
              className="px-4 py-2 bg-white border rounded-lg text-sm disabled:opacity-50"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">
              {Math.floor(offset / PAGE_SIZE) + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              onClick={next}
              disabled={offset + PAGE_SIZE >= total}
              className="px-4 py-2 bg-white border rounded-lg text-sm disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Manual curator modal (same as Photo Audit) */}
      {curatorListingId && (
        <FastCurationModal
          listingId={curatorListingId}
          onClose={() => setCuratorListingId(null)}
          onUpdate={() => {
            // After saving a new hero, remove the card from the triage queue
            setCards(cs => cs.filter(c => c.id !== curatorListingId));
            setCuratorListingId(null);
          }}
        />
      )}
    </div>
  );
}

function TriageCardView({
  card,
  status,
  onAction,
  onFixHero,
}: {
  card: TriageCard;
  status?: 'pending' | 'done' | 'error';
  onAction: (id: string, action: 'keep' | 'hold' | 'revert') => void;
  onFixHero: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!hovered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') onAction(card.id, 'keep');
      else if (e.key === '2') onAction(card.id, 'hold');
      else if (e.key === '3') onAction(card.id, 'revert');
      else if (e.key === '4') onFixHero();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hovered, card.id, onAction, onFixHero]);

  // Mirror the public listing page's hero priority:
  // manual/curated heroes win > chain brand image > hero_image > google > street view
  const chainBrand = card.parent_chain ? getChainBrandImage(card.parent_chain, card.id) : null;
  const HUMAN_SOURCES = new Set(['manual', 'gallery', 'upload', 'crop', 'paste', 'text-verified-pick']);
  const isHumanHero = card.hero_image_source ? HUMAN_SOURCES.has(card.hero_image_source) : false;
  const resolvedHero = (isHumanHero && card.hero_image) || chainBrand || card.hero_image || card.google_photo_url || card.street_view_url;

  // "Stale reasoning" — AI wrote hero_reasoning describing a hero that no longer exists
  const reasoningIsStale = !!card.hero_reasoning && !card.hero_image && !card.google_photo_url;

  const dim = status === 'done' ? 'opacity-40' : '';

  // Google Maps link by place_id (exact business) if available, else lat/lng
  const mapsHref = card.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${card.google_place_id}`
    : (card.latitude && card.longitude
      ? `https://www.google.com/maps/@${card.latitude},${card.longitude},18z`
      : `https://www.google.com/maps/search/${encodeURIComponent(`${card.name} ${card.city} ${card.state}`)}`);
  const streetViewHref = card.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${card.google_place_id}&layer=c`
    : (card.latitude && card.longitude
      ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${card.latitude},${card.longitude}`
      : null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-white border rounded-lg overflow-hidden transition-all ${dim} ${hovered ? 'ring-2 ring-blue-400' : ''}`}
    >
      {/* Hero */}
      <div className="relative aspect-video bg-gray-100">
        {resolvedHero ? (
          <img src={resolvedHero} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-xs gap-1 bg-gray-50">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <div className="font-medium text-gray-600">No hero stored</div>
            <button
              onClick={onFixHero}
              className="mt-1 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              Fix Hero →
            </button>
          </div>
        )}
        {/* AI verdict badges removed — they were frequently stale (from batch audits
            run against heroes that have since been replaced) and misled the admin.
            Rely on the admin's own visual judgment instead. */}
        {false && card.hero_quality && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            card.hero_quality === 'BAD' ? 'bg-red-600 text-white'
            : card.hero_quality === 'GOOD' ? 'bg-emerald-600 text-white'
            : card.hero_quality === 'OK' ? 'bg-amber-500 text-white'
            : 'bg-gray-500 text-white'
          }`}>Hero: {card.hero_quality}</span>
        )}
        {false && card.audit_verdict && (
          <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            card.audit_verdict === 'TOUCHLESS_CONFIRMED' ? 'bg-emerald-600 text-white'
            : card.audit_verdict === 'TOUCHLESS_PROBABLE' ? 'bg-emerald-500 text-white'
            : card.audit_verdict === 'UNCERTAIN' ? 'bg-amber-500 text-white'
            : card.audit_verdict === 'NOT_TOUCHLESS' ? 'bg-red-600 text-white'
            : 'bg-gray-500 text-white'
          }`}>{card.audit_verdict.replace('TOUCHLESS_', '')} {card.audit_confidence ? `${card.audit_confidence}%` : ''}</span>
        )}
        {isHumanHero && card.hero_image && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded-full">Manual</span>
        )}
        {!isHumanHero && chainBrand && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-600 text-white text-[10px] rounded-full">Chain brand</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 truncate">{card.name}</div>
            <div className="text-xs text-gray-500">{card.city}, {card.state} {card.review_count ? `· ${card.review_count}★` : ''}</div>
          </div>
          <a
            href={`/state/${card.state?.toLowerCase()}/${(card.city || '').toLowerCase().replace(/\s+/g, '-')}/${card.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:text-blue-800 shrink-0"
            title="View listing (live site)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Quick verification links */}
        <div className="flex items-center gap-2 mt-2 mb-2 text-xs">
          <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">
            <MapIcon className="w-3 h-3" /> Maps
          </a>
          {streetViewHref && (
            <a href={streetViewHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">
              <Eye className="w-3 h-3" /> Street View
            </a>
          )}
          <button
            onClick={onFixHero}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-700 font-medium ml-auto"
            title="Open the manual photo curator (4)"
          >
            <Pencil className="w-3 h-3" /> Fix Hero
          </button>
        </div>

        {/* AI reasoning REMOVED — stored verdicts are from old batch audits that
            frequently referenced heroes which have since been replaced. Showing
            them was actively misleading. Trust your own eyes on the image above. */}

        {/* Actions */}
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => onAction(card.id, 'keep')}
            disabled={status === 'pending'}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-xs font-medium disabled:opacity-50"
            title="Keep: approve + mark audited (1)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Keep
          </button>
          <button
            onClick={() => onAction(card.id, 'hold')}
            disabled={status === 'pending'}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-medium disabled:opacity-50"
            title="Hold: clear hero + set is_approved=false (2)"
          >
            <PauseCircle className="w-3.5 h-3.5" /> Hold
          </button>
          <button
            onClick={() => onAction(card.id, 'revert')}
            disabled={status === 'pending'}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium disabled:opacity-50"
            title="Revert: is_touchless=false (3)"
          >
            <XCircle className="w-3.5 h-3.5" /> Revert
          </button>
        </div>
        {status === 'error' && <div className="text-xs text-red-600 mt-1">Action failed — try again</div>}
        {status === 'done' && <div className="text-xs text-emerald-600 mt-1">Saved</div>}
      </div>
    </div>
  );
}
