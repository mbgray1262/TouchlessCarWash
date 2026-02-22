'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, ExternalLink, Sparkles, Images, Star, Camera, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Pencil, Building2, Link2, TriangleAlert, Bookmark, MapPin, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import PhotoGalleryModal from '@/components/PhotoGalleryModal';
import BatchVerifyModal, { BatchVerifyResult } from '@/components/BatchVerifyModal';
import EditListingModal, { EditableListing } from '@/components/EditListingModal';
import { AdminNav } from '@/components/AdminNav';

interface Listing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  rating: number;
  review_count: number;
  wash_packages: Array<{ name: string; price: string; description?: string }> | null;
  is_touchless: boolean | null;
  is_featured: boolean;
  touchless_confidence: string | null;
  crawl_status: string | null;
  crawl_notes: string | null;
  touchless_evidence: Array<{ keyword: string; snippet: string; type: string }> | string | null;
  last_crawled_at: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: string[] | null;
  blocked_photos: string[] | null;
  amenities: string[] | null;
  hours: Record<string, string> | null;
  extracted_at: string | null;
  hero_image: string | null;
  logo_photo: string | null;
  parent_chain: string | null;
  location_page_url: string | null;
  vendor_id: number | null;
}

interface VendorOption {
  id: number;
  canonical_name: string;
}

interface DbStats {
  total: number;
  touchless: number;
  notTouchless: number;
  unknown: number;
  fetchFailed: number;
  noWebsite: number;
  featured: number;
  chains: number;
  chainsMissingLocationUrl: number;
}

const PAGE_SIZE = 50;

