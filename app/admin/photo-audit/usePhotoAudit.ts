'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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

export type ViewFilter = 'all' | 'review' | 'equipment' | 'heroes' | 'cleanup' | 'no_hero' | 'low_res' | 'held' | 'unscanned' | 'second_look';

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
  // Sub-filter for the "No Hero" tab — 'all' shows every listing with null hero_image,
  // 'non_chain' hides chain listings (they render a brand image so admin doesn't need
  // to curate them), 'chain_only' shows just chain listings.
  const [noHeroSubFilter, setNoHeroSubFilter] = useState<'all' | 'non_chain' | 'chain_only'>('non_chain');
  const [page, setPage] = useState(1);
  const [noHeroCount, setNoHeroCount] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [heldCount, setHeldCount] = useState(0);
  const [secondLookCount, setSecondLookCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuingRef = useRef(false);

  const [noHeroUnprocessed, setNoHeroUnprocessed] = useState(0);

  const loadQueueStats = useCallback(async () => {
    const [totalRes, auditedRes, noHeroRes, noHeroUnprocessedRes, heldRes, secondLookRes] = await Promise.all([
      // Total = ALL touchless listings (including chain brand locations with null hero_image)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true),
      // Audited = all touchless listings that have been photo_audited (any hero state)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).not('photo_audited_at', 'is', null),
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).is('hero_image', null),
      // Count only unprocessed No Hero listings (for Run All button)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).is('hero_image', null).is('photo_audited_at', null),
      // Held = touchless + not approved (admin review queue)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).eq('is_approved', false),
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
      setStats(data as AuditStats);
    }
  }, []);

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

      let countQuery = supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).eq('is_approved', true).is('hero_image', null);
      let dataQuery = supabase.from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq('is_touchless', true).eq('is_approved', true).is('hero_image', null);

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
    if (filter === 'all') {
      let countQuery = supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true);
      let dataQuery = supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq('is_touchless', true);

      // When "Unreviewed only" is checked, hide listings that have already been
      // photo_audited (either by AI batch or manual FastCuration approval stamp).
      if (unreviewed) {
        countQuery = countQuery.is('photo_audited_at', null);
        dataQuery = dataQuery.is('photo_audited_at', null);
      }

      const { count: totalAll } = await countQuery;
      const { data: allListings } = await dataQuery
        .order('name', { ascending: true })
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

    // "unscanned" filter: touchless listings never touched by the AI photo auditor.
    // Shows listings where photo_audited_at IS NULL so the admin can manually curate
    // them without ever invoking paid Claude API calls.
    if (filter === 'unscanned') {
      const { count: totalUnscanned } = await supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).is('photo_audited_at', null);

      const { data: unscannedListings } = await supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain')
        .eq('is_touchless', true).is('photo_audited_at', null)
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

    // "held" filter: touchless listings that are not yet approved — one-at-a-time
    // review queue for the admin to add heroes and release holds.
    if (filter === 'held') {
      const { count: totalHeld } = await supabase
        .from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).eq('is_approved', false);

      const { data: heldListings } = await supabase
        .from('listings')
        .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at, parent_chain, classification_source')
        .eq('is_touchless', true).eq('is_approved', false)
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
  }, [noHeroSubFilter]);

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
      .eq('is_touchless', true)
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
        .eq('is_touchless', true)
        .not('hero_image', 'is', null)
        .neq('hero_image_source', 'chain_brand');

      const { count: freshCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
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
        .eq('is_touchless', true)
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
  }, [viewFilter, page, unreviewedOnly, loadPage]);

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
  }, [loadStats, loadQueueStats]);

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
    viewFilter,
    unreviewedOnly,
    setUnreviewedOnly,
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
    // No Hero tab sub-filter ('all' | 'non_chain' | 'chain_only')
    noHeroSubFilter,
    setNoHeroSubFilter: (sub: 'all' | 'non_chain' | 'chain_only') => {
      setNoHeroSubFilter(sub);
      setPage(1);
    },
    // Bulk-mark all chain listings in the current No Hero query as audited
    // (they render from CHAIN_BRAND_IMAGES so no hero curation is needed).
    markAllChainListingsAudited: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase.from('listings')
        .select('id')
        .eq('is_touchless', true).eq('is_approved', true).is('hero_image', null)
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
