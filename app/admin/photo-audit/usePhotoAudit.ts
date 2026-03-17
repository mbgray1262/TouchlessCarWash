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

type Tab = 'equipment' | 'heroes' | 'cleanup';

const POLL_INTERVAL = 5000; // 5 seconds

export function usePhotoAudit() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('equipment');
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState('');
  const [includeGooglePhotos, setIncludeGooglePhotos] = useState(true);
  const [stats, setStats] = useState({ total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0 });
  const [queueStats, setQueueStats] = useState({ totalUntagged: 0, alreadyAudited: 0, remaining: 0 });
  const [activeJob, setActiveJob] = useState<BatchJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuingRef = useRef(false); // prevent double-firing continuations

  const loadQueueStats = useCallback(async () => {
    const { count: totalTouchless } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .not('hero_image', 'is', null);

    const { count: alreadyAudited } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .not('hero_image', 'is', null)
      .not('photo_audited_at', 'is', null);

    const total = totalTouchless ?? 0;
    const audited = alreadyAudited ?? 0;
    setQueueStats({
      totalUntagged: total,
      alreadyAudited: audited,
      remaining: Math.max(0, total - audited),
    });
  }, []);

  const loadResults = useCallback(async () => {
    setLoading(true);

    // Fetch ALL audit results in batches of 1000 to avoid Supabase row limits
    let data: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page, error } = await supabase
        .from('photo_audit_results')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('Error loading audit results:', error);
        setLoading(false);
        return;
      }
      if (!page || page.length === 0) break;
      data = data.concat(page);
      if (page.length < PAGE_SIZE) break; // last page
      offset += PAGE_SIZE;
    }

    if (data.length === 0) {
      setResults([]);
      setStats({ total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0 });
      setLoading(false);
      return;
    }

    const listingIds = Array.from(new Set(data.map(r => r.listing_id)));
    const listings: Record<string, { name: string; hero_image: string | null; city: string; state: string; slug: string; is_touchless: boolean | null }> = {};
    const nonTouchlessIds = new Set<string>();

    for (let i = 0; i < listingIds.length; i += 50) {
      const chunk = listingIds.slice(i, i + 50);
      const { data: listingData } = await supabase
        .from('listings')
        .select('id, name, hero_image, city, state, slug, is_touchless')
        .in('id', chunk);
      if (listingData) {
        for (const l of listingData) {
          listings[l.id] = { name: l.name, hero_image: l.hero_image, city: l.city, state: l.state, slug: l.slug, is_touchless: l.is_touchless };
          if (l.is_touchless === false) nonTouchlessIds.add(l.id);
        }
      }
    }

    // Filter out audit results for listings marked as not touchless
    data = data.filter(r => !nonTouchlessIds.has(r.listing_id as string));

    const enrichedAll: AuditResult[] = data.map(r => ({
      ...r,
      photos_to_remove: r.photos_to_remove ?? [],
      listing_name: listings[r.listing_id]?.name,
      listing_hero: listings[r.listing_id]?.hero_image,
      listing_city: listings[r.listing_id]?.city,
      listing_state: listings[r.listing_id]?.state,
      listing_slug: listings[r.listing_id]?.slug,
    }));

    const seenListings = new Set<string>();
    const enriched = enrichedAll.filter(r => {
      if (seenListings.has(r.listing_id)) return false;
      seenListings.add(r.listing_id);
      return true;
    });

    setResults(enriched);

    const total = enriched.length;
    const applied = enriched.filter(r => r.applied).length;
    const pending = total - applied;
    const equipment = enriched.filter(r => r.equipment_brand && !r.applied).length;
    const heroes = enriched.filter(r => r.hero_quality === 'poor' && r.suggested_hero_url && !r.applied).length;
    const cleanup = enriched.filter(r => r.photos_to_remove.length > 0 && !r.applied).length;

    setStats({ total, applied, pending, equipment, heroes, cleanup });
    setLoading(false);
    await loadQueueStats();
  }, [loadQueueStats]);

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

  // Fire the next chunk for an in-progress job (frontend-triggered chaining)
  // Sets continuingRef=true until the edge function responds (chunk done)
  const continueJob = useCallback(async (jobId: string) => {
    if (continuingRef.current) return; // already firing
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

    // Also refresh queue stats periodically
    await loadQueueStats();

    if (job.status === 'completed' || job.status === 'failed') {
      setRunning(false);
      stopPolling();
      // Final refresh of results
      await loadResults();
    } else if (job.status === 'running' && job.total_processed < job.total_requested && !continuingRef.current) {
      // Edge function finished its chunk (or job just created) — trigger the next chunk
      // Check if enough time has passed since last update (avoids firing while a chunk is processing)
      const updatedAt = new Date(job.updated_at).getTime();
      const createdAt = new Date(job.created_at).getTime();
      const now = Date.now();
      const timeSinceUpdate = now - updatedAt;
      const isNewJob = Math.abs(updatedAt - createdAt) < 2000 && job.total_processed === 0;
      // Trigger if: new job (never processed), OR last update was >8s ago (chunk finished)
      if (isNewJob || timeSinceUpdate > 8000) {
        console.log(`[Poll] Job ${jobId}: ${job.total_processed}/${job.total_requested} — triggering next chunk`);
        continueJob(jobId);
      }
    }
  }, [continueJob, formatJobProgress, loadQueueStats, loadResults, stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    // Immediate first poll
    pollJob(jobId);
    // Then poll every 5s
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

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // ─── Run batch (now creates a server-side job) ────────────────────

  const runBatch = useCallback(async (limit: number, dryRun: boolean, includeGoogle: boolean) => {
    setRunning(true);
    setRunProgress(`Starting batch job (${limit} listings, ${dryRun ? 'DRY RUN' : 'LIVE'})...`);

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
          include_google_photos: includeGoogle,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setRunProgress(`Error: ${data.error}`);
        setRunning(false);
        return;
      }

      if (data.job_id) {
        // Job created — start polling
        setRunProgress(`Job started! Processing ${limit} listings in the background...`);
        startPolling(data.job_id);
      } else {
        // Legacy response (shouldn't happen with new function)
        setRunProgress(`Done! Processed ${data.listings_processed ?? 0} listings.`);
        setRunning(false);
        await loadResults();
      }
    } catch (err) {
      setRunProgress(`Error: ${(err as Error).message}`);
      setRunning(false);
    }
  }, [loadResults, startPolling]);

  const applyEquipment = useCallback(async (auditId: string, listingId: string, brand: string, model: string | null) => {
    await supabase
      .from('listings')
      .update({ equipment_brand: brand, equipment_model: model })
      .eq('id', listingId);

    await supabase
      .from('photo_audit_results')
      .update({ applied: true, reviewed: true })
      .eq('id', auditId);

    setResults(prev => prev.map(r => r.id === auditId ? { ...r, applied: true, reviewed: true } : r));
  }, []);

  const rejectResult = useCallback(async (auditId: string) => {
    await supabase
      .from('photo_audit_results')
      .update({ reviewed: true })
      .eq('id', auditId);

    setResults(prev => prev.map(r => r.id === auditId ? { ...r, reviewed: true } : r));
  }, []);

  const applyAllHighConfidence = useCallback(async () => {
    const highConf = results.filter(
      r => r.equipment_brand && r.equipment_confidence === 'high' && !r.applied && !r.reviewed
    );

    for (const r of highConf) {
      await applyEquipment(r.id, r.listing_id, r.equipment_brand!, r.equipment_model);
    }

    await loadResults();
  }, [results, applyEquipment, loadResults]);

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
  }, []);

  return {
    results,
    loading,
    tab,
    setTab,
    running,
    runProgress,
    includeGooglePhotos,
    setIncludeGooglePhotos,
    stats,
    queueStats,
    activeJob,
    runBatch,
    applyEquipment,
    rejectResult,
    applyAllHighConfidence,
    undoApply,
    reload: loadResults,
  };
}