export default function AdminListingsPage() {
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [dbStats, setDbStats] = useState<DbStats>({ total: 0, touchless: 0, notTouchless: 0, unknown: 0, fetchFailed: 0, noWebsite: 0, featured: 0, chains: 0, chainsMissingLocationUrl: 0 });
  const [chainNames, setChainNames] = useState<string[]>([]);
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batchVerifying, setBatchVerifying] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchVerifyResult[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [extracting, setExtracting] = useState<Set<string>>(new Set());
  const [screenshotting, setScreenshotting] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [galleryListing, setGalleryListing] = useState<Listing | null>(null);
  const [editListing, setEditListing] = useState<Listing | null>(null);
  const [sortField, setSortField] = useState<'name' | 'city' | 'last_crawled_at'>('last_crawled_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [refetchingPhotos, setRefetchingPhotos] = useState<Set<string>>(new Set());
  const [expandingChain, setExpandingChain] = useState<Set<string>>(new Set());
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [featuredFilter, setFeaturedFilter] = useState<boolean>(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [assigningVendor, setAssigningVendor] = useState<string | null>(null);
  const [vendorPopover, setVendorPopover] = useState<string | null>(null);
  const [savingTouchless, setSavingTouchless] = useState<Set<string>>(new Set());

  const filtersRef = useRef({ statusFilter, sortField, sortDir, chainFilter, featuredFilter, debouncedSearch });
  filtersRef.current = { statusFilter, sortField, sortDir, chainFilter, featuredFilter, debouncedSearch };

  useEffect(() => {
    fetchStats();
    fetchChainNames();
    fetchVendors();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    fetchFilteredCount();
  }, [statusFilter, sortField, sortDir, chainFilter, featuredFilter, debouncedSearch]);

  useEffect(() => {
    doFetchPage(page);
  }, [page, statusFilter, sortField, sortDir, chainFilter, featuredFilter, debouncedSearch]);

  const fetchStats = async () => {
    const { data, error } = await supabase.rpc('admin_listing_stats');
    if (!error && data) {
      setDbStats(data as DbStats);
    }
  };

  const fetchChainNames = async () => {
    const { data } = await supabase.rpc('get_distinct_chain_names');
    if (data) setChainNames(data as string[]);
  };

  const fetchVendors = async () => {
    const { data } = await supabase.from('vendors').select('id, canonical_name').order('canonical_name', { ascending: true });
    if (data) setVendors(data as VendorOption[]);
  };

  const buildDataQuery = () => {
    const { statusFilter, sortField, sortDir, chainFilter, featuredFilter, debouncedSearch } = filtersRef.current;

    let q = supabase.from('listings').select('*');

    if (debouncedSearch.trim()) {
      const term = `%${debouncedSearch.trim()}%`;
      q = q.or(`name.ilike.${term},city.ilike.${term},state.ilike.${term},parent_chain.ilike.${term}`);
    }

    if (statusFilter === 'touchless') {
      q = q.eq('is_touchless', true);
    } else if (statusFilter === 'not_touchless') {
      q = q.eq('is_touchless', false);
    } else if (statusFilter === 'unknown') {
      q = q.is('is_touchless', null).not('website', 'is', null).neq('crawl_status', 'no_website');
    } else if (statusFilter === 'fetch_failed') {
      q = q.eq('crawl_status', 'fetch_failed');
    } else if (statusFilter === 'no_website') {
      q = q.or('website.is.null,crawl_status.eq.no_website');
    }

    if (featuredFilter) {
      q = q.eq('is_featured', true);
    }

    if (chainFilter === 'chains_only') {
      q = q.not('parent_chain', 'is', null);
    } else if (chainFilter === 'independent') {
      q = q.is('parent_chain', null);
    } else if (chainFilter === 'missing_location_url') {
      q = q.not('parent_chain', 'is', null).is('location_page_url', null);
    } else if (chainFilter !== 'all') {
      q = q.eq('parent_chain', chainFilter);
    }

    const orderField = sortField === 'last_crawled_at' ? 'last_crawled_at' : sortField;
    q = q.order(orderField, { ascending: sortDir === 'asc', nullsFirst: false });

    return q;
  };

  const fetchFilteredCount = async () => {
    const { statusFilter, chainFilter, featuredFilter, debouncedSearch } = filtersRef.current;
    const { data, error } = await supabase.rpc('listings_filtered_count', {
      p_search: debouncedSearch.trim() || null,
      p_status: statusFilter,
      p_chain: chainFilter,
      p_featured: featuredFilter,
    });
    if (!error && data !== null) setTotalCount(data as number);
  };

  const doFetchPage = async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const from = (pageNum - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const [{ data, error }, ] = await Promise.all([
        buildDataQuery().range(from, to),
        pageNum === 1 ? fetchFilteredCount() : Promise.resolve(),
      ]);
      if (error) throw error;
      setListings(data as Listing[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch listings';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentPage = async () => {
    await Promise.all([doFetchPage(page), fetchStats(), fetchFilteredCount()]);
  };

  const assignVendor = async (listingId: string, vendorId: number | null) => {
    setAssigningVendor(listingId);
    try {
      const { error } = await supabase.from('listings').update({ vendor_id: vendorId }).eq('id', listingId);
      if (error) throw error;
      setListings((prev) => prev.map((l) => l.id === listingId ? { ...l, vendor_id: vendorId } : l));
      setVendorPopover(null);
      const vendorName = vendorId ? vendors.find((v) => v.id === vendorId)?.canonical_name : null;
      toast({ title: vendorId ? 'Vendor assigned' : 'Vendor removed', description: vendorId ? `Assigned to ${vendorName}` : 'Listing unassigned from vendor' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to assign vendor', variant: 'destructive' });
    } finally {
      setAssigningVendor(null);
    }
  };

  const handleSortChange = (field: 'name' | 'city' | 'last_crawled_at') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'last_crawled_at' ? 'desc' : 'asc');
    }
  };

  const SortButton = ({ field, label }: { field: 'name' | 'city' | 'last_crawled_at'; label: string }) => {
    const active = sortField === field;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button
        onClick={() => handleSortChange(field)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          active
            ? 'bg-[#0F2744] text-white'
            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  };

  const verifySingleListing = async (listingId: string, silent: boolean = false) => {
    setVerifying((prev) => new Set(prev).add(listingId));

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-listing`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listingId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to verify listing');
      }

      if (result.success && result.listing) {
        const { data: fresh } = await supabase
          .from('listings')
          .select('*')
          .eq('id', listingId)
          .maybeSingle();

        setListings((prev) =>
          prev.map((l) =>
            l.id === listingId ? (fresh as Listing) ?? l : l
          )
        );
      }

      if (!silent) {
        if (result.success) {
          const status = result.listing?.is_touchless === true
            ? 'Touchless'
            : result.listing?.is_touchless === false
            ? 'Not Touchless'
            : 'Unknown';
          toast({
            title: 'Verification complete',
            description: `${result.listing?.name || 'Listing'} - ${status} (${result.listing?.confidence || 'unknown'} confidence)`,
          });
        } else {
          toast({
            title: 'Verification skipped',
            description: result.error || 'Could not verify this listing.',
            variant: 'default',
          });
        }
      }

      return result.success;
    } catch (error) {
      if (!silent) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to start verification',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setVerifying((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
    }
  };

  const extractSingleListing = async (listingId: string) => {
    setExtracting((prev) => new Set(prev).add(listingId));

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-listing-data`,
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

      if (!response.ok) {
        throw new Error(result.error || 'Failed to extract data');
      }

      if (result.extracted) {
        const { data: fresh } = await supabase
          .from('listings')
          .select('*')
          .eq('id', listingId)
          .maybeSingle();

        setListings((prev) =>
          prev.map((l) =>
            l.id === listingId ? (fresh as Listing) ?? l : l
          )
        );
      }

      toast({
        title: 'Extraction complete',
        description: `Extracted ${result.extracted?.photos?.length || 0} photos, ${result.extracted?.amenities?.length || 0} amenities`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to extract data',
        variant: 'destructive',
      });
    } finally {
      setExtracting((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
    }
  };

  const screenshotHero = async (listingId: string) => {
    setScreenshotting((prev) => new Set(prev).add(listingId));

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

      if (!response.ok) {
        throw new Error(result.error || 'Failed to take screenshot');
      }

      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, hero_image: result.hero_image } : l
        )
      );

      toast({ title: 'Screenshot saved', description: 'Website screenshot set as hero image.' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to take screenshot',
        variant: 'destructive',
      });
    } finally {
      setScreenshotting((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
    }
  };

  const refetchPhotos = async (listingId: string) => {
    setRefetchingPhotos((prev) => new Set(prev).add(listingId));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const callEdge = async (fn: string, body: Record<string, unknown>) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    };

    try {
      const extractResult = await callEdge('extract-listing-data', { listing_id: listingId });
      const photos: string[] = extractResult.extracted?.photos ?? [];

      if (photos.length === 0) {
        toast({ title: 'No photos found', description: 'The website had no usable photos. Try taking a screenshot instead.' });
        return;
      }

      const listing = listings.find((l) => l.id === listingId);
      const heroResult = await callEdge('suggest-hero-image', {
        listing_id: listingId,
        photos,
        listing_name: listing?.name ?? '',
      });

      if (heroResult.success) {
        const blockedUrls: string[] = heroResult.blocked_urls ?? [];
        const heroUrl: string | null = heroResult.no_good_photos ? null : heroResult.suggested_url ?? null;

        await supabase
          .from('listings')
          .update({
            ...(heroUrl ? { hero_image: heroUrl } : {}),
            blocked_photos: blockedUrls,
          })
          .eq('id', listingId);

        const { data: fresh } = await supabase.from('listings').select('*').eq('id', listingId).maybeSingle();
        if (fresh) setListings((prev) => prev.map((l) => (l.id === listingId ? (fresh as Listing) : l)));

        if (heroResult.no_good_photos) {
          toast({ title: 'Photos refreshed', description: `${photos.length} photos fetched — none passed the quality filter. ${blockedUrls.length} blocked.` });
        } else {
          toast({ title: 'Photos refreshed', description: `${photos.length} photos fetched, ${blockedUrls.length} blocked, hero image selected.` });
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to re-fetch photos',
        variant: 'destructive',
      });
    } finally {
      setRefetchingPhotos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
    }
  };

  const expandChainLocations = async (listingId: string) => {
    setExpandingChain((prev) => new Set(prev).add(listingId));
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/expand-chain-locations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listingId }),
        }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to expand locations');
      }
      await refreshCurrentPage();
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} new: ${result.created_names.join(', ')}`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped: ${result.skipped_names.join('; ')}`);
      if (result.errors > 0) parts.push(`${result.errors} errors: ${result.error_details.join('; ')}`);
      toast({
        title: `Expanded: ${result.chain_name} (${result.locations_found} found)`,
        description: parts.join(' | ') || 'No changes made.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to expand chain locations',
        variant: 'destructive',
      });
    } finally {
      setExpandingChain((prev) => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
    }
  };

  const verifyBatch = async () => {
    const { data: pendingListings, error: fetchErr } = await supabase
      .from('listings')
      .select('*')
      .or('crawl_status.eq.pending,crawl_status.is.null')
      .not('website', 'is', null)
      .order('last_crawled_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (fetchErr || !pendingListings || pendingListings.length === 0) {
      toast({ title: 'No listings to verify', description: 'All listings with websites have been verified.' });
      return;
    }

    const effectiveBatchSize = pendingListings.length;

    if (!confirm(`This will verify ${effectiveBatchSize} listings. Firecrawl API credits will be used. Continue?`)) {
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const callEdge = async (fn: string, body: Record<string, unknown>) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    };

    const updateStep = (
      id: string,
      stepIndex: number,
      status: 'idle' | 'running' | 'success' | 'error' | 'skipped',
      detail?: string
    ) => {
      setBatchResults((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const steps = r.steps.map((s, i) =>
            i === stepIndex ? { ...s, status, ...(detail !== undefined ? { detail } : {}) } : s
          );
          return { ...r, steps };
        })
      );
    };

    const initialResults: BatchVerifyResult[] = (pendingListings as Listing[]).map((l) => ({
      id: l.id,
      name: l.name,
      website: l.website!,
      website_url: l.website,
      status: 'pending',
      is_touchless: null,
      confidence: null,
      notes: null,
      error: null,
      duration_ms: null,
      photos: l.photos || [],
      blocked_photos: l.blocked_photos || [],
      hero_image: l.hero_image,
      steps: [
        { label: 'Verify touchless status', status: 'idle' },
        { label: 'Extract amenities & photos', status: 'idle' },
        { label: 'Select hero image', status: 'idle' },
      ],
    }));

    setBatchResults(initialResults);
    setBatchTotal(effectiveBatchSize);
    setShowBatchModal(true);
    setBatchVerifying(true);

    try {
      for (let i = 0; i < effectiveBatchSize; i++) {
        const listing = pendingListings[i] as Listing;
        const startTime = Date.now();

        setBatchResults((prev) =>
          prev.map((r) => (r.id === listing.id ? { ...r, status: 'running' } : r))
        );

        try {
          updateStep(listing.id, 0, 'running');
          const verifyResult = await callEdge('verify-listing', { listingId: listing.id });

          if (!verifyResult.success || !verifyResult.listing) {
            const errMsg = verifyResult.error || 'Verification failed';
            updateStep(listing.id, 0, 'error', errMsg);
            updateStep(listing.id, 1, 'skipped');
            updateStep(listing.id, 2, 'skipped');
            setBatchResults((prev) =>
              prev.map((r) =>
                r.id === listing.id
                  ? { ...r, status: 'skipped', error: errMsg, duration_ms: Date.now() - startTime }
                  : r
              )
            );
            continue;
          }

          const isTouchless = verifyResult.listing.is_touchless === true;
          const confidence = verifyResult.listing.confidence ?? null;

          updateStep(
            listing.id,
            0,
            'success',
            isTouchless ? `Touchless (${confidence})` : verifyResult.listing.is_touchless === false ? 'Not touchless' : 'Unknown'
          );

          setBatchResults((prev) =>
            prev.map((r) =>
              r.id === listing.id
                ? { ...r, is_touchless: verifyResult.listing.is_touchless, confidence }
                : r
            )
          );

          if (!isTouchless) {
            updateStep(listing.id, 1, 'skipped', 'Not touchless — skipped');
            updateStep(listing.id, 2, 'skipped', 'Not touchless — skipped');
            const duration_ms = Date.now() - startTime;

            const { data: fresh } = await supabase.from('listings').select('*').eq('id', listing.id).maybeSingle();
            if (fresh) setListings((prev) => prev.map((l) => (l.id === listing.id ? (fresh as Listing) : l)));

            setBatchResults((prev) =>
              prev.map((r) =>
                r.id === listing.id
                  ? {
                      ...r,
                      status: 'success',
                      notes: verifyResult.listing.notes ?? null,
                      duration_ms,
                    }
                  : r
              )
            );
            continue;
          }

          updateStep(listing.id, 1, 'running');
          let photosCount = 0;
          let amenitiesCount = 0;
          let extractedPhotos: string[] = [];

          try {
            const extractResult = await callEdge('extract-listing-data', { listing_id: listing.id });
            photosCount = extractResult.extracted?.photos?.length ?? 0;
            amenitiesCount = extractResult.extracted?.amenities?.length ?? 0;
            extractedPhotos = extractResult.extracted?.photos ?? [];
            updateStep(listing.id, 1, 'success', `${photosCount} photos, ${amenitiesCount} amenities`);
            if (extractedPhotos.length > 0) {
              setBatchResults((prev) =>
                prev.map((r) => r.id === listing.id ? { ...r, photos: extractedPhotos, website_url: listing.website } : r)
              );
            }
          } catch {
            updateStep(listing.id, 1, 'error', 'Extraction failed');
          }

          updateStep(listing.id, 2, 'running');
          let heroImage: string | null = null;
          let finalBlockedUrls: string[] = [];

          try {
            if (extractedPhotos.length > 0) {
              const heroResult = await callEdge('suggest-hero-image', {
                listing_id: listing.id,
                photos: extractedPhotos,
                listing_name: listing.name,
              });

              if (heroResult.success && !heroResult.no_good_photos && heroResult.suggested_url) {
                heroImage = heroResult.suggested_url;
                finalBlockedUrls = heroResult.blocked_urls ?? [];

                await supabase
                  .from('listings')
                  .update({ hero_image: heroImage, blocked_photos: finalBlockedUrls })
                  .eq('id', listing.id);

                updateStep(listing.id, 2, 'success', 'Hero selected from photos');
              } else {
                throw new Error('no_good_photos');
              }
            } else {
              throw new Error('no_photos');
            }
          } catch {
            try {
              const screenshotResult = await callEdge('screenshot-hero', { listing_id: listing.id });
              if (screenshotResult.success && screenshotResult.hero_image) {
                heroImage = screenshotResult.hero_image;
                updateStep(listing.id, 2, 'success', 'Website screenshot used as hero');
              } else {
                updateStep(listing.id, 2, 'error', 'Could not capture hero image');
              }
            } catch {
              updateStep(listing.id, 2, 'error', 'Screenshot failed');
            }
          }

          const { data: fresh } = await supabase.from('listings').select('*').eq('id', listing.id).maybeSingle();
          if (fresh) setListings((prev) => prev.map((l) => (l.id === listing.id ? (fresh as Listing) : l)));

          setBatchResults((prev) =>
            prev.map((r) =>
              r.id === listing.id
                ? {
                    ...r,
                    status: 'success',
                    notes: verifyResult.listing.notes ?? null,
                    duration_ms: Date.now() - startTime,
                    photos_count: photosCount,
                    amenities_count: amenitiesCount,
                    hero_image: heroImage,
                    blocked_photos: finalBlockedUrls.length > 0 ? finalBlockedUrls : r.blocked_photos,
                    website_url: listing.website,
                  }
                : r
            )
          );
        } catch (err) {
          setBatchResults((prev) =>
            prev.map((r) =>
              r.id === listing.id
                ? {
                    ...r,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Unknown error',
                    duration_ms: Date.now() - startTime,
                  }
                : r
            )
          );
        }
      }
    } finally {
      setBatchVerifying(false);
      await refreshCurrentPage();
    }
  };

  const handleHeroSelected = (listingId: string, heroUrl: string) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, hero_image: heroUrl } : l))
    );
    setBatchResults((prev) =>
      prev.map((r) => (r.id === listingId ? { ...r, hero_image: heroUrl } : r))
    );
    toast({ title: 'Hero image saved', description: 'This photo will appear on listing cards and detail pages.' });
  };

  const handleBlockedPhotosChanged = (listingId: string, blocked: string[]) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, blocked_photos: blocked } : l))
    );
    setBatchResults((prev) =>
      prev.map((r) => (r.id === listingId ? { ...r, blocked_photos: blocked } : r))
    );
  };

  const handleLogoPhotoChanged = (listingId: string, logoUrl: string | null) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, logo_photo: logoUrl } : l))
    );
    setGalleryListing((prev) =>
      prev && prev.id === listingId ? { ...prev, logo_photo: logoUrl } : prev
    );
  };

  const handlePhotosChanged = (listingId: string, photos: string[]) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, photos } : l))
    );
    setGalleryListing((prev) =>
      prev && prev.id === listingId ? { ...prev, photos } : prev
    );
  };

  const handleListingEdited = (updated: EditableListing) => {
    setListings((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };

  const handleListingDeleted = (id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
    setTotalCount((prev) => prev - 1);
    setDbStats((prev) => ({ ...prev, total: prev.total - 1 }));
  };

  const setTouchlessStatus = async (listing: Listing, value: boolean | null) => {
    if (savingTouchless.has(listing.id)) return;
    setSavingTouchless((prev) => new Set(prev).add(listing.id));
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          is_touchless: value,
          crawl_status: value !== null ? 'crawled' : listing.crawl_status,
          touchless_confidence: value !== null ? 'manual' : null,
        })
        .eq('id', listing.id);
      if (error) throw error;
      const updater = (l: Listing) =>
        l.id === listing.id
          ? { ...l, is_touchless: value, crawl_status: value !== null ? 'crawled' : l.crawl_status, touchless_confidence: value !== null ? 'manual' : null }
          : l;
      setListings((prev) => prev.map(updater));
      toast({ title: value === true ? 'Marked as Touchless' : value === false ? 'Marked as Not Touchless' : 'Cleared touchless status' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setSavingTouchless((prev) => { const s = new Set(prev); s.delete(listing.id); return s; });
    }
  };

  const toggleFeatured = async (listing: Listing) => {
    const newValue = !listing.is_featured;
    const { error } = await supabase
      .from('listings')
      .update({ is_featured: newValue })
      .eq('id', listing.id);

    if (error) {
      toast({ title: 'Error', description: 'Could not update featured status', variant: 'destructive' });
      return;
    }
    setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, is_featured: newValue } : l));
    toast({ title: newValue ? 'Marked as Featured' : 'Removed from Featured', description: `${listing.name} will ${newValue ? 'now appear' : 'no longer appear'} on the home page.` });
  };

  const getCrawlStatusBadge = (status: string | null, website: string | null) => {
    if (!website) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">No Website</Badge>;
    }
    switch (status) {
      case 'classified':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />Classified
          </Badge>
        );
      case 'fetch_failed':
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
            <XCircle className="w-3 h-3 mr-1" />Fetch Failed
          </Badge>
        );
      case 'classify_failed':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
            <XCircle className="w-3 h-3 mr-1" />Classify Failed
          </Badge>
        );
      case 'unknown':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
            <AlertCircle className="w-3 h-3 mr-1" />Unknown
          </Badge>
        );
      case 'crawled':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />Crawled
          </Badge>
        );
      case 'no_website':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">No Website</Badge>;
      case null:
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />Unprocessed
          </Badge>
        );
      default:
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">{status}</Badge>;
    }
  };

  const getTouchlessBadge = (isTouchless: boolean | null, confidence: string | null) => {
    if (isTouchless === null) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Unknown</Badge>;
    }
    if (isTouchless) {
      const confColor =
        confidence === 'high'
          ? 'bg-green-100 text-green-800 border-green-300'
          : confidence === 'medium'
          ? 'bg-blue-100 text-blue-800 border-blue-300'
          : 'bg-yellow-100 text-yellow-800 border-yellow-300';
      return (
        <Badge variant="outline" className={confColor}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Touchless {confidence && `(${confidence})`}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
        <XCircle className="w-3 h-3 mr-1" />Not Touchless
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="font-semibold text-red-800 mb-2">Error Loading Data</h3>
            <p className="text-red-700 text-sm">{error}</p>
            <Button onClick={() => doFetchPage(page)} className="mt-3" size="sm">Try Again</Button>
          </div>
        )}

        {dbStats.chainsMissingLocationUrl > 0 && (
          <div className="mb-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {dbStats.chainsMissingLocationUrl} chain location{dbStats.chainsMissingLocationUrl !== 1 ? 's' : ''} missing a location-specific URL
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                These locations are part of a chain but only have the brand root website. Without a location-specific URL, crawling will pull shared info rather than per-location hours and services.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setChainFilter('missing_location_url')}
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
            >
              View {dbStats.chainsMissingLocationUrl}
            </Button>
          </div>
        )}

        <div className="mb-6">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/admin/crawls">
              <ArrowLeft className="w-4 h-4 mr-2" />Back to Admin
            </Link>
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-[#0F2744]">Manage Listings</h1>
              <p className="text-gray-600 mt-2">View and verify car wash listings for touchless status</p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="text-[#0F2744] border-[#0F2744] hover:bg-[#0F2744] hover:text-white">
                <Link href="/admin/import">
                  <Link2 className="w-4 h-4 mr-2" />Import from URL
                </Link>
              </Button>
              <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-white">
                <label className="text-sm text-gray-600 whitespace-nowrap">Batch size:</label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={batchVerifying}
                  className="w-16 h-7 text-sm text-center border-0 p-0 focus-visible:ring-0"
                />
              </div>
              <Button
                onClick={verifyBatch}
                disabled={batchVerifying || dbStats.unknown === 0}
                className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
              >
                {batchVerifying ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
                ) : (
                  `Verify Next ${Math.min(dbStats.unknown, batchSize)}`
                )}
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/vendors">
                  <Building2 className="w-4 h-4 mr-2" />Vendors
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/crawls/new">Import Data</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <Card
            className="cursor-pointer hover:border-[#0F2744] transition-colors"
            onClick={() => { setStatusFilter('all'); setChainFilter('all'); setFeaturedFilter(false); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-[#0F2744]">{dbStats.total.toLocaleString()}</div><div className="text-sm text-gray-600">Total</div>{statusFilter === 'all' && chainFilter === 'all' && !featuredFilter && <div className="mt-2 h-0.5 bg-[#0F2744] rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-green-400 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'touchless' ? 'all' : 'touchless'); setChainFilter('all'); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-[#22C55E]">{dbStats.touchless.toLocaleString()}</div><div className="text-sm text-gray-600">Touchless</div>{statusFilter === 'touchless' && <div className="mt-2 h-0.5 bg-[#22C55E] rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-red-400 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'not_touchless' ? 'all' : 'not_touchless'); setChainFilter('all'); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-red-500">{dbStats.notTouchless.toLocaleString()}</div><div className="text-sm text-gray-600">Not Touchless</div>{statusFilter === 'not_touchless' && <div className="mt-2 h-0.5 bg-red-400 rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-yellow-400 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'unknown' ? 'all' : 'unknown'); setChainFilter('all'); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-yellow-600">{dbStats.unknown.toLocaleString()}</div><div className="text-sm text-gray-600">Unknown</div><div className="text-xs text-gray-400 mt-0.5">no determination yet</div>{statusFilter === 'unknown' && <div className="mt-2 h-0.5 bg-yellow-400 rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-orange-400 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'fetch_failed' ? 'all' : 'fetch_failed'); setChainFilter('all'); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-orange-500">{dbStats.fetchFailed.toLocaleString()}</div><div className="text-sm text-gray-600">Fetch Failed</div><div className="text-xs text-gray-400 mt-0.5">pipeline couldn't reach</div>{statusFilter === 'fetch_failed' && <div className="mt-2 h-0.5 bg-orange-400 rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => { setStatusFilter(statusFilter === 'no_website' ? 'all' : 'no_website'); setChainFilter('all'); }}
          ><CardContent className="pt-6"><div className="text-2xl font-bold text-gray-600">{dbStats.noWebsite.toLocaleString()}</div><div className="text-sm text-gray-600">No Website</div><div className="text-xs text-gray-400 mt-0.5">can't classify</div>{statusFilter === 'no_website' && <div className="mt-2 h-0.5 bg-gray-400 rounded-full" />}</CardContent></Card>
          <Card
            className="cursor-pointer hover:border-[#0F2744] transition-colors"
            onClick={() => { setChainFilter(chainFilter === 'chains_only' ? 'all' : 'chains_only'); setStatusFilter('all'); }}
          >
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-[#0F2744]">{dbStats.chains.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Chains</div>
              {dbStats.chainsMissingLocationUrl > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <TriangleAlert className="w-3 h-3 text-amber-500" />
                  <span className="text-xs text-amber-600">{dbStats.chainsMissingLocationUrl} need URL</span>
                </div>
              )}
              {chainFilter === 'chains_only' && <div className="mt-2 h-0.5 bg-[#0F2744] rounded-full" />}
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-amber-400 transition-colors"
            onClick={() => setFeaturedFilter((prev) => !prev)}
          >
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600">{dbStats.featured.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Featured</div>
              {featuredFilter && <div className="mt-2 h-0.5 bg-amber-400 rounded-full" />}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search entire database by name, city, state, or chain..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setChainFilter('all'); }}
                className="border rounded-md px-4 py-2 text-sm"
              >
                <option value="all">All Listings</option>
                <option value="touchless">Touchless</option>
                <option value="not_touchless">Not Touchless</option>
                <option value="unknown">Unknown (no determination yet)</option>
                <option value="fetch_failed">Fetch Failed</option>
                <option value="no_website">No Website</option>
              </select>
              <select
                value={chainFilter}
                onChange={(e) => setChainFilter(e.target.value)}
                className="border rounded-md px-4 py-2 text-sm"
              >
                <option value="all">All Chains</option>
                <option value="chains_only">Chain locations only</option>
                <option value="independent">Independent only</option>
                <option value="missing_location_url">Missing location URL</option>
                {chainNames.length > 0 && <option disabled>── by chain ──</option>}
                {chainNames.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
            </div>
            {(chainFilter !== 'all' || featuredFilter) && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {chainFilter !== 'all' && (
                  <Badge variant="secondary" className="flex items-center gap-1.5 bg-[#0F2744]/10 text-[#0F2744] border-[#0F2744]/20">
                    <Building2 className="w-3 h-3" />
                    {chainFilter === 'chains_only' && 'Showing chain locations'}
                    {chainFilter === 'independent' && 'Showing independent locations'}
                    {chainFilter === 'missing_location_url' && 'Showing chain locations missing URL'}
                    {!['chains_only', 'independent', 'missing_location_url'].includes(chainFilter) && `Chain: ${chainFilter}`}
                    <button onClick={() => setChainFilter('all')} className="ml-1 hover:text-red-600">
                      <XCircle className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {featuredFilter && (
                  <Badge variant="secondary" className="flex items-center gap-1.5 bg-amber-100 text-amber-800 border-amber-300">
                    <Bookmark className="w-3 h-3 fill-current" />
                    Featured only
                    <button onClick={() => setFeaturedFilter(false)} className="ml-1 hover:text-red-600">
                      <XCircle className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Sort:</span>
              <SortButton field="last_crawled_at" label="Last Modified" />
              <SortButton field="name" label="Name A–Z" />
              <SortButton field="city" label="City" />
              <span className="ml-auto text-xs text-gray-400">
                {totalCount.toLocaleString()} listing{totalCount !== 1 ? 's' : ''}
                {totalPages > 1 && ` · page ${page} of ${totalPages}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            <p className="text-gray-600 mt-4">Loading listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No listings found</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {listings.map((listing) => (
                <Card key={listing.id} className={`transition-all duration-300 ${verifying.has(listing.id) ? 'ring-2 ring-blue-400 bg-blue-50/40' : ''}`}>
                  <CardContent className="pt-6">
                    {verifying.has(listing.id) && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-100 border border-blue-300 rounded-md text-blue-700 text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        Verifying this listing — crawling website and analyzing content...
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4">
                      {listing.hero_image && (
                        <div className="shrink-0">
                          <img
                            src={listing.hero_image}
                            alt={listing.name}
                            className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                            loading="lazy"
                            decoding="async"
                          />
                          <div className="flex items-center gap-1 mt-1 text-xs text-[#22C55E] font-medium">
                            <Star className="w-3 h-3 fill-current" />
                            Hero
                          </div>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-semibold text-lg text-[#0F2744]">{listing.name}</h3>
                              {listing.is_featured && (
                                <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-xs">
                                  <Bookmark className="w-3 h-3 mr-1 fill-current" />Featured
                                </Badge>
                              )}
                              {listing.parent_chain && (
                                <button
                                  onClick={() => setChainFilter(listing.parent_chain!)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0F2744]/10 text-[#0F2744] text-xs font-medium hover:bg-[#0F2744]/20 transition-colors"
                                >
                                  <Building2 className="w-3 h-3" />
                                  {listing.parent_chain}
                                </button>
                              )}
                              <div className="relative">
                                {listing.vendor_id ? (
                                  <div className="inline-flex items-center gap-0 rounded-full border border-[#22C55E]/40 bg-[#22C55E]/10 overflow-hidden">
                                    <Link
                                      href={`/admin/vendors/${listing.vendor_id}`}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[#16A34A] text-xs font-medium hover:bg-[#22C55E]/20 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Building2 className="w-3 h-3" />
                                      {vendors.find((v) => v.id === listing.vendor_id)?.canonical_name ?? 'Vendor'}
                                    </Link>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setVendorPopover(vendorPopover === listing.id ? null : listing.id); }}
                                      className="px-1.5 py-0.5 text-[#16A34A] hover:bg-[#22C55E]/20 transition-colors border-l border-[#22C55E]/30"
                                      title="Change vendor"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setVendorPopover(vendorPopover === listing.id ? null : listing.id)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 text-xs hover:border-gray-400 hover:text-gray-500 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Assign Vendor
                                  </button>
                                )}
                                {vendorPopover === listing.id && (
                                  <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 w-56 py-1">
                                    <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide border-b">Assign Vendor</div>
                                    <div className="max-h-48 overflow-y-auto">
                                      {listing.vendor_id && (
                                        <button
                                          className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                                          onClick={() => assignVendor(listing.id, null)}
                                          disabled={assigningVendor === listing.id}
                                        >
                                          {assigningVendor === listing.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                          Remove vendor
                                        </button>
                                      )}
                                      {vendors.map((v) => (
                                        <button
                                          key={v.id}
                                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${listing.vendor_id === v.id ? 'text-[#0F2744] font-medium bg-blue-50' : 'text-gray-700'}`}
                                          onClick={() => assignVendor(listing.id, v.id)}
                                          disabled={assigningVendor === listing.id}
                                        >
                                          {assigningVendor === listing.id ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> : listing.vendor_id === v.id ? <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-[#22C55E]" /> : <Building2 className="w-3 h-3 flex-shrink-0 opacity-30" />}
                                          {v.canonical_name}
                                        </button>
                                      ))}
                                      {vendors.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-gray-400 text-center">No vendors yet</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600">
                              {listing.address && `${listing.address}, `}
                              {listing.city}, {listing.state} {listing.zip}
                            </p>
                            {listing.location_page_url ? (
                              <a
                                href={listing.location_page_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
                              >
                                <Link2 className="w-3 h-3" />
                                Location page
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : listing.website ? (
                              <a
                                href={listing.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-sm hover:underline inline-flex items-center gap-1 mt-1 ${listing.parent_chain ? 'text-amber-600' : 'text-blue-600'}`}
                              >
                                {listing.website}
                                <ExternalLink className="w-3 h-3" />
                                {listing.parent_chain && (
                                  <span className="text-xs text-amber-500 ml-1">(brand root)</span>
                                )}
                              </a>
                            ) : null}
                            {listing.rating > 0 && (
                              <p className="text-sm text-gray-500 mt-1">
                                Rating: {listing.rating} ({listing.review_count} reviews)
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          {getCrawlStatusBadge(listing.crawl_status, listing.website)}
                          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                            <button
                              onClick={() => listing.is_touchless !== true && setTouchlessStatus(listing, true)}
                              disabled={savingTouchless.has(listing.id)}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                listing.is_touchless === true
                                  ? 'bg-green-500 text-white shadow-sm'
                                  : 'text-gray-500 hover:text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {savingTouchless.has(listing.id) && listing.is_touchless !== true ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              Touchless
                            </button>
                            <button
                              onClick={() => listing.is_touchless !== false && setTouchlessStatus(listing, false)}
                              disabled={savingTouchless.has(listing.id)}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                listing.is_touchless === false
                                  ? 'bg-red-500 text-white shadow-sm'
                                  : 'text-gray-500 hover:text-red-700 hover:bg-red-50'
                              }`}
                            >
                              {savingTouchless.has(listing.id) && listing.is_touchless !== false ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              Not Touchless
                            </button>
                            {listing.is_touchless !== null && (
                              <button
                                onClick={() => setTouchlessStatus(listing, null)}
                                disabled={savingTouchless.has(listing.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all"
                                title="Clear / mark as unknown"
                              >
                                <XCircle className="w-3 h-3" />
                                Clear
                              </button>
                            )}
                          </div>
                          {listing.touchless_confidence && listing.touchless_confidence !== 'manual' && (
                            <span className="text-xs text-gray-400">confidence: {listing.touchless_confidence}</span>
                          )}
                        </div>

                        {listing.crawl_notes && (
                          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm mb-3">
                            <p className="font-medium text-blue-900 mb-1">Verification Notes:</p>
                            <p className="text-blue-800">{listing.crawl_notes}</p>
                          </div>
                        )}

                        {listing.touchless_evidence && (
                          <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                            <p className="font-medium text-green-900 mb-2">Evidence Found:</p>
                            {typeof listing.touchless_evidence === 'string' ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                                <p className="text-green-800 text-xs">{listing.touchless_evidence}</p>
                              </div>
                            ) : Array.isArray(listing.touchless_evidence) && listing.touchless_evidence.length > 0 && (
                              <div className="space-y-2">
                                {listing.touchless_evidence.map((evidence, idx) => (
                                  <div key={idx} className="bg-white rounded p-2 border border-green-100">
                                    <div className="flex items-center gap-2 mb-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                                      <span className="font-medium text-green-800 text-xs uppercase">
                                        Keyword: "{evidence.keyword}"
                                      </span>
                                    </div>
                                    <p className="text-gray-700 text-xs leading-relaxed pl-5">{evidence.snippet}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {listing.extracted_at && (
                          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm mt-3">
                            <p className="font-medium text-gray-700 mb-2">Extracted Data:</p>
                            <div className="flex flex-wrap gap-4 text-gray-600">
                              {listing.photos && listing.photos.length > 0 && (
                                <span><span className="font-medium">{listing.photos.length}</span> photos</span>
                              )}
                              {listing.amenities && listing.amenities.length > 0 && (
                                <span><span className="font-medium">Amenities:</span> {listing.amenities.join(', ')}</span>
                              )}
                              {listing.hours && (
                                <span className="font-medium text-gray-700">Hours available</span>
                              )}
                              {listing.hero_image && (
                                <span className="flex items-center gap-1 text-[#22C55E] font-medium">
                                  <Star className="w-3 h-3 fill-current" />Hero image set
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleFeatured(listing)}
                          className={listing.is_featured ? 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'}
                        >
                          <Bookmark className={`w-4 h-4 mr-2 ${listing.is_featured ? 'fill-current' : ''}`} />
                          {listing.is_featured ? 'Unfeature' : 'Feature'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditListing(listing)}
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="w-4 h-4 mr-2" />Edit
                        </Button>
                        {listing.website && listing.crawl_status === null && (
                          <Button
                            size="sm"
                            onClick={() => verifySingleListing(listing.id)}
                            disabled={verifying.has(listing.id)}
                            className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
                          >
                            {verifying.has(listing.id) ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
                            ) : 'Verify'}
                          </Button>
                        )}
                        {(listing.crawl_status === 'classified' || listing.crawl_status === 'crawled' || listing.crawl_status === 'fetch_failed' || listing.crawl_status === 'classify_failed') && listing.website && (
                          <>
                            {listing.crawl_status === 'crawled' && (!listing.photos || listing.photos.length === 0) && (
                              <Button
                                size="sm"
                                onClick={() => verifySingleListing(listing.id)}
                                disabled={verifying.has(listing.id)}
                                className="bg-[#22C55E] hover:bg-[#16A34A] text-white"
                              >
                                {verifying.has(listing.id) ? (
                                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Getting Photos...</>
                                ) : (
                                  <><Images className="w-4 h-4 mr-2" />Get Photos</>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifySingleListing(listing.id)}
                              disabled={verifying.has(listing.id)}
                              className={verifying.has(listing.id) ? 'border-blue-400 text-blue-600' : ''}
                            >
                              {verifying.has(listing.id) ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Re-verifying...</>
                              ) : 'Re-verify'}
                            </Button>
                            {listing.is_touchless === true && (
                              <Button
                                size="sm"
                                onClick={() => extractSingleListing(listing.id)}
                                disabled={extracting.has(listing.id)}
                                className="bg-gray-700 hover:bg-gray-800 text-white"
                              >
                                {extracting.has(listing.id) ? (
                                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting...</>
                                ) : (
                                  <><Sparkles className="w-4 h-4 mr-2" />Extract Data</>
                                )}
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGalleryListing(listing)}
                          className="border-amber-300 text-amber-700 hover:bg-amber-50"
                        >
                          <Images className="w-4 h-4 mr-2" />
                          Photo Gallery
                          {listing.photos && listing.photos.length > 0 && (
                            <span className="ml-1 text-xs text-gray-400">({listing.photos.length})</span>
                          )}
                        </Button>
                        {listing.website && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => refetchPhotos(listing.id)}
                            disabled={refetchingPhotos.has(listing.id)}
                            className="border-teal-300 text-teal-700 hover:bg-teal-50"
                          >
                            {refetchingPhotos.has(listing.id) ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching...</>
                            ) : (
                              <><RefreshCw className="w-4 h-4 mr-2" />Re-fetch Photos</>
                            )}
                          </Button>
                        )}
                        {listing.website && (!listing.photos || listing.photos.length === 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => screenshotHero(listing.id)}
                            disabled={screenshotting.has(listing.id)}
                            className="border-sky-300 text-sky-700 hover:bg-sky-50"
                          >
                            {screenshotting.has(listing.id) ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Screenshotting...</>
                            ) : (
                              <><Camera className="w-4 h-4 mr-2" />{listing.hero_image ? 'Re-screenshot' : 'Screenshot Hero'}</>
                            )}
                          </Button>
                        )}
                        {listing.website && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => expandChainLocations(listing.id)}
                            disabled={expandingChain.has(listing.id)}
                            className="border-violet-300 text-violet-700 hover:bg-violet-50"
                            title="Scrape this listing's website to find all locations and create individual records for each one"
                          >
                            {expandingChain.has(listing.id) ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Expanding...</>
                            ) : (
                              <><MapPin className="w-4 h-4 mr-2" />Expand Locations</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 py-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()} listings
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="hidden sm:flex"
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 text-sm rounded-md font-medium transition-colors ${
                            pageNum === page
                              ? 'bg-[#0F2744] text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="hidden sm:flex"
                  >
                    Last
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showBatchModal && (
        <BatchVerifyModal
          results={batchResults}
          total={batchTotal}
          isRunning={batchVerifying}
          onClose={() => setShowBatchModal(false)}
          onHeroSelected={handleHeroSelected}
          onBlockedPhotosChanged={handleBlockedPhotosChanged}
        />
      )}

      {editListing && (
        <EditListingModal
          listing={editListing}
          onClose={() => setEditListing(null)}
          onSaved={handleListingEdited}
          onDeleted={handleListingDeleted}
        />
      )}

      {galleryListing && (
        <PhotoGalleryModal
          listingId={galleryListing.id}
          listingName={galleryListing.name}
          listingWebsite={galleryListing.website}
          photos={galleryListing.photos || []}
          blockedPhotos={galleryListing.blocked_photos || []}
          currentHeroImage={galleryListing.hero_image}
          currentLogoPhoto={galleryListing.logo_photo}
          onClose={() => setGalleryListing(null)}
          onHeroSelected={handleHeroSelected}
          onBlockedPhotosChanged={handleBlockedPhotosChanged}
          onLogoPhotoChanged={handleLogoPhotoChanged}
          onPhotosChanged={handlePhotosChanged}
        />
      )}
    </div>
  );
}
