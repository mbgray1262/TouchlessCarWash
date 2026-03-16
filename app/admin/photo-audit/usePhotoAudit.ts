'use client';

import { useState, useEffect, useCallback } from 'react';
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

type Tab = 'equipment' | 'heroes' | 'cleanup';

export function usePhotoAudit() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('equipment');
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState('');
  const [includeGooglePhotos, setIncludeGooglePhotos] = useState(true);
  const [stats, setStats] = useState({ total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0 });
  const [queueStats, setQueueStats] = useState({ totalUntagged: 0, alreadyAudited: 0, remaining: 0 });

  const loadQueueStats = useCallback(async () => {
    // Count total touchless listings with images (the full universe we want to audit)
    const { count: totalTouchless } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('is_touchless', true)
      .not('hero_image', 'is', null);

    // Count how many have already been audited (photo_audited_at is set by the edge function)
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

    // Load audit results with listing data
    const { data, error } = await supabase
      .from('photo_audit_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Error loading audit results:', error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setResults([]);
      setStats({ total: 0, applied: 0, pending: 0, equipment: 0, heroes: 0, cleanup: 0 });
      setLoading(false);
      return;
    }

    // Fetch listing names in batch
    const listingIds = Array.from(new Set(data.map(r => r.listing_id)));
    const listings: Record<string, { name: string; hero_image: string | null; city: string; state: string; slug: string }> = {};

    // Fetch in chunks of 50
    for (let i = 0; i < listingIds.length; i += 50) {
      const chunk = listingIds.slice(i, i + 50);
      const { data: listingData } = await supabase
        .from('listings')
        .select('id, name, hero_image, city, state, slug')
        .in('id', chunk);
      if (listingData) {
        for (const l of listingData) {
          listings[l.id] = { name: l.name, hero_image: l.hero_image, city: l.city, state: l.state, slug: l.slug };
        }
      }
    }

    const enrichedAll: AuditResult[] = data.map(r => ({
      ...r,
      photos_to_remove: r.photos_to_remove ?? [],
      listing_name: listings[r.listing_id]?.name,
      listing_hero: listings[r.listing_id]?.hero_image,
      listing_city: listings[r.listing_id]?.city,
      listing_state: listings[r.listing_id]?.state,
      listing_slug: listings[r.listing_id]?.slug,
    }));

    // Deduplicate by listing_id — keep only the latest result per listing
    // (data is already ordered by created_at desc, so first occurrence wins)
    const seenListings = new Set<string>();
    const enriched = enrichedAll.filter(r => {
      if (seenListings.has(r.listing_id)) return false;
      seenListings.add(r.listing_id);
      return true;
    });

    setResults(enriched);

    // Compute stats
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

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const runBatch = useCallback(async (limit: number, dryRun: boolean, includeGoogle: boolean) => {
    setRunning(true);
    const googleLabel = includeGoogle ? ' + Google Photos' : '';
    const CHUNK_SIZE = includeGoogle ? 20 : 50; // Smaller chunks when fetching Google Photos
    const totalChunks = Math.ceil(limit / CHUNK_SIZE);
    const isMultiChunk = totalChunks > 1;

    let totalProcessed = 0;
    let totalEquipment = 0;
    let totalHeroes = 0;
    let totalPhotosRemoved = 0;
    let totalAutoApplied = 0;
    let totalGoogleAdded = 0;
    let totalGoogleScreened = 0;
    let chunkNum = 0;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      while (totalProcessed < limit) {
        chunkNum++;
        const remaining = limit - totalProcessed;
        const chunkLimit = Math.min(CHUNK_SIZE, remaining);

        if (isMultiChunk) {
          setRunProgress(`Processing chunk ${chunkNum}/${totalChunks} (${totalProcessed} done so far)...`);
        } else {
          setRunProgress(`Starting batch (${limit} listings${googleLabel}, ${dryRun ? 'DRY RUN' : 'LIVE'})...`);
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/batch-photo-audit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ limit: chunkLimit, dry_run: dryRun, include_google_photos: includeGoogle }),
        });

        const data = await res.json();

        if (data.error) {
          setRunProgress(`Error on chunk ${chunkNum}: ${data.error} (${totalProcessed} processed so far)`);
          break;
        }

        totalProcessed += data.listings_processed ?? 0;
        totalEquipment += data.equipment_detected ?? 0;
        totalHeroes += data.heroes_replaced ?? 0;
        totalPhotosRemoved += data.photos_removed ?? 0;
        totalAutoApplied += data.auto_applied ?? 0;
        totalGoogleAdded += data.google_photos_added ?? 0;
        totalGoogleScreened += data.google_photos_screened ?? 0;

        // If the function processed fewer than requested, we've run out of listings
        if ((data.listings_processed ?? 0) < chunkLimit) {
          break;
        }
      }

      const googleMsg = totalGoogleAdded > 0
        ? ` Google photos added: ${totalGoogleAdded} (screened ${totalGoogleScreened}).`
        : '';
      setRunProgress(
        `Done! Processed ${totalProcessed} listings${isMultiChunk ? ` in ${chunkNum} chunks` : ''}. ` +
        `Equipment: ${totalEquipment}. Heroes replaced: ${totalHeroes}. ` +
        `Photos removed: ${totalPhotosRemoved}. Auto-applied: ${totalAutoApplied}.${googleMsg}`
      );
      await loadResults();
    } catch (err) {
      setRunProgress(`Error: ${(err as Error).message} (${totalProcessed} processed before error)`);
    } finally {
      setRunning(false);
    }
  }, [loadResults]);

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
    runBatch,
    applyEquipment,
    rejectResult,
    applyAllHighConfidence,
    undoApply,
    reload: loadResults,
  };
}
