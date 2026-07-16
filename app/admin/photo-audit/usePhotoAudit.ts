'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// PostgREST .or() filter that keeps every listing EXCEPT permanently/temporarily
// closed ones (classification_source starts with "closed_"). Closed listings are
// un-approved and redirect on the public side, so they never need photo curation
// and only clutter the review queues. The `is.null` clause is required so listings
// with a NULL classification_source aren't dropped (NULL NOT ILIKE … is NULL → excluded).
const NOT_CLOSED = 'classification_source.is.null,classification_source.not.ilike.closed*';

export interface AuditResult {
  id: string;
  listing_id: string;
  equipment_brand: string | null;
  equipment_model: string | null;
  equipment_confidence: string | null;
  equipment_source_photo: string | null;
  hero_quality: string | null;
  suggested_hero_url: string | null;
  suggested_hero_reason: string | null;
  photos_to_remove: string[];
  raw_response: Record<string, unknown> | null;
  reviewed: boolean;
  applied: boolean;
  google_photos_added?: number;
  google_photos_screened?: number;
  created_at: string;
  // Joined listing data
  listing_name?: string;
  listing_hero?: string;
  listing_city?: string;
  listing_state?: string;
  listing_slug?: string;
  listing_parent_chain?: string | null;
  // Surfaces a Closed pill in the held queue so admins can skip
  // permanently/temporarily-closed locations without opening the
  // modal. Set by markClosed() to closed_permanently_admin or
  // closed_temporarily_admin.
  listing_classification_source?: string | null;
  // Best-Of trophy context (populated only on the 'best_of' filter): the
  // listing's best (lowest) rank across all metros it places in, plus a
  // human-readable list of every "Metro #rank" trophy it holds.
  best_of_rank?: number;
  best_of_labels?: string[];
}

export interface BatchJob {
  id: string;
  status: string;
  total_requested: number;
  total_processed: number;
  dry_run: boolean;
  include_google_photos: boolean;
  equipment_detected: number;
  heroes_replaced: number;
  photos_removed: number;
  auto_applied: number;
  google_photos_added: number;
  google_photos_screened: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditStats {
  total: number;
  applied: number;
  pending: number;
  equipment: number;
  heroes: number;
  cleanup: number;
  needs_review: number;
  equipment_total: number;
  heroes_total: number;
  cleanup_total: number;
  low_res_total: number;
}

export interface LowResListing {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  hero_image: string;
  hero_image_source: string | null;
}

export type ViewFilter = 'all' | 'review' | 'equipment' | 'heroes' | 'cleanup' | 'no_hero' | 'low_res' | 'held' | 'unscanned' | 'second_look' | 'best_of' | 'no_evidence' | 'by_equipment' | 'tier2_recheck' | 'ai_picked';

// Hero sources the AI chose without a human looking. A listing with one of these,
// still approved and not yet human-confirmed (self_service_source !== 'admin_review'),
// is what the "AI-Picked" self-serve tab surfaces for spot-checking.
export const AI_HERO_SOURCES = ['autopilot', 'ai_photo', 'street_view_fix', 'streetview-ai'];

const POLL_INTERVAL = 3000; // 3 seconds — fast enough to show per-listing progress
const PAGE_SIZE = 25;

function checkImageDimensions(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const timeout = setTimeout(() => resolve(false), 10_000);
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img.naturalWidth < 400 || img.naturalHeight < 300);
    };
    img.onerror = () => { clearTimeout(timeout); resolve(false); };
    img.src = url;
  });
}

