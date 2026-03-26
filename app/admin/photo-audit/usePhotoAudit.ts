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
}

export type ViewFilter = 'all' | 'review' | 'equipment' | 'heroes' | 'cleanup' | 'no_hero';

const POLL_INTERVAL = 5000; // 5 seconds
const PAGE_SIZE = 25;

export function usePhotoAudit() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState('');
  const [includeGooglePhotos, setIncludeGooglePhotos] = useState(true);
  const [stats, setStats] = useState<AuditStats>({
    total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0,
    needs_review: 0, equipment_total: 0, heroes_total: 0, cleanup_total: 0,
  });
  const [queueStats, setQueueStats] = useState({ totalUntagged: 0, alreadyAudited: 0, remaining: 0 });
  const [activeJob, setActiveJob] = useState<BatchJob | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [noHeroCount, setNoHeroCount] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuingRef = useRef(false);

  const [noHeroUnprocessed, setNoHeroUnprocessed] = useState(0);

  const loadQueueStats = useCallback(async () => {
    const [totalRes, auditedRes, noHeroRes, noHeroUnprocessedRes] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).not('hero_image', 'is', null),
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).not('hero_image', 'is', null).not('photo_audited_at', 'is', null),
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).is('hero_image', null),
      // Count only unprocessed No Hero listings (for Run All button)
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('is_touchless', true).is('hero_image', null).is('photo_audited_at', null),
    ]);

    const total = totalRes.count ?? 0;
    const audited = auditedRes.count ?? 0;
    setNoHeroCount(noHeroRes.count ?? 0);
    setNoHeroUnprocessed(noHeroUnprocessedRes.count ?? 0);
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

  // Load a single page of results using the server-side RPC
  const loadPage = useCallback(async (filter: ViewFilter, pageNum: number, unreviewed: boolean = false) => {
    setLoading(true);
    const offset = (pageNum - 1) * PAGE_SIZE;

    // Special handling for "no_hero" filter — shows:
    // 1. Listings with no hero image (need processing)
    // 2. Listings with AI-selected hero awaiting approval (photo_audited_at set, is_approved not true, hero_image_source = 'google')
    if (filter === 'no_hero') {
      // Count: touchless listings that either have no hero OR have an unapproved AI-selected hero
      const [noHeroCountRes, pendingApprovalRes] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true).is('hero_image', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true).not('hero_image', 'is', null)
          .eq('hero_image_source', 'google')
          .not('photo_audited_at', 'is', null)
          .or('is_approved.is.null,is_approved.eq.false'),
      ]);
      const totalNoHero = (noHeroCountRes.count ?? 0) + (pendingApprovalRes.count ?? 0);

      // Fetch both groups and merge
      const [noHeroListings, pendingListings] = await Promise.all([
        supabase.from('listings')
          .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at')
          .eq('is_touchless', true).is('hero_image', null)
          .order('photo_audited_at', { ascending: false, nullsFirst: false })
          .limit(PAGE_SIZE),
        supabase.from('listings')
          .select('id, name, city, state, hero_image, hero_image_source, photos, equipment_brand, equipment_model, is_approved, photo_audited_at')
          .eq('is_touchless', true).not('hero_image', 'is', null)
          .eq('hero_image_source', 'google')
          .not('photo_audited_at', 'is', null)
          .or('is_approved.is.null,is_approved.eq.false')
          .order('photo_audited_at', { ascending: false })
          .limit(PAGE_SIZE),
      ]);

      // Merge: pending approval first, then no hero
      const allListings = [
        ...(pendingListings.data ?? []),
        ...(noHeroListings.data ?? []),
      ].slice(offset, offset + PAGE_SIZE);
      const listings = allListings;

      const count = totalNoHero;

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
  }, []);

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
    loadPage(viewFilter, page, unreviewedOnly);
  }, [viewFilter, page, unreviewedOnly, loadPage]);

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/batch-photo-audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
    setRunProgress(`Starting batch job (${limit} listings, ${isNoHero ? 'NO HERO MODE' : dryRun ? 'DRY RUN' : 'LIVE'})...`);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/batch-photo-audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          total_requested: limit,
          dry_run: dryRun,
          include_google_photos: isNoHero ? true : includeGoogle,
          no_hero_mode: isNoHero,
        }),
      });

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
    // Remove a listing from results by listing_id (used when approving from editor)
    removeFromResults: (listingId: string) => {
      setResults(prev => prev.filter(r => r.listing_id !== listingId));
      setFilteredTotal(prev => Math.max(0, prev - 1));
      setNoHeroCount(prev => Math.max(0, prev - 1));
    },
  };
}