export function usePhotoAudit() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState('');
  const [includeGooglePhotos, setIncludeGooglePhotos] = useState(true);
  const [stats, setStats] = useState<AuditStats>({
    total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0,
    needs_review: 0, equipment_total: 0, heroes_total: 0, cleanup_total: 0, low_res_total: 0,
  });
  const [lowResListings, setLowResListings] = useState<LowResListing[]>([]);
  const [lowResTotal, setLowResTotal] = useState(0);
  const [lowResPage, setLowResPage] = useState(1);
  const [scanProgress, setScanProgress] = useState('');
  const [queueStats, setQueueStats] = useState({ totalUntagged: 0, alreadyAudited: 0, remaining: 0 });
  const [activeJob, setActiveJob] = useState<BatchJob | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  // Free-text search for the "All" tab — matches listing name or URL slug.
  // Empty string means no filter.
  const [searchQuery, setSearchQuery] = useState('');
  // Sub-filter for the "No Hero" tab — 'all' shows every listing with null hero_image,
  // 'non_chain' hides chain listings (they render a brand image so admin doesn't need
  // to curate them), 'chain_only' shows just chain listings.
  const [noHeroSubFilter, setNoHeroSubFilter] = useState<'all' | 'non_chain' | 'chain_only'>('non_chain');
  // Equipment-brand review filter: pick a maker to review ALL its listings for
  // classification errors (mine or the AI's). equipmentBrands = distinct brands
  // + counts, for the dropdown.
  const [equipmentBrand, setEquipmentBrandState] = useState<string>('');
  const [equipmentBrands, setEquipmentBrands] = useState<{ brand: string; count: number }[]>([]);
  const [page, setPage] = useState(1);
  const [noHeroCount, setNoHeroCount] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [heldCount, setHeldCount] = useState(0);
  const [secondLookCount, setSecondLookCount] = useState(0);
  const [aiPickedCount, setAiPickedCount] = useState(0);
  const [bestOfCount, setBestOfCount] = useState(0);
  const [bestOfReviewedCount, setBestOfReviewedCount] = useState(0);
  const [bestOfTotal, setBestOfTotal] = useState(0);
  // Best-Of tab sub-filter: 'to_review' (default — winners not yet hero-checked),
  // 'reviewed' (already checked this pass), or 'all'.
  const [bestOfSubFilter, setBestOfSubFilter] = useState<'to_review' | 'reviewed' | 'all'>('to_review');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuingRef = useRef(false);
  // Per-session cache of the deduped trophy-winner list (best rank + labels
  // per listing). Built once from best_of_rankings; reused for both the tab
  // count and pagination so we don't re-scan the table on every page turn.
  const trophyCacheRef = useRef<Array<{ listing_id: string; bestRank: number; labels: string[] }> | null>(null);

  const [noHeroUnprocessed, setNoHeroUnprocessed] = useState(0);

  // Wash-type scope for the whole page: 'touchless' (default) or 'self_serve'.
  // Every direct listing query reads washColRef.current, so switching the toggle
  // re-scopes all tabs without threading a variable through each callback's deps.
  // (RPC-backed tabs — Review/Equipment/Heroes/Cleanup/Low-Res — stay touchless.)
  const [washType, setWashType] = useState<'touchless' | 'self_serve'>('touchless');
  const washColRef = useRef<'is_touchless' | 'is_self_service'>('is_touchless');
  washColRef.current = washType === 'self_serve' ? 'is_self_service' : 'is_touchless';
  // "Reviewed" marker column, scoped to wash type. Touchless review is tracked by
  // photo_audited_at; self-serve review is tracked separately by
  // self_service_reviewed_at (see migration 20260710120000). Queue surfaces that
  // mean "has this been reviewed for THIS wash type" read reviewedColRef.current
  // so a mixed listing stays in the self-serve queue until reviewed there too.
  const reviewedColRef = useRef<'photo_audited_at' | 'self_service_reviewed_at'>('photo_audited_at');
  reviewedColRef.current = washType === 'self_serve' ? 'self_service_reviewed_at' : 'photo_audited_at';
  // Self-serve launch: work state-by-state (densest first) so state pages gain
  // depth, instead of scattering approvals alphabetically. stateFilter narrows the
  // All queue to one state; the self-serve All query also clusters by state/city.
  const [stateFilter, setStateFilter] = useState<string>('');
  const stateFilterRef = useRef('');
  stateFilterRef.current = stateFilter;
  // Per-state counts of the remaining (unreviewed) self-serve queue, for the picker.
  const [selfServeStateCounts, setSelfServeStateCounts] = useState<{ state: string; count: number }[]>([]);

  const loadQueueStats = useCallback(async () => {
    const [totalRes, auditedRes, noHeroRes, noHeroUnprocessedRes, heldRes, secondLookRes] = await Promise.all([
      // Total = ALL touchless listings (including chain brand locations with null hero_image)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true),
      // Audited = all listings reviewed for the active wash type (any hero state)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).not(reviewedColRef.current, 'is', null),
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).is('hero_image', null)
        .or('hero_image_source.is.null,hero_image_source.neq.fallback'),
      // Count only unprocessed No Hero listings (for Run All button)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).is('hero_image', null).is('photo_audited_at', null)
        .or('hero_image_source.is.null,hero_image_source.neq.fallback'),
      // Held = touchless + not approved (admin review queue). Excludes closed
      // listings to match the held queue itself (see NOT_CLOSED).
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).eq('is_approved', false)
        .or(NOT_CLOSED),
      // Second Look = independent (non-chain) listings reverted by the
      // mass-restore that didn't have strong enough touchless signals to
      // re-promote automatically. Excludes ones already audit-confirmed
      // demoted in the Apr 27 / 28 audit passes — those are settled.
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', false).eq('is_approved', false).is('parent_chain', null)
        .ilike('crawl_notes', '%mass-restore%')
        .not('crawl_notes', 'ilike', '%re-audit confirmed correctly demoted%'),
    ]);

    const total = totalRes.count ?? 0;
    const audited = auditedRes.count ?? 0;
    setNoHeroCount(noHeroRes.count ?? 0);
    setNoHeroUnprocessed(noHeroUnprocessedRes.count ?? 0);
    setHeldCount(heldRes.count ?? 0);
    setSecondLookCount(secondLookRes.count ?? 0);
    // AI-Picked (self-serve only): approved listings where the AI chose the hero and
    // no human has confirmed yet (source not 'admin_review'). Confirming in the editor
    // sets source='admin_review', so the listing drops out of this count on next load.
    if (washColRef.current === 'is_self_service') {
      const aiPickedRes = await supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_self_service', true).eq('is_approved', true)
        .in('hero_image_source', AI_HERO_SOURCES)
        .neq('self_service_source', 'admin_review')
        .or(NOT_CLOSED);
      setAiPickedCount(aiPickedRes.count ?? 0);
    } else {
      setAiPickedCount(0);
    }
    setQueueStats({
      totalUntagged: total,
      alreadyAudited: audited,
      remaining: Math.max(0, total - audited),
    });
  }, []);

  // Load stats using the server-side RPC (avoids loading all rows)
  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_photo_audit_stats');
    if (error) {
      console.error('Error loading audit stats:', error);
      return;
    }
    if (data) {
      const s = { ...(data as AuditStats) };
      // The touchless RPC doesn't know about self-serve. In self-serve mode, "Need
      // Review" = listings the autophoto pipeline flagged (self_service_source=
      // 'autophoto_needs_human') that are still unreviewed, scoped to the active
      // state filter. Overriding here keeps the tab count consistent on every reload.
      if (washColRef.current === 'is_self_service') {
        let q = supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_self_service', true)
          // NOT filtered on self_service_reviewed_at: a remediated-but-already-approved
          // listing must resurface for re-review WITHOUT being unpublished (keeping
          // reviewed_at set keeps it live). Approving clears self_service_source so it drops.
          .eq('self_service_source', 'autophoto_needs_human')
          .or(NOT_CLOSED).or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)');
        if (stateFilterRef.current) q = q.eq('state', stateFilterRef.current);
        const { count } = await q;
        s.needs_review = count ?? 0;
      }
      setStats(s);
    }
  }, []);

  // Build the deduped list of Best-Of trophy winners — every listing that holds
  // a top-3 (gold/silver/bronze) rank in best_of_rankings, same definition the
  // public badge + outreach QA gate use. Paginates past the 1000-row SELECT cap.
  // Result is cached on trophyCacheRef and sorted by best rank, then metro.
  const fetchTrophyListings = useCallback(async (force = false) => {
    if (trophyCacheRef.current && !force) return trophyCacheRef.current;
    const byListing = new Map<string, { bestRank: number; labels: string[] }>();
    for (let off = 0; ; off += 1000) {
      const { data } = await supabase
        .from('best_of_rankings')
        .select('listing_id, metro_name, rank')
        .lte('rank', 3)
        .order('listing_id', { ascending: true })
        .range(off, off + 999);
      if (!data || data.length === 0) break;
      for (const r of data as Array<{ listing_id: string; metro_name: string; rank: number }>) {
        const cur = byListing.get(r.listing_id) ?? { bestRank: 99, labels: [] };
        cur.bestRank = Math.min(cur.bestRank, r.rank);
        cur.labels.push(`${r.metro_name} #${r.rank}`);
        byListing.set(r.listing_id, cur);
      }
      if (data.length < 1000) break;
    }
    const arr = Array.from(byListing.entries()).map(([listing_id, v]) => ({ listing_id, ...v }));
    // Highest honor first (rank 1 → top), then alphabetically by first trophy.
    arr.sort((a, b) => a.bestRank - b.bestRank || (a.labels[0] ?? '').localeCompare(b.labels[0] ?? ''));
    trophyCacheRef.current = arr;
    setBestOfTotal(arr.length);
    return arr;
  }, []);

  // Which of the given listing IDs have been hero-reviewed this pass (i.e. have
  // best_of_hero_reviewed_at set). Chunked to stay under the 1000-row cap.
  const getBestOfReviewedSet = useCallback(async (ids: string[]): Promise<Set<string>> => {
    const reviewed = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase
        .from('listings')
        .select('id')
        .in('id', ids.slice(i, i + 300))
        .not('best_of_hero_reviewed_at', 'is', null);
      for (const r of data ?? []) reviewed.add(r.id as string);
    }
    return reviewed;
  }, []);

  // Refresh the Best-Of tab counters (total / reviewed / remaining-to-review)
  // without loading a page of rows. Used on mount and after marking actions.
  const refreshBestOfCounts = useCallback(async () => {
    const trophies = await fetchTrophyListings();
    const reviewed = await getBestOfReviewedSet(trophies.map(t => t.listing_id));
    setBestOfTotal(trophies.length);
    setBestOfReviewedCount(reviewed.size);
    setBestOfCount(trophies.length - reviewed.size); // remaining to review
  }, [fetchTrophyListings, getBestOfReviewedSet]);

  // Load a single page of results using the server-side RPC.
  // Note: `noHeroSubFilter` is read from component state below (captured via closure);
  // loadPage is re-created when it changes so pagination reacts to filter changes.
  const loadPage = useCallback(async (filter: ViewFilter, pageNum: number, unreviewed: boolean = false) => {
    setLoading(true);
    const offset = (pageNum - 1) * PAGE_SIZE;

    // Special handling for "no_hero" filter — shows listings with no hero_image.
    // Pagination bug fix: previously fetched only first PAGE_SIZE then sliced by offset
    // → empty results on page 2+. Now uses .range() directly.
    // Also supports noHeroSubFilter: 'all' | 'non_chain' | 'chain_only'
    if (filter === 'no_hero') {
      const sub = noHeroSubFilter; // 'all' | 'non_chain' | 'chain_only'

      // Exclude listings the admin already marked as "use generic fallback"
      // (hero_image_source='fallback' with hero_image NULL by DB-trigger design).
      const FALLBACK_NOT = 'hero_image_source.is.null,hero_image_source.neq.fallback';
      let countQuery = supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).eq('is_approved', true).is('hero_image', null)
        .or(FALLBACK_NOT);
      let dataQuery = supabase.from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq(washColRef.current, true).eq('is_approved', true).is('hero_image', null)
        .or(FALLBACK_NOT);

      if (sub === 'non_chain') {
        countQuery = countQuery.is('parent_chain', null);
        dataQuery = dataQuery.is('parent_chain', null);
      } else if (sub === 'chain_only') {
        countQuery = countQuery.not('parent_chain', 'is', null);
        dataQuery = dataQuery.not('parent_chain', 'is', null);
      }

      const [{ count: totalNoHero }, { data: listings }] = await Promise.all([
        countQuery,
        dataQuery.order('parent_chain', { ascending: true, nullsFirst: true })
          .order('name', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1),
      ]);

      const count = totalNoHero ?? 0;

      const toResult = (l: NonNullable<typeof listings>[number], quality: string): AuditResult => ({
        id: `nohero-${l.id}`,
        listing_id: l.id,
        listing_name: l.name,
        listing_city: l.city,
        listing_state: l.state,
        listing_hero: l.hero_image,
        hero_quality: quality,
        equipment_brand: l.equipment_brand,
        equipment_model: l.equipment_model,
        equipment_confidence: null,
        equipment_source_photo: null,
        suggested_hero_url: null,
        suggested_hero_reason: quality === 'missing' ? 'No hero image' : 'Recently processed',
        photos_to_remove: [],
        reviewed: false,
        applied: quality !== 'missing',
        created_at: '',
        raw_response: null,
        google_photos_added: 0,
        google_photos_screened: 0,
        listing_parent_chain: l.parent_chain ?? null,
      });

      const allResults: AuditResult[] = [];
      if (listings) {
        for (const l of listings) {
          const hasHero = !!l.hero_image;
          const wasProcessed = !!l.photo_audited_at;
          const hasGallery = (l.photos ?? []).length > 0;

          // Determine quality badge
          let quality: string;
          if (hasHero && wasProcessed) {
            quality = 'pending_approval'; // AI selected a hero — needs user approval
          } else if (wasProcessed && !hasHero && hasGallery) {
            quality = 'has_candidates'; // Photos found but no hero selected
          } else if (wasProcessed && !hasHero) {
            quality = 'no_photos'; // Processed but nothing found
          } else {
            quality = 'missing'; // Not yet processed
          }
          allResults.push(toResult(l, quality));
        }
      }

      setResults(allResults);
      setFilteredTotal(count);
      setNoHeroCount(count);
      setLoading(false);
      return;
    }

    // low_res filter is handled separately via loadLowResPage — skip here
    if (filter === 'low_res') {
      setLoading(false);
      return;
    }

    // "all" filter: show ALL touchless listings (not just AI-scanned ones).
    // Queries the listings table directly so chain-auto-approved + FastCuration-approved
    // listings are included, not just those with photo_audit_results rows.
    // "tier2_recheck": likely FALSE NEGATIVES from the 2026-06-13 "Tier-2 re-verify"
    // AI pass — is_touchless=false listings it reverted as "NOT automatic-touchless"
    // that nonetheless carry a touch-free equipment brand (WashWorld/PDQ/etc). These
    // are mixed facilities with a touch-free bay that got wrongly excluded. Fetch the
    // Tier-2-reverted set then client-filter (the crawl_notes text test isn't a clean
    // server filter) to touch-free-equipment, minus obvious tunnel/hand-wash noise,
    // so the admin can recover the real ones ("Mark Touchless & Approve").
    if (filter === 'tier2_recheck') {
      const TOUCHFREE = /washworld|pdq|petit|mark_?vii|coleman|oasis|istobal|karcher|ryko|autec|laserwash|razor/i;
      const NOISE = /\bhand\b|detail|el car wash|dirty dog|quick quack|mister car wash|tommy'?s|take 5|\bzips\b|tidal wave|whistle express|tsunami/i;
      const cands: { id: string; name: string; slug: string; city: string; state: string; hero_image: string | null; hero_image_source: string | null; photos: string[] | null; equipment_brand: string | null; equipment_model: string | null; is_approved: boolean; photo_audited_at: string | null; parent_chain: string | null; crawl_notes: string | null }[] = [];
      for (let o = 0; ; o += 1000) {
        const { data } = await supabase
          .from('listings')
          .select('id, name, slug, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain, crawl_notes')
          .eq('is_touchless', false).ilike('crawl_notes', '%Tier-2 re-verify%')
          .range(o, o + 999);
        if (!data || data.length === 0) break;
        cands.push(...(data as typeof cands));
        if (data.length < 1000) break;
      }
      const filtered = cands.filter(l =>
        /NOT automatic-touchless|left not-touchless|not automatic touchless/i.test(l.crawl_notes || '') &&
        TOUCHFREE.test(`${l.equipment_brand || ''} ${l.crawl_notes || ''}`) &&
        !NOISE.test(l.name || '')
      ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const pageRows = filtered.slice(offset, offset + PAGE_SIZE);
      const rows: AuditResult[] = pageRows.map((l) => {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        return {
          id: `t2-${l.id}`, listing_id: l.id, listing_name: l.name, listing_slug: l.slug,
          listing_city: l.city, listing_state: l.state, listing_hero: l.hero_image,
          hero_quality: hasHero ? 'has_hero' : hasGallery ? 'has_candidates' : 'missing',
          equipment_brand: l.equipment_brand, equipment_model: l.equipment_model,
          equipment_confidence: null, equipment_source_photo: null, suggested_hero_url: null,
          suggested_hero_reason: `Touch-free equipment (${l.equipment_brand}) but reverted not-touchless — likely a mixed-facility false negative`,
          photos_to_remove: [], reviewed: !!l.photo_audited_at, applied: false, created_at: '',
          raw_response: null, google_photos_added: 0, google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        } as AuditResult;
      });
      setResults(rows);
      setFilteredTotal(filtered.length);
      setLoading(false);
      return;
    }

    // "by_equipment" filter: every listing tagged with the chosen equipment brand,
    // regardless of touchless/approval status, so the admin can review + correct
    // equipment-classification errors (mine or the AI's) one maker at a time.
    if (filter === 'by_equipment') {
      if (!equipmentBrand) { setResults([]); setFilteredTotal(0); setLoading(false); return; }
      // Touchless only — reverted/not-touchless listings don't belong in the
      // curation view (the dedicated Tier-2 Recheck / Second Look tabs exist
      // for reviewing those).
      const { count: eqCount } = await supabase.from('listings')
        .select('id', { count: 'exact', head: true }).eq('equipment_brand', equipmentBrand)
        .eq(washColRef.current, true);
      const { data: eqRows } = await supabase.from('listings')
        .select('id, name, slug, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, is_touchless, photo_audited_at, parent_chain')
        .eq('equipment_brand', equipmentBrand)
        .eq(washColRef.current, true)
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      const eqResults: AuditResult[] = (eqRows ?? []).map((l) => {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        return {
          id: `eq-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_slug: l.slug,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: hasHero ? 'has_hero' : hasGallery ? 'has_candidates' : 'missing',
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: l.is_touchless ? 'Review equipment tag' : 'NOT touchless — review',
          photos_to_remove: [],
          reviewed: !!l.photo_audited_at,
          applied: false,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        } as AuditResult;
      });
      setResults(eqResults);
      setFilteredTotal(eqCount ?? 0);
      setLoading(false);
      return;
    }

    if (filter === 'all') {
      let countQuery = supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true);
      let dataQuery = supabase
        .from('listings')
        .select('id, name, slug, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq(washColRef.current, true);

      // When "Unreviewed only" is checked, hide listings already reviewed for the
      // active wash type (touchless: photo_audited_at; self-serve:
      // self_service_reviewed_at). Approving in the modal stamps that column, so
      // the listing drops out of this queue on the next load.
      if (unreviewed) {
        countQuery = countQuery.is(reviewedColRef.current, null);
        dataQuery = dataQuery.is(reviewedColRef.current, null);
      }

      // Free-text search — match the listing name or its URL slug. Supports
      // pasting a full listing URL: the last path segment is used as the slug
      // term. Strip characters that have special meaning in PostgREST's `.or()`
      // grammar (comma/parens/asterisk) so they can't break the filter.
      const rawSearch = searchQuery.trim();
      if (rawSearch) {
        const sanitize = (s: string) => s.replace(/[,()*]/g, ' ').trim();
        const nameTerm = sanitize(rawSearch);
        const slugSource = rawSearch.includes('/')
          ? (rawSearch.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? rawSearch)
          : rawSearch;
        const slugTerm = sanitize(slugSource);
        const orFilter = `name.ilike.%${nameTerm}%,slug.ilike.%${slugTerm}%`;
        countQuery = countQuery.or(orFilter);
        dataQuery = dataQuery.or(orFilter);
      }

      // Self-serve: optionally narrow to one state, and order geographically
      // (state → city → name) so whole cities/states get finished together.
      // Touchless keeps its alphabetical-by-name order.
      const selfServe = washColRef.current === 'is_self_service';
      if (selfServe) {
        // Never surface closed washes in the self-serve review queue — no reason to
        // review them (manually-closed via classification_source, or Google-closed
        // via business_status). NOT_CLOSED + the business_status .or keep listings
        // that have no closed flag (the .is.null clauses).
        countQuery = countQuery.or(NOT_CLOSED).or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)');
        dataQuery = dataQuery.or(NOT_CLOSED).or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)');
      }
      if (selfServe && stateFilterRef.current) {
        countQuery = countQuery.eq('state', stateFilterRef.current);
        dataQuery = dataQuery.eq('state', stateFilterRef.current);
      }

      const { count: totalAll } = await countQuery;
      const orderedData = selfServe
        ? dataQuery.order('state', { ascending: true }).order('city', { ascending: true }).order('name', { ascending: true })
        : dataQuery.order('name', { ascending: true });
      const { data: allListings } = await orderedData
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = [];
      for (const l of allListings ?? []) {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        let quality: string;
        if (hasHero) quality = 'has_hero';
        else if (hasGallery) quality = 'has_candidates';
        else quality = 'missing';

        allResults.push({
          id: `all-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_slug: l.slug,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: quality,
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: hasHero ? 'Has hero' : 'No hero',
          photos_to_remove: [],
          reviewed: !!l.photo_audited_at,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        });
      }

      setResults(allResults);
      setFilteredTotal(totalAll ?? 0);
      setLoading(false);
      return;
    }

    // "review" filter, SELF-SERVE scope: listings the autophoto pipeline flagged for
    // human judgment (self_service_source='autophoto_needs_human') and not yet
    // reviewed — usually thin photo sets where it found one usable bay shot but
    // couldn't build a confident hero/gallery. Touchless 'review' still falls through
    // to the photo_audit_results RPC below.
    if (filter === 'review' && washColRef.current === 'is_self_service') {
      let countQuery = supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq('is_self_service', true)
        .eq('self_service_source', 'autophoto_needs_human')
        .or(NOT_CLOSED).or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)');
      let dataQuery = supabase
        .from('listings')
        .select('id, name, slug, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq('is_self_service', true)
        .eq('self_service_source', 'autophoto_needs_human')
        .or(NOT_CLOSED).or('business_status.is.null,business_status.not.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)');
      if (stateFilterRef.current) {
        countQuery = countQuery.eq('state', stateFilterRef.current);
        dataQuery = dataQuery.eq('state', stateFilterRef.current);
      }
      const { count: totalReview } = await countQuery;
      const { data: reviewListings } = await dataQuery
        .order('state', { ascending: true }).order('city', { ascending: true }).order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = (reviewListings ?? []).map((l): AuditResult => {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        return {
          id: `ssreview-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_slug: l.slug,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: hasHero ? 'has_hero' : hasGallery ? 'has_candidates' : 'missing',
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: 'AI flagged for review — thin photo set, needs a human hero pick',
          photos_to_remove: [],
          reviewed: false,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        };
      });

      setResults(allResults);
      setFilteredTotal(totalReview ?? 0);
      setLoading(false);
      return;
    }

    // "ai_picked" filter (self-serve): the listings the AI classified AND chose a hero for,
    // that are live but no human has personally confirmed. This is the in-tool replacement
    // for the standalone spot-check contact sheet — live, and drops a listing the moment you
    // Confirm Self-Serve & Approve (that sets self_service_source='admin_review').
    if (filter === 'ai_picked') {
      let countQuery = supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq('is_self_service', true).eq('is_approved', true)
        .in('hero_image_source', AI_HERO_SOURCES)
        .neq('self_service_source', 'admin_review')
        .or(NOT_CLOSED);
      let dataQuery = supabase
        .from('listings')
        .select('id, name, slug, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain, self_serve_bay_photo')
        .eq('is_self_service', true).eq('is_approved', true)
        .in('hero_image_source', AI_HERO_SOURCES)
        .neq('self_service_source', 'admin_review')
        .or(NOT_CLOSED);
      if (stateFilterRef.current) {
        countQuery = countQuery.eq('state', stateFilterRef.current);
        dataQuery = dataQuery.eq('state', stateFilterRef.current);
      }
      const { count: totalAiPicked } = await countQuery;
      const { data: aiListings } = await dataQuery
        // No-bay-proof first (the real defect: claims self-serve, shows no proof), then by place.
        .order('self_serve_bay_photo', { ascending: true, nullsFirst: false })
        .order('state', { ascending: true }).order('city', { ascending: true }).order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = (aiListings ?? []).map((l): AuditResult => {
        const hasHero = !!l.hero_image;
        const noBay = (l as { self_serve_bay_photo?: boolean | null }).self_serve_bay_photo === false;
        return {
          id: `aipicked-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_slug: l.slug,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: hasHero ? 'has_hero' : 'missing',
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: noBay
            ? '⚠ AI-picked hero, and NO photo shows a self-serve bay — confirm it really is self-serve'
            : 'AI picked this hero — confirm it looks right, or swap it',
          photos_to_remove: [],
          reviewed: false,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        };
      });

      setResults(allResults);
      setFilteredTotal(totalAiPicked ?? 0);
      setLoading(false);
      return;
    }

    // "unscanned" filter: touchless listings never touched by the AI photo auditor.
    // Shows listings where photo_audited_at IS NULL so the admin can manually curate
    // them without ever invoking paid Claude API calls.
    if (filter === 'unscanned') {
      const { count: totalUnscanned } = await supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).is(reviewedColRef.current, null)
        .or(NOT_CLOSED);

      const { data: unscannedListings } = await supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq(washColRef.current, true).is(reviewedColRef.current, null)
        .or(NOT_CLOSED)
        // Prioritize: no hero first (need the most attention), then alphabetical
        .order('hero_image', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = [];
      for (const l of unscannedListings ?? []) {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        let quality: string;
        if (hasHero) quality = 'has_hero_unscanned';
        else if (hasGallery) quality = 'has_candidates';
        else quality = 'missing';

        allResults.push({
          id: `unscanned-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: quality,
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: hasHero ? 'Has hero — unscanned' : hasGallery ? 'Has photo candidates — unscanned' : 'No hero yet — unscanned',
          photos_to_remove: [],
          reviewed: false,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        });
      }

      setResults(allResults);
      setFilteredTotal(totalUnscanned ?? 0);
      setLoading(false);
      return;
    }

    // "no_evidence" filter: listings flagged touchless_verified='user_review'
    // (the "User Verified" badge) that have NO touchless review snippet behind the
    // flag — the badge is unbacked. One-at-a-time queue to confirm the wash really
    // is touchless or demote it. Approve & Next stamps photo_audited_at, which drops
    // the listing from this queue (we only show photo_audited_at IS NULL here).
    // The "no snippet" test can't be a server-side filter (NOT EXISTS), so we fetch
    // the candidate set first, then exclude any id that has a touchless-evidence
    // snippet (chunked .in() to stay under the URL-length limit).
    if (filter === 'no_evidence') {
      // Loosely typed to match the other filter blocks (Supabase select results),
      // so null DB fields coerce into the AuditResult shape the same way.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidates: any[] = [];
      for (let o = 0; ; o += 1000) {
        const { data } = await supabase
          .from('listings')
          .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
          .eq(washColRef.current, true)
          .eq('touchless_verified', 'user_review').is('photo_audited_at', null)
          .or(NOT_CLOSED)
          .order('name', { ascending: true })
          .range(o, o + 999);
        if (!data || data.length === 0) break;
        candidates.push(...data);
        if (data.length < 1000) break;
      }
      const haveEvidence = new Set<string>();
      const ids = candidates.map(l => l.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase
          .from('review_snippets')
          .select('listing_id')
          .eq('is_touchless_evidence', true)
          .in('listing_id', ids.slice(i, i + 100));
        (data ?? []).forEach(s => haveEvidence.add(s.listing_id as string));
      }
      const noEvidence = candidates.filter(l => !haveEvidence.has(l.id));
      const pageRows = noEvidence.slice(offset, offset + PAGE_SIZE);

      const allResults: AuditResult[] = pageRows.map((l): AuditResult => {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        return {
          id: `noev-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: hasHero ? 'has_hero' : hasGallery ? 'has_candidates' : 'missing',
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: '"User Verified" badge with no touchless review snippet — confirm touchless or demote',
          photos_to_remove: [],
          reviewed: false,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
        };
      });

      setResults(allResults);
      setFilteredTotal(noEvidence.length);
      setLoading(false);
      return;
    }

    // "held" filter: touchless listings that are not yet approved — one-at-a-time
    // review queue for the admin to add heroes and release holds.
    if (filter === 'held') {
      const { count: totalHeld } = await supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true).eq('is_approved', false)
        .or(NOT_CLOSED);

      const { data: heldListings } = await supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain, classification_source')
        .eq(washColRef.current, true).eq('is_approved', false)
        .or(NOT_CLOSED)
        // Prioritize: no hero first (they need the most attention), then oldest-touched
        .order('hero_image', { ascending: true, nullsFirst: true })
        .order('photo_audited_at', { ascending: true, nullsFirst: true })
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = [];
      for (const l of heldListings ?? []) {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        let quality: string;
        if (hasHero) quality = 'has_hero_needs_approval';
        else if (hasGallery) quality = 'has_candidates';
        else quality = 'missing';

        allResults.push({
          id: `held-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: quality,
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: hasHero ? 'Has hero — ready to approve' : hasGallery ? 'Has photo candidates' : 'Needs hero — add via Google Photos / Street View / Upload',
          photos_to_remove: [],
          reviewed: false,
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: l.parent_chain ?? null,
          listing_classification_source: (l as { classification_source?: string | null }).classification_source ?? null,
        });
      }

      setResults(allResults);
      setFilteredTotal(totalHeld ?? 0);
      setLoading(false);
      return;
    }

    // "second_look" filter: independent (non-chain) listings reverted by
    // the Apr 19 mass-restore that didn't have strong enough touchless
    // signals to re-promote automatically (and weren't already audit-
    // confirmed as correctly demoted). Manual review queue — admin
    // grinds through these to find missed touchless listings.
    if (filter === 'second_look') {
      const { count: totalSecondLook } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', false)
        .eq('is_approved', false)
        .is('parent_chain', null)
        .ilike('crawl_notes', '%mass-restore%')
        .not('crawl_notes', 'ilike', '%re-audit confirmed correctly demoted%');

      // Order: prioritize listings with the most customer evidence first
      // (rating + reviews → more likely to be a real, trafficked business
      // worth re-evaluating). Listings with zero data sink to the bottom.
      const { data: rows } = await supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain, classification_source, rating, review_count, touchless_evidence')
        .eq('is_touchless', false)
        .eq('is_approved', false)
        .is('parent_chain', null)
        .ilike('crawl_notes', '%mass-restore%')
        .not('crawl_notes', 'ilike', '%re-audit confirmed correctly demoted%')
        .order('review_count', { ascending: false, nullsFirst: false })
        .order('rating', { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);

      const allResults: AuditResult[] = [];
      for (const l of rows ?? []) {
        const hasHero = !!l.hero_image;
        const hasGallery = (l.photos ?? []).length > 0;
        const quality = hasHero ? 'has_hero_needs_approval' : (hasGallery ? 'has_candidates' : 'missing');
        allResults.push({
          id: `secondlook-${l.id}`,
          listing_id: l.id,
          listing_name: l.name,
          listing_city: l.city,
          listing_state: l.state,
          listing_hero: l.hero_image,
          hero_quality: quality,
          equipment_brand: l.equipment_brand,
          equipment_model: l.equipment_model,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: l.touchless_evidence ?? 'No evidence on file — verify manually',
          photos_to_remove: [],
          reviewed: false,
          applied: false,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: null,
          listing_classification_source: (l as { classification_source?: string | null }).classification_source ?? null,
        });
      }

      setResults(allResults);
      setFilteredTotal(totalSecondLook ?? 0);
      setLoading(false);
      return;
    }

    // "best_of" filter: every Best-Of trophy winner (top-3 rank in any metro).
    // Manual hero-quality review queue — these are the listings the public
    // badge + outreach link to, so their heroes must be high quality.
    if (filter === 'best_of') {
      const trophies = await fetchTrophyListings();
      // Hero-review status for the whole winner set so counts + pagination are
      // correct (not just the current page).
      const reviewedSet = await getBestOfReviewedSet(trophies.map(t => t.listing_id));
      setBestOfTotal(trophies.length);
      setBestOfReviewedCount(reviewedSet.size);
      setBestOfCount(trophies.length - reviewedSet.size);

      const sub = bestOfSubFilter;
      const filtered = sub === 'to_review'
        ? trophies.filter(t => !reviewedSet.has(t.listing_id))
        : sub === 'reviewed'
          ? trophies.filter(t => reviewedSet.has(t.listing_id))
          : trophies;

      const pageSlice = filtered.slice(offset, offset + PAGE_SIZE);
      const ids = pageSlice.map(t => t.listing_id);

      const byId = new Map<string, Record<string, unknown>>();
      if (ids.length) {
        const { data: listings } = await supabase
          .from('listings')
          .select('id, name, slug, city, state, hero_image, hero_image_source, hero_is_low_res, photos, equipment_brand, equipment_model, parent_chain')
          .in('id', ids);
        for (const l of listings ?? []) byId.set(l.id as string, l as Record<string, unknown>);
      }

      const allResults: AuditResult[] = [];
      for (const t of pageSlice) {
        const l = byId.get(t.listing_id);
        if (!l) continue;
        const hasHero = !!l.hero_image;
        const lowRes = !!l.hero_is_low_res;
        // Quality signal drives the row's warning pill: no hero or low-res =
        // needs attention; otherwise it reads as good until manually checked.
        const quality = !hasHero ? 'missing' : lowRes ? 'poor' : 'good';
        allResults.push({
          id: `bestof-${t.listing_id}`,
          listing_id: t.listing_id,
          listing_name: l.name as string,
          listing_slug: l.slug as string,
          listing_city: l.city as string,
          listing_state: l.state as string,
          listing_hero: (l.hero_image as string) ?? null,
          hero_quality: quality,
          equipment_brand: (l.equipment_brand as string) ?? null,
          equipment_model: (l.equipment_model as string) ?? null,
          equipment_confidence: null,
          equipment_source_photo: null,
          suggested_hero_url: null,
          suggested_hero_reason: t.labels.join(' · '),
          photos_to_remove: [],
          reviewed: reviewedSet.has(t.listing_id),
          applied: hasHero,
          created_at: '',
          raw_response: null,
          google_photos_added: 0,
          google_photos_screened: 0,
          listing_parent_chain: (l.parent_chain as string) ?? null,
          best_of_rank: t.bestRank,
          best_of_labels: t.labels,
        });
      }

      setResults(allResults);
      setFilteredTotal(filtered.length);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_photo_audit_page', {
      p_filter: filter,
      p_offset: offset,
      p_limit: PAGE_SIZE,
      p_unreviewed_only: unreviewed,
    });

    if (error) {
      console.error('Error loading audit page:', error);
      setLoading(false);
      return;
    }

    if (data) {
      const pageData = data as { total: number; results: AuditResult[] };
      // Ensure photos_to_remove is always an array
      const enriched = (pageData.results ?? []).map((r: AuditResult) => ({
        ...r,
        photos_to_remove: r.photos_to_remove ?? [],
      }));
      setResults(enriched);
      setFilteredTotal(pageData.total ?? 0);
    }
    setLoading(false);
  }, [noHeroSubFilter, searchQuery, fetchTrophyListings, getBestOfReviewedSet, bestOfSubFilter, equipmentBrand]);

  const LOW_RES_PAGE_SIZE = 50;

  const loadLowResPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const offset = (pageNum - 1) * LOW_RES_PAGE_SIZE;
    const { data, error } = await supabase.rpc('get_low_res_listings', {
      p_offset: offset,
      p_limit: LOW_RES_PAGE_SIZE,
    });
    if (!error && data) {
      const result = data as { total: number; results: LowResListing[] };
      setLowResListings(result.results ?? []);
      setLowResTotal(result.total ?? 0);
    }
    setLoading(false);
  }, []);

  const changeLowResPage = useCallback((pageNum: number) => {
    setLowResPage(pageNum);
  }, []);

  // Dismiss a single listing from the Low Res tab (marks it as not-low-res so it disappears)
  const dismissLowRes = useCallback(async (listingId: string) => {
    await supabase.from('listings').update({ hero_is_low_res: false }).eq('id', listingId);
    setLowResListings(prev => prev.filter(l => l.id !== listingId));
    setLowResTotal(prev => Math.max(0, prev - 1));
    await loadStats();
  }, [loadStats]);

  const scanForLowRes = useCallback(async () => {
    setScanProgress('Counting unscanned listings...');
    const BATCH = 50;
    let scanned = 0;
    let lowResFound = 0;

    const { count } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq(washColRef.current, true)
      .not('hero_image', 'is', null)
      .neq('hero_image_source', 'chain_brand')
      .is('hero_is_low_res', null);

    let total = count ?? 0;

    if (total === 0) {
      // All already scanned — reset flags so we can do a fresh re-scan
      setScanProgress('Resetting scan flags for re-scan...');
      await supabase
        .from('listings')
        .update({ hero_is_low_res: null })
        .eq(washColRef.current, true)
        .not('hero_image', 'is', null)
        .neq('hero_image_source', 'chain_brand');

      const { count: freshCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq(washColRef.current, true)
        .not('hero_image', 'is', null)
        .neq('hero_image_source', 'chain_brand')
        .is('hero_is_low_res', null);

      total = freshCount ?? 0;
      if (total === 0) {
        setScanProgress('No listings to scan.');
        return;
      }
    }

    setScanProgress(`Scanning 0 / ${total} listings...`);

    while (true) {
      const { data } = await supabase
        .from('listings')
        .select('id, hero_image')
        .eq(washColRef.current, true)
        .not('hero_image', 'is', null)
        .neq('hero_image_source', 'chain_brand')
        .is('hero_is_low_res', null)
        .limit(BATCH);

      if (!data || data.length === 0) break;

      await Promise.all(data.map(async (listing) => {
        const isLowRes = await checkImageDimensions(listing.hero_image as string);
        await supabase.from('listings').update({ hero_is_low_res: isLowRes }).eq('id', listing.id);
        scanned++;
        if (isLowRes) lowResFound++;
      }));

      setScanProgress(`Scanning ${scanned} / ${total} listings... (${lowResFound} low-res found)`);

      if (data.length < BATCH) break;
    }

    setScanProgress(`Scan complete! ${lowResFound} low-res heroes found out of ${scanned} scanned.`);
    await loadLowResPage(1);
    setLowResPage(1);
    await loadStats();
  }, [loadLowResPage, loadStats]);

  // Combined load: stats + current page + queue stats
  const loadResults = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadPage(viewFilter, page, unreviewedOnly),
      loadQueueStats(),
    ]);
  }, [loadStats, loadPage, loadQueueStats, viewFilter, page, unreviewedOnly]);

  // Reload just the current page (after an action like apply/reject)
  const reloadCurrentPage = useCallback(async () => {
    await Promise.all([
      loadStats(),
      loadPage(viewFilter, page, unreviewedOnly),
    ]);
  }, [loadStats, loadPage, viewFilter, page, unreviewedOnly]);

  // Change filter and reset to page 1
  const changeFilter = useCallback((filter: ViewFilter) => {
    setViewFilter(filter);
    setPage(1);
  }, []);

  // Change page
  const changePage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Load page when filter, page, or unreviewedOnly changes
  useEffect(() => {
    if (viewFilter !== 'low_res') {
      loadPage(viewFilter, page, unreviewedOnly);
    }
  }, [viewFilter, page, unreviewedOnly, loadPage, washType, stateFilter]);

  // Self-serve: compute per-state counts of the remaining (unreviewed) queue so the
  // state picker can show the densest states first. Runs when entering self-serve.
  useEffect(() => {
    if (washType !== 'self_serve') { setSelfServeStateCounts([]); return; }
    let cancelled = false;
    (async () => {
      const tally: Record<string, number> = {};
      let from = 0;
      while (true) {
        const { data } = await supabase.from('listings').select('state')
          .eq('is_self_service', true).is('self_service_reviewed_at', null)
          .order('id').range(from, from + 999);
        if (!data || !data.length) break;
        data.forEach(r => { const s = (r as { state: string | null }).state || '—'; tally[s] = (tally[s] || 0) + 1; });
        from += data.length;
        if (data.length < 1000) break;
      }
      if (!cancelled) setSelfServeStateCounts(Object.entries(tally).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count));
    })();
    return () => { cancelled = true; };
  }, [washType]);

  // Reset any state filter when leaving self-serve mode.
  useEffect(() => { if (washType !== 'self_serve') setStateFilter(''); }, [washType]);
  // Jump back to the first page whenever the state filter changes.
  useEffect(() => { setPage(1); }, [stateFilter]);

  // Load the distinct equipment brands (+ counts) for the review dropdown, once.
  useEffect(() => {
    (async () => {
      const tally = new Map<string, number>();
      for (let o = 0; ; o += 1000) {
        const { data } = await supabase.from('listings').select('equipment_brand')
          .not('equipment_brand', 'is', null).range(o, o + 999);
        if (!data || data.length === 0) break;
        for (const r of data) { const b = r.equipment_brand as string; if (b) tally.set(b, (tally.get(b) ?? 0) + 1); }
        if (data.length < 1000) break;
      }
      setEquipmentBrands(Array.from(tally, ([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count));
    })();
  }, []);

  // Load low-res page when tab is active or page changes
  useEffect(() => {
    if (viewFilter === 'low_res') {
      loadLowResPage(lowResPage);
    }
  }, [viewFilter, lowResPage, loadLowResPage]);

  // ─── Job polling ──────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const formatJobProgress = useCallback((job: BatchJob) => {
    const pct = job.total_requested > 0
      ? Math.round((job.total_processed / job.total_requested) * 100)
      : 0;
    const statusLabel = job.status === 'running'
      ? `Processing... ${job.total_processed} / ${job.total_requested} (${pct}%)`
      : job.status === 'completed'
        ? `Done! Processed ${job.total_processed} listings.`
        : `Failed: ${job.error_message ?? 'Unknown error'}`;

    const details = [
      job.equipment_detected > 0 ? `Equipment: ${job.equipment_detected}` : null,
      job.heroes_replaced > 0 ? `Heroes replaced: ${job.heroes_replaced}` : null,
      job.photos_removed > 0 ? `Photos removed: ${job.photos_removed}` : null,
      job.auto_applied > 0 ? `Auto-applied: ${job.auto_applied}` : null,
      job.google_photos_added > 0 ? `Google photos: +${job.google_photos_added}` : null,
    ].filter(Boolean).join('. ');

    return details ? `${statusLabel} ${details}.` : statusLabel;
  }, []);

  const continueJob = useCallback(async (jobId: string) => {
    if (continuingRef.current) return;
    continuingRef.current = true;
    try {
      const res = await fetch('/api/admin/batch-photo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json().catch(() => null);
      if (data) {
        console.log(`[ContinueJob] Response:`, data);
      }
    } catch (err) {
      console.error('[ContinueJob] Error:', err);
    } finally {
      continuingRef.current = false;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const { data } = await supabase
      .from('batch_audit_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (!data) return;
    const job = data as BatchJob;
    setActiveJob(job);
    setRunProgress(formatJobProgress(job));

    await loadQueueStats();

    if (job.status === 'completed' || job.status === 'failed') {
      setRunning(false);
      stopPolling();
      await loadResults();
    } else if (job.status === 'running') {
      // For No Hero mode, reload results on each poll so new listings appear immediately
      if (viewFilter === 'no_hero' && job.total_processed > 0) {
        await loadPage('no_hero', page, unreviewedOnly);
      }
      if (job.total_processed < job.total_requested && !continuingRef.current) {
        const updatedAt = new Date(job.updated_at).getTime();
        const createdAt = new Date(job.created_at).getTime();
        const now = Date.now();
        const timeSinceUpdate = now - updatedAt;
        const isNewJob = Math.abs(updatedAt - createdAt) < 2000 && job.total_processed === 0;
        if (isNewJob || timeSinceUpdate > 8000) {
          console.log(`[Poll] Job ${jobId}: ${job.total_processed}/${job.total_requested} — triggering next chunk`);
          continueJob(jobId);
        }
      }
    }
  }, [continueJob, formatJobProgress, loadQueueStats, loadResults, loadPage, viewFilter, page, unreviewedOnly, stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    pollJob(jobId);
    pollRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL);
  }, [pollJob, stopPolling]);

  // Check for any running jobs on mount
  useEffect(() => {
    const checkRunningJobs = async () => {
      const { data } = await supabase
        .from('batch_audit_jobs')
        .select('*')
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const job = data[0] as BatchJob;
        setActiveJob(job);
        setRunning(true);
        setRunProgress(formatJobProgress(job));
        startPolling(job.id);
      }
    };
    checkRunningJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Initial load of stats and queue stats
  useEffect(() => {
    loadStats();
    loadQueueStats();
    // Prime the trophy-winner counts so the Best-Of tab shows the remaining-to-
    // review number before it's clicked. Caches, so opening the tab is instant.
    refreshBestOfCounts().catch(() => {});
  }, [loadStats, loadQueueStats, refreshBestOfCounts, washType, stateFilter]);

  // ─── Run batch (creates a server-side job) ────────────────────

  const runBatch = useCallback(async (limit: number, dryRun: boolean, includeGoogle: boolean) => {
    setRunning(true);
    const isNoHero = viewFilter === 'no_hero';
    const isManualReview = !isNoHero && !includeGoogle;
    setRunProgress(`Starting batch job (${limit} listings, ${isNoHero ? 'NO HERO MODE' : isManualReview ? 'MANUAL REVIEW — no AI' : dryRun ? 'DRY RUN' : 'LIVE'})...`);

    try {
      // Use the server-side proxy route to avoid client-side JWT auth issues.
      // The proxy runs on Netlify (server) and uses the service role key directly,
      // so expired Supabase sessions can no longer cause 401s.
      const res = await fetch('/api/admin/batch-photo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_requested: limit,
          dry_run: dryRun,
          include_google_photos: false, // Google Places API disabled — no paid photo fetching
          no_hero_mode: isNoHero,
          // manual_review: no Google photos + not no_hero mode → queue all listings, no AI, no auto-apply
          manual_review: !isNoHero && !includeGoogle,
        }),
      });

      if (!res.ok && res.status === 401) {
        setRunProgress('Error: Authentication failed (401) — please sign out and sign back in to refresh your session.');
        setRunning(false);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setRunProgress(`Error: ${data.error}`);
        setRunning(false);
        return;
      }

      if (data.job_id) {
        setRunProgress(`Job started! Processing ${limit} listings in the background...`);
        startPolling(data.job_id);
      } else {
        setRunProgress(`Done! Processed ${data.listings_processed ?? 0} listings.`);
        setRunning(false);
        await loadResults();
      }
    } catch (err) {
      setRunProgress(`Error: ${(err as Error).message}`);
      setRunning(false);
    }
  }, [loadResults, startPolling, viewFilter]);

  const applyEquipment = useCallback(async (auditId: string, listingId: string, brand: string, model: string | null) => {
    await supabase
      .from('listings')
      .update({ equipment_brand: brand, equipment_model: model })
      .eq('id', listingId);

    await supabase
      .from('photo_audit_results')
      .update({ applied: true, reviewed: true })
      .eq('id', auditId);

    // Update local state optimistically
    setResults(prev => prev.map(r => r.id === auditId ? { ...r, applied: true, reviewed: true } : r));
    // Refresh stats in background
    loadStats();
  }, [loadStats]);

  const rejectResult = useCallback(async (auditId: string) => {
    await supabase
      .from('photo_audit_results')
      .update({ reviewed: true })
      .eq('id', auditId);

    setResults(prev => prev.map(r => r.id === auditId ? { ...r, reviewed: true } : r));
    loadStats();
  }, [loadStats]);

  const applyAllHighConfidence = useCallback(async () => {
    const highConf = results.filter(
      r => r.equipment_brand && r.equipment_confidence === 'high' && !r.applied && !r.reviewed
    );

    for (const r of highConf) {
      await applyEquipment(r.id, r.listing_id, r.equipment_brand!, r.equipment_model);
    }

    await reloadCurrentPage();
  }, [results, applyEquipment, reloadCurrentPage]);

  const undoApply = useCallback(async (auditId: string, listingId: string) => {
    await supabase
      .from('listings')
      .update({ equipment_brand: null, equipment_model: null })
      .eq('id', listingId);

    await supabase
      .from('photo_audit_results')
      .update({ applied: false, reviewed: false })
      .eq('id', auditId);

    setResults(prev => prev.map(r => r.id === auditId ? { ...r, applied: false, reviewed: false } : r));
    loadStats();
  }, [loadStats]);

  // Mark a Best-Of winner as hero-reviewed this pass. Persists via
  // best_of_hero_reviewed_at so it stays out of the "To Review" queue after a
  // refresh, removes it from the current list, and decrements the counters.
  const markBestOfReviewed = useCallback(async (listingId: string) => {
    await supabase.from('listings')
      .update({ best_of_hero_reviewed_at: new Date().toISOString() })
      .eq('id', listingId);
    if (bestOfSubFilter !== 'reviewed') {
      setResults(prev => prev.filter(r => r.listing_id !== listingId));
      setFilteredTotal(prev => Math.max(0, prev - 1));
    } else {
      setResults(prev => prev.map(r => r.listing_id === listingId ? { ...r, reviewed: true } : r));
    }
    setBestOfCount(prev => Math.max(0, prev - 1));
    setBestOfReviewedCount(prev => prev + 1);
  }, [bestOfSubFilter]);

  // Undo a Best-Of review mark (returns the winner to the "To Review" queue).
  const unmarkBestOfReviewed = useCallback(async (listingId: string) => {
    await supabase.from('listings')
      .update({ best_of_hero_reviewed_at: null })
      .eq('id', listingId);
    if (bestOfSubFilter === 'reviewed') {
      setResults(prev => prev.filter(r => r.listing_id !== listingId));
      setFilteredTotal(prev => Math.max(0, prev - 1));
    } else {
      setResults(prev => prev.map(r => r.listing_id === listingId ? { ...r, reviewed: false } : r));
    }
    setBestOfCount(prev => prev + 1);
    setBestOfReviewedCount(prev => Math.max(0, prev - 1));
  }, [bestOfSubFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  return {
    results,
    loading,
    running,
    runProgress,
    includeGooglePhotos,
    setIncludeGooglePhotos,
    stats,
    queueStats,
    activeJob,
    washType,
    setWashType,
    stateFilter,
    setStateFilter,
    selfServeStateCounts,
    viewFilter,
    unreviewedOnly,
    setUnreviewedOnly,
    searchQuery,
    setSearch: (q: string) => {
      setSearchQuery(q);
      setPage(1);
    },
    page,
    filteredTotal,
    totalPages,
    pageSize: PAGE_SIZE,
    changeFilter,
    changePage,
    runBatch,
    applyEquipment,
    rejectResult,
    applyAllHighConfidence,
    undoApply,
    reload: loadResults,
    noHeroCount,
    noHeroUnprocessed,
    heldCount,
    secondLookCount,
    aiPickedCount,
    bestOfCount,
    bestOfReviewedCount,
    bestOfTotal,
    bestOfSubFilter,
    setBestOfSubFilter: (sub: 'to_review' | 'reviewed' | 'all') => {
      setBestOfSubFilter(sub);
      setPage(1);
    },
    markBestOfReviewed,
    unmarkBestOfReviewed,
    // No Hero tab sub-filter ('all' | 'non_chain' | 'chain_only')
    noHeroSubFilter,
    setNoHeroSubFilter: (sub: 'all' | 'non_chain' | 'chain_only') => {
      setNoHeroSubFilter(sub);
      setPage(1);
    },
    // Equipment-brand review filter (dropdown of makers + counts)
    equipmentBrand,
    equipmentBrands,
    setEquipmentBrand: (brand: string) => {
      setEquipmentBrandState(brand);
      setViewFilter(brand ? 'by_equipment' : 'all');
      setPage(1);
    },
    // Bulk-mark all chain listings in the current No Hero query as audited
    // (they render from CHAIN_BRAND_IMAGES so no hero curation is needed).
    markAllChainListingsAudited: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase.from('listings')
        .select('id')
        .eq(washColRef.current, true).eq('is_approved', true).is('hero_image', null)
        .not('parent_chain', 'is', null)
        .limit(5000);
      const ids = (data ?? []).map(r => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('listings').update({ photo_audited_at: now, reviewed_at: now, hero_image_source: 'chain-brand' }).in('id', ids.slice(i, i + 100));
      }
      await loadQueueStats();
      await loadPage(viewFilter, page, unreviewedOnly);
      return ids.length;
    },
    // Remove a listing from results by listing_id (used when approving from editor)
    removeFromResults: (listingId: string) => {
      setResults(prev => prev.filter(r => r.listing_id !== listingId));
      setFilteredTotal(prev => Math.max(0, prev - 1));
      setNoHeroCount(prev => Math.max(0, prev - 1));
      setHeldCount(prev => Math.max(0, prev - 1));
    },
    // Low Res tab
    lowResListings,
    lowResTotal,
    lowResPage,
    lowResTotalPages: Math.max(1, Math.ceil(lowResTotal / 50)),
    changeLowResPage,
    dismissLowRes,
    scanForLowRes,
    scanProgress,
  };
}
