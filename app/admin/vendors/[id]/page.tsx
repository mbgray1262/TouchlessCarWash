'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Save, Loader2, Plus, X, Check, CheckCircle2, XCircle, ExternalLink, MapPin, Trash2, Globe, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Eye, Zap, RotateCw, Pencil, Sparkles, Camera, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify as constantsSlugify } from '@/lib/constants';
import FullEditListingPanel, { type EditableFullListing } from '@/components/FullEditListingPanel';
import PhotoEditModal from './PhotoEditModal';

interface Vendor {
  id: number;
  canonical_name: string;
  domain: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  is_chain: boolean;
  updated_at: string;
}

interface VendorListing {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  is_touchless: boolean | null;
  crawl_status: string | null;
  website: string | null;
  location_page_url: string | null;
  hero_image: string | null;
  photos: string[] | null;
}

interface NewListingForm {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  latitude: string;
  longitude: string;
}

const emptyListingForm: NewListingForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  website: '',
  latitude: '',
  longitude: '',
};

/** US state abbreviations for address parsing */
const US_STATE_ABBREVS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]);

/**
 * Parse a full address string like "12570 Warwick Blvd, Newport News, VA 23606"
 * into { street, city, state, zip } components.
 */
function parseFullAddress(raw: string): { street: string; city: string; state: string; zip: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try: "street, city, state zip" or "street, city, ST, zip"
  // Split on commas
  const parts = trimmed.split(',').map(p => p.trim());

  if (parts.length >= 3) {
    const street = parts[0];
    const city = parts[1];
    // Last part might be "VA 23606" or "VA, 23606" (already split)
    const lastPart = parts.slice(2).join(' ').trim();
    // Match state (2 letters) and optional zip
    const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
    if (stateZipMatch && US_STATE_ABBREVS.has(stateZipMatch[1].toUpperCase())) {
      return { street, city, state: stateZipMatch[1].toUpperCase(), zip: stateZipMatch[2] || '' };
    }
    // Try: last part might be just a state code, and zip might be separate
    const justState = lastPart.match(/^([A-Z]{2})$/i);
    if (justState && US_STATE_ABBREVS.has(justState[1].toUpperCase())) {
      return { street, city, state: justState[1].toUpperCase(), zip: '' };
    }
  }

  if (parts.length === 2) {
    // "street, city ST zip" — no comma between city and state
    const street = parts[0];
    const rest = parts[1];
    const match = rest.match(/^(.+?)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
    if (match && US_STATE_ABBREVS.has(match[2].toUpperCase())) {
      return { street, city: match[1].trim(), state: match[2].toUpperCase(), zip: match[3] || '' };
    }
  }

  // Single string: "street city ST zip"
  if (parts.length === 1) {
    const match = trimmed.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (match && US_STATE_ABBREVS.has(match[2].toUpperCase())) {
      // Try to split the first part into street and city (tricky — use last comma or heuristic)
      return { street: '', city: match[1].trim(), state: match[2].toUpperCase(), zip: match[3] };
    }
  }

  return null;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

type SortKey = 'name' | 'address' | 'city' | 'state' | 'zip' | 'is_touchless';
type SortDir = 'asc' | 'desc';

function listingUrl(listing: VendorListing): string {
  return `/state/${getStateSlug(listing.state)}/${constantsSlugify(listing.city)}/${listing.slug}`;
}

export default function VendorDetailPage() {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const vendorId = Number(params.id);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [listings, setListings] = useState<VendorListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [listingForm, setListingForm] = useState<NewListingForm>(emptyListingForm);
  const [addingLocation, setAddingLocation] = useState(false);
  const [togglingTouchless, setTogglingTouchless] = useState<string | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<string | null>(null);
  const [miningLocation, setMiningLocation] = useState<string | null>(null);
  const [enrichingLocation, setEnrichingLocation] = useState<string | null>(null);
  const [enrichResults, setEnrichResults] = useState<Record<string, { success: boolean; steps: { name: string; status: string; detail?: string }[] }>>({});
  const [editingListing, setEditingListing] = useState<EditableFullListing | null>(null);
  const [loadingEditListing, setLoadingEditListing] = useState<string | null>(null);
  const [photoEditListingId, setPhotoEditListingId] = useState<string | null>(null);
  const [fullEnrichingAll, setFullEnrichingAll] = useState(false);
  const [fullEnrichProgress, setFullEnrichProgress] = useState<{ steps: { name: string; status: string; detail?: string }[]; listingCount?: number } | null>(null);
  const [streetViewReplacing, setStreetViewReplacing] = useState(false);
  const [streetViewResult, setStreetViewResult] = useState<{ total: number; replaced: number; no_coverage: number } | null>(null);

  // Sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Checkbox selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Batch Street View progress
  const [svProgress, setSvProgress] = useState<{
    current: number;
    total: number;
    replaced: number;
    noCoverage: number;
    errors: number;
    done: boolean;
    results: { id: string; name: string; status: string; detail?: string }[];
  } | null>(null);

  // Sort & filter state
  const [sortKey, setSortKey] = useState<SortKey>('state');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stateFilter, setStateFilter] = useState<string>('');

  const [form, setForm] = useState({
    canonical_name: '',
    domain: '',
    website: '',
    logo_url: '',
    description: '',
    is_chain: false,
  });

  // Derive unique states for filter dropdown
  const uniqueStates = useMemo(() => {
    const states = Array.from(new Set(listings.map((l) => l.state))).sort();
    return states;
  }, [listings]);

  // Sorted & filtered listings
  const displayListings = useMemo(() => {
    let filtered = listings;
    if (stateFilter) {
      filtered = filtered.filter((l) => l.state === stateFilter);
    }
    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'address': return dir * (a.address || '').localeCompare(b.address || '');
        case 'city': return dir * a.city.localeCompare(b.city);
        case 'state': return dir * a.state.localeCompare(b.state) || a.city.localeCompare(b.city);
        case 'zip': return dir * (a.zip || '').localeCompare(b.zip || '');
        case 'is_touchless': {
          const rank = (v: boolean | null) => v === true ? 0 : v === false ? 1 : 2;
          return dir * (rank(a.is_touchless) - rank(b.is_touchless));
        }
        default: return 0;
      }
    });
  }, [listings, stateFilter, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  useEffect(() => {
    if (!isNaN(vendorId)) fetchVendor();
  }, [vendorId]);

  const fetchVendor = async () => {
    setLoading(true);
    try {
      const [vendorRes, listingsRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', vendorId).maybeSingle(),
        supabase
          .from('listings')
          .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, photos')
          .eq('vendor_id', vendorId)
          .order('state', { ascending: true })
          .order('city', { ascending: true }),
      ]);

      if (vendorRes.error) throw vendorRes.error;
      if (!vendorRes.data) { router.push('/admin/vendors'); return; }

      setVendor(vendorRes.data);
      setForm({
        canonical_name: vendorRes.data.canonical_name,
        domain: vendorRes.data.domain ?? '',
        website: vendorRes.data.website ?? '',
        logo_url: vendorRes.data.logo_url ?? '',
        description: vendorRes.data.description ?? '',
        is_chain: vendorRes.data.is_chain,
      });
      setListings((listingsRes.data as VendorListing[]) || []);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load vendor', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.canonical_name.trim()) {
      toast({ title: 'Validation Error', description: 'Canonical name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          canonical_name: form.canonical_name.trim(),
          domain: form.domain.trim() || null,
          website: form.website.trim() || null,
          logo_url: form.logo_url.trim() || null,
          description: form.description.trim() || null,
          is_chain: form.is_chain,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendorId);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Vendor updated successfully' });
      setVendor((v) => v ? { ...v, ...form, canonical_name: form.canonical_name.trim() } : v);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${vendor?.canonical_name}"? All linked listings will have their vendor unset. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await supabase.from('listings').update({ vendor_id: null }).eq('vendor_id', vendorId);
      const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Vendor removed' });
      router.push('/admin/vendors');
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' });
      setDeleting(false);
    }
  };

  const handleToggleTouchless = async (listing: VendorListing) => {
    const next = listing.is_touchless === true ? false : listing.is_touchless === false ? null : true;
    setTogglingTouchless(listing.id);
    try {
      // The listing detail page redirects to the city hub whenever
      // `!is_touchless || !is_approved`, so flipping is_touchless alone
      // isn't enough to make a listing reachable again. Sync is_approved
      // (and clear touchless_verified when reverting) so the admin's
      // intent on this page actually publishes/unpublishes the listing.
      const update: Record<string, unknown> = { is_touchless: next };
      if (next === true) {
        // Admin explicitly marked this Touchless on the Vendors page →
        // publish it. (Keep any existing touchless_verified pill.)
        update.is_approved = true;
        // Queue agile review mining: the mine-one-listing GitHub Actions
        // workflow drains review_mine_status='pending' (~every 5 min), runs
        // the free Playwright miner -> label -> score, then clears the flag.
        // This is how a just-flipped listing self-completes with snippets +
        // a Touchless Satisfaction Score without a manual batch run.
        update.review_mine_status = 'pending';
      } else {
        // Not Touchless or Unknown → unpublish + clear verified pill.
        update.is_approved = false;
        update.touchless_verified = null;
      }
      const { error } = await supabase
        .from('listings')
        .update(update)
        .eq('id', listing.id);
      if (error) throw error;
      setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, is_touchless: next } : l));
      const label = next === true ? 'Touchless' : next === false ? 'Not Touchless' : 'Unknown';
      // Flipped to touchless → fire instant review mining (the 'pending' flag set
      // above is the fallback for the 5-min drain if dispatch is unconfigured).
      let started = false;
      if (next === true) {
        const r = await fetch('/api/mine-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: listing.id }),
        }).then((res) => res.json()).catch(() => ({ dispatched: false }));
        started = !!r?.dispatched;
      }
      toast({
        title: 'Updated',
        description: next === true
          ? `${listing.name} set to Touchless — review mining ${started ? 'started now (score in ~2-3 min)' : 'queued (~5 min)'}`
          : `${listing.name} set to ${label}`,
      });

      // Purge Netlify CDN cache for the listing's detail page so the
      // change shows up immediately when the admin clicks through.
      // Best-effort — failures are silent.
      const stateSlugForPath = (listing.state || '').toLowerCase().replace(/\s+/g, '-');
      const citySlugForPath = (listing.city || '').toLowerCase().replace(/\s+/g, '-');
      if (listing.slug && stateSlugForPath && citySlugForPath) {
        fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `/state/${stateSlugForPath}/${citySlugForPath}/${listing.slug}` }),
        }).catch(() => {});
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setTogglingTouchless(null);
    }
  };

  // Manual one-off review mining: flag the listing 'pending' so the
  // mine-one-listing workflow (drains ~every 5 min) runs the free Playwright
  // miner -> label -> score for it. Same path the touchless-flip auto-queue uses.
  const handleMineNow = async (listing: VendorListing) => {
    setMiningLocation(listing.id);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ review_mine_status: 'pending' })
        .eq('id', listing.id);
      if (error) throw error;
      // Fire the instant GitHub Actions run. 'pending' above is the fallback —
      // if dispatch is unconfigured/fails, the 5-min drain still catches it.
      const r = await fetch('/api/mine-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id }),
      }).then((res) => res.json()).catch(() => ({ dispatched: false }));
      toast({
        title: r?.dispatched ? 'Review mining started' : 'Review mining queued',
        description: r?.dispatched
          ? `${listing.name} — running now; snippets + score populate in ~2-3 min.`
          : `${listing.name} — will mine on the next drain (~5 min).`,
      });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to queue mining', variant: 'destructive' });
    } finally {
      setMiningLocation(null);
    }
  };

  const handleDeleteLocation = async (listing: VendorListing) => {
    if (!confirm(`Delete "${listing.name}" in ${listing.city}, ${listing.state}? This permanently removes the listing.`)) return;
    setDeletingLocation(listing.id);
    try {
      const { error } = await supabase.from('listings').delete().eq('id', listing.id);
      if (error) throw error;
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      toast({ title: 'Deleted', description: `${listing.name} removed` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeletingLocation(null);
    }
  };

  const handleEnrich = async (listing: VendorListing) => {
    const mode = listing.website ? 'website' : 'google';
    setEnrichingLocation(listing.id);
    // Clear any previous result for this listing
    setEnrichResults((prev) => { const n = { ...prev }; delete n[listing.id]; return n; });

    try {
      const res = await fetch('/api/enrich-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Enrichment failed', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: false, steps: [] } }));
        return;
      }

      setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: data.success, steps: data.steps ?? [] } }));

      // Re-fetch the listing data to get updated fields
      const { data: refreshed, error: refreshErr } = await supabase
        .from('listings')
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, photos')
        .eq('id', listing.id)
        .maybeSingle();

      if (!refreshErr && refreshed) {
        setListings((prev) => prev.map((l) => l.id === listing.id ? (refreshed as VendorListing) : l));
      }

      const failedSteps = (data.steps ?? []).filter((s: { status: string }) => s.status !== 'ok');
      if (data.success) {
        toast({
          title: 'Enrichment complete',
          description: `${listing.name} enriched via ${mode === 'website' ? 'website scrape' : 'Google Places'}. ${(data.steps ?? []).length} step(s) completed.`,
        });
      } else {
        toast({
          title: 'Partial enrichment',
          description: `${failedSteps.length} step(s) had issues. Check results for details.`,
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Enrichment request failed', variant: 'destructive' });
      setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: false, steps: [] } }));
    } finally {
      setEnrichingLocation(null);
    }
  };

  const handleOpenEditListing = async (listing: VendorListing) => {
    setLoadingEditListing(listing.id);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listing.id)
        .single();
      if (error) throw error;
      setEditingListing(data as EditableFullListing);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load listing details', variant: 'destructive' });
    } finally {
      setLoadingEditListing(null);
    }
  };

  const handleFullEnrichAll = async () => {
    if (!listings.length) return;

    setFullEnrichingAll(true);
    setFullEnrichProgress(null);

    try {
      const listingIds = listings.map((l) => l.id);
      const res = await fetch('/api/enrich-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds, mode: 'full' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Full Enrich failed', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }

      setFullEnrichProgress({ steps: data.steps ?? [], listingCount: data.listingCount });

      const failedSteps = (data.steps ?? []).filter((s: { status: string }) => s.status !== 'ok');
      if (data.success) {
        toast({
          title: 'Full Enrich started',
          description: `Google data fetched for ${data.listingCount} listings. Photo enrichment and description generation running in background.`,
        });
      } else {
        toast({
          title: 'Partial success',
          description: `${failedSteps.length} step(s) had issues. Check the progress banner for details.`,
          variant: 'destructive',
        });
      }

      // Refresh listings to show updated data
      fetchVendor();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Full enrich request failed', variant: 'destructive' });
    } finally {
      setFullEnrichingAll(false);
    }
  };

  // ── Checkbox selection helpers ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === displayListings.length && displayListings.length > 0) {
        return new Set();
      }
      return new Set(displayListings.map(l => l.id));
    });
  }, [displayListings]);

  // ── Batch Street View Heroes ──
  // Processes selected listings in small batches to avoid Edge Function timeouts.
  // The old `replace_vendor` action processed ALL listings in one go, which caused
  // timeout + retry storms for large vendors ("runaway process").
  const handleBatchStreetView = async () => {
    const hasSelection = selectedIds.size > 0;
    const targetIds = hasSelection ? Array.from(selectedIds) : displayListings.map(l => l.id);

    if (targetIds.length === 0) {
      toast({ title: 'No listings', description: 'No listings to process.', variant: 'destructive' });
      return;
    }


    setStreetViewReplacing(true);
    setStreetViewResult(null);
    setSvProgress({ current: 0, total: targetIds.length, replaced: 0, noCoverage: 0, errors: 0, done: false, results: [] });

    const BATCH_SIZE = 5;
    let replaced = 0;
    let noCoverage = 0;
    let errors = 0;
    const allResults: { id: string; name: string; status: string; detail?: string }[] = [];

    for (let i = 0; i < targetIds.length; i += BATCH_SIZE) {
      const batchIds = targetIds.slice(i, i + BATCH_SIZE);

      try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('streetview-hero', {
          body: { action: 'replace_listings', listing_ids: batchIds },
        });

        if (fnErr) {
          for (const id of batchIds) {
            const name = listings.find(l => l.id === id)?.name ?? id;
            allResults.push({ id, name, status: 'error', detail: fnErr.message });
            errors++;
          }
        } else if (fnData.results) {
          for (const r of fnData.results) {
            const name = listings.find(l => l.id === r.id)?.name ?? r.id;
            allResults.push({ id: r.id, name, status: r.status, detail: r.detail });
            if (r.status === 'ok') replaced++;
            else if (r.status === 'no_coverage') noCoverage++;
            else errors++;
          }
        }
      } catch (err) {
        for (const id of batchIds) {
          const name = listings.find(l => l.id === id)?.name ?? id;
          allResults.push({ id, name, status: 'error', detail: err instanceof Error ? err.message : 'Unknown error' });
          errors++;
        }
      }

      setSvProgress({
        current: Math.min(i + BATCH_SIZE, targetIds.length),
        total: targetIds.length,
        replaced,
        noCoverage,
        errors,
        done: false,
        results: [...allResults],
      });
    }

    setSvProgress(prev => prev ? { ...prev, done: true } : prev);
    setStreetViewReplacing(false);
    setSelectedIds(new Set());

    toast({
      title: 'Street View Heroes Complete',
      description: `${replaced} replaced, ${noCoverage} no coverage${errors > 0 ? `, ${errors} errors` : ''} out of ${targetIds.length} total.`,
      variant: errors > 0 ? 'destructive' : undefined,
    });

    fetchVendor();
  };

  const handleFullEnrichSingle = async (listing: VendorListing) => {
    setEnrichingLocation(listing.id);
    setEnrichResults((prev) => { const n = { ...prev }; delete n[listing.id]; return n; });

    try {
      const res = await fetch('/api/enrich-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, listingIds: [listing.id], mode: 'full' }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Full Enrich failed', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: false, steps: [] } }));
        return;
      }

      setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: data.success, steps: data.steps ?? [] } }));

      // Re-fetch the listing data
      const { data: refreshed, error: refreshErr } = await supabase
        .from('listings')
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, photos')
        .eq('id', listing.id)
        .maybeSingle();

      if (!refreshErr && refreshed) {
        setListings((prev) => prev.map((l) => l.id === listing.id ? (refreshed as VendorListing) : l));
      }

      if (data.success) {
        toast({ title: 'Full Enrich complete', description: `${listing.name} fully enriched. Photos & descriptions running in background.` });
      } else {
        toast({ title: 'Partial enrichment', description: 'Some steps had issues. Check results for details.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Full enrich failed', variant: 'destructive' });
      setEnrichResults((prev) => ({ ...prev, [listing.id]: { success: false, steps: [] } }));
    } finally {
      setEnrichingLocation(null);
    }
  };

  const handleListingEdited = (updated: EditableFullListing) => {
    setListings((prev) => prev.map((l) => l.id === updated.id ? {
      ...l,
      name: updated.name,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      is_touchless: updated.is_touchless,
      website: updated.website,
      location_page_url: updated.location_page_url,
      crawl_status: updated.crawl_status,
    } : l));
    setEditingListing(null);
  };

  const handlePhotoUpdate = useCallback((listingId: string, updated: { hero_image: string | null; photos: string[] | null }) => {
    setListings((prev) => prev.map((l) =>
      l.id === listingId ? { ...l, hero_image: updated.hero_image, photos: updated.photos } : l
    ));
  }, []);

  const photoEditListing = useMemo(() => {
    if (!photoEditListingId) return null;
    return listings.find((l) => l.id === photoEditListingId) ?? null;
  }, [photoEditListingId, listings]);

  const handleAddLocation = async () => {
    if (!listingForm.name.trim() || !listingForm.city.trim() || !listingForm.state.trim()) {
      toast({ title: 'Validation Error', description: 'Name, city, and state are required', variant: 'destructive' });
      return;
    }
    setAddingLocation(true);
    try {
      const baseSlug = slugify(`${listingForm.name} ${listingForm.city} ${listingForm.state}`);
      const { data: existing } = await supabase
        .from('listings')
        .select('slug')
        .like('slug', `${baseSlug}%`);

      let slug = baseSlug;
      if (existing && existing.length > 0) slug = `${baseSlug}-${existing.length + 1}`;

      const { data, error } = await supabase
        .from('listings')
        .insert({
          vendor_id: vendorId,
          name: listingForm.name.trim(),
          slug,
          address: listingForm.address.trim() || '',
          city: listingForm.city.trim(),
          state: listingForm.state.trim().toUpperCase(),
          zip: listingForm.zip.trim() || '',
          phone: listingForm.phone.trim() || null,
          website: listingForm.website.trim() || null,
          latitude: listingForm.latitude ? parseFloat(listingForm.latitude) : null,
          longitude: listingForm.longitude ? parseFloat(listingForm.longitude) : null,
          is_touchless: null,
          is_featured: false,
          is_approved: true,
          rating: 0,
          review_count: 0,
          wash_packages: [],
          amenities: [],
          photos: [],
          crawl_status: listingForm.website ? 'pending' : 'no_website',
        })
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, photos')
        .single();

      if (error) throw error;
      const newListing = data as VendorListing;
      setListings((prev) => [...prev, newListing]);
      setListingForm(emptyListingForm);
      setShowAddLocation(false);
      toast({
        title: 'Location added',
        description: `${listingForm.name} created. Geocoding via Google Places…`,
      });

      // Auto-geocode: find Google Place ID, lat/lng for the new listing
      try {
        const geoRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/discover-touchless`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ action: 'geocode', listing_ids: [newListing.id] }),
          },
        );
        const geoData = await geoRes.json();
        const matched = geoData?.results?.find(
          (r: { id: string; status: string }) => r.id === newListing.id && r.status === 'matched',
        );
        if (matched) {
          toast({ title: 'Geocoded', description: `Found Google Place for ${listingForm.name.trim()}` });
        }
      } catch {
        // Geocoding failure is non-fatal — listing is still created
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to add location', variant: 'destructive' });
    } finally {
      setAddingLocation(false);
    }
  };

  const TouchlessBadge = ({ listing }: { listing: VendorListing }) => {
    const isToggling = togglingTouchless === listing.id;
    const label = listing.is_touchless === true ? 'Touchless' : listing.is_touchless === false ? 'Not Touchless' : 'Unknown';
    const cls =
      listing.is_touchless === true
        ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
        : listing.is_touchless === false
          ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
          : 'border-gray-200 text-gray-500 hover:bg-gray-100';
    return (
      <button
        disabled={isToggling}
        onClick={() => handleToggleTouchless(listing)}
        title={`Click to cycle: Touchless → Not Touchless → Unknown`}
        className="inline-flex items-center"
      >
        <Badge variant="outline" className={`${cls} text-xs cursor-pointer transition-colors select-none ${isToggling ? 'opacity-50' : ''}`}>
          {isToggling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          {label}
        </Badge>
      </button>
    );
  };

  const getStatusBadge = (status: string | null, website: string | null) => {
    if (!website) return <Badge variant="outline" className="border-gray-200 text-gray-500 text-xs">No Website</Badge>;
    if (status === 'crawled' || status === 'classified') return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
    if (status === 'failed' || status === 'fetch_failed' || status === 'classify_failed') return <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50 text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    return <Badge variant="outline" className="border-yellow-200 text-yellow-700 bg-yellow-50 text-xs">Pending</Badge>;
  };

  const SortHeader = ({ label, col, className }: { label: string; col: SortKey; className?: string }) => (
    <th
      className={`text-left px-4 py-2.5 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors ${className ?? ''}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin/listings" className="hover:text-gray-700">Admin</Link>
              <span>/</span>
              <Link href="/admin/vendors" className="hover:text-gray-700">Vendors</Link>
              <span>/</span>
              <span className="text-gray-900 font-medium truncate max-w-48">{vendor.canonical_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700 -ml-2">
                <Link href="/admin/vendors"><ArrowLeft className="w-4 h-4 mr-1" />Back</Link>
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">{vendor.canonical_name}</h1>
              <Badge variant="outline" className={vendor.is_chain ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-600'}>
                {vendor.is_chain ? 'Chain' : 'Standalone'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {vendor.website && (
              <a href={vendor.website} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1 text-gray-600">
                  <Globe className="w-4 h-4" />Website
                </Button>
              </a>
            )}
            <Button onClick={handleDelete} disabled={deleting} variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {!sidebarCollapsed && (
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Vendor Details</CardTitle>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Collapse sidebar"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Canonical Name <span className="text-red-500">*</span></label>
                  <Input value={form.canonical_name} onChange={(e) => setForm((f) => ({ ...f, canonical_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Domain</label>
                  <Input placeholder="e.g. mistercarwash.com" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Website URL</label>
                  <Input placeholder="https://..." value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Logo URL</label>
                  <Input placeholder="https://..." value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} />
                  {form.logo_url && (
                    <img src={form.logo_url} alt="Logo preview" className="mt-2 w-16 h-16 rounded object-contain bg-gray-100 border" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Description</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    rows={4}
                    placeholder="Brief description of this vendor..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, is_chain: !f.is_chain }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_chain ? 'bg-[#0F2744]' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.is_chain ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm font-medium text-gray-700">Is a chain / franchise</span>
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Changes</>}
                </Button>
              </CardContent>
            </Card>
          </div>
          )}

          <div className={sidebarCollapsed ? 'lg:col-span-4' : 'lg:col-span-3'}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    {sidebarCollapsed && (
                      <button
                        onClick={() => setSidebarCollapsed(false)}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Show vendor details"
                      >
                        <PanelLeftOpen className="w-4 h-4" />
                      </button>
                    )}
                    <CardTitle className="text-base">
                      Locations
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({stateFilter ? `${displayListings.length} of ${listings.length}` : listings.length})
                      </span>
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {uniqueStates.length > 1 && (
                      <div className="relative">
                        <select
                          value={stateFilter}
                          onChange={(e) => setStateFilter(e.target.value)}
                          className="appearance-none bg-white border border-gray-200 rounded-md pl-3 pr-8 py-1.5 text-sm text-gray-700 cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">All States</option>
                          {uniqueStates.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}
                    <Button
                      onClick={handleBatchStreetView}
                      disabled={streetViewReplacing || listings.length === 0}
                      size="sm"
                      variant="outline"
                      className="gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      {streetViewReplacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {streetViewReplacing
                        ? 'Replacing...'
                        : selectedIds.size > 0
                          ? `Street View (${selectedIds.size})`
                          : 'Street View Heroes'}
                    </Button>
                    <Button
                      onClick={handleFullEnrichAll}
                      disabled={fullEnrichingAll || listings.length === 0}
                      size="sm"
                      variant="outline"
                      className="gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      {fullEnrichingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {fullEnrichingAll ? 'Enriching...' : 'Full Enrich All'}
                    </Button>
                    <Button
                      onClick={() => { setListingForm({ ...emptyListingForm, name: vendor?.canonical_name || '' }); setShowAddLocation(true); }}
                      size="sm"
                      className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Location
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {fullEnrichProgress && (
                <div className="mx-4 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-amber-800">
                      Full Enrich Results — {fullEnrichProgress.listingCount} listing(s)
                    </span>
                    <button
                      onClick={() => setFullEnrichProgress(null)}
                      className="text-amber-400 hover:text-amber-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {fullEnrichProgress.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {step.status === 'ok' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium text-amber-900">{step.name}</span>
                        <span className="text-amber-700 truncate">{step.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {svProgress && (
                <div className="mx-4 mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800">
                      <Camera className="w-4 h-4 inline mr-1.5" />
                      Street View Heroes — {svProgress.done ? 'Complete' : `${svProgress.current}/${svProgress.total} processed`}
                    </span>
                    {svProgress.done && (
                      <button
                        onClick={() => setSvProgress(null)}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${svProgress.total > 0 ? (svProgress.current / svProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-blue-700">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" />{svProgress.replaced} replaced</span>
                    <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-yellow-500" />{svProgress.noCoverage} no coverage</span>
                    {svProgress.errors > 0 && (
                      <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3" />{svProgress.errors} errors</span>
                    )}
                  </div>
                  {svProgress.done && svProgress.results.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5 border-t border-blue-200 pt-2">
                      {svProgress.results.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {r.status === 'ok' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          ) : r.status === 'no_coverage' ? (
                            <XCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          )}
                          <span className="font-medium text-blue-900 truncate max-w-[200px]">{r.name}</span>
                          <span className="text-blue-600 truncate">{r.status === 'ok' ? 'Updated' : r.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedIds.size > 0 && (
                <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <span className="text-sm text-blue-800 font-medium">
                    {selectedIds.size} location{selectedIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    Clear selection
                  </button>
                </div>
              )}
              <CardContent className="p-0">
                {listings.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 px-4">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No locations assigned to this vendor yet.</p>
                    <p className="text-xs mt-1">Use &ldquo;Add Location&rdquo; to create one, or assign from the listings page.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="px-2 py-2.5 w-10">
                            <input
                              type="checkbox"
                              checked={displayListings.length > 0 && selectedIds.size === displayListings.length}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </th>
                          <th className="px-2 py-2.5 w-16" />
                          <SortHeader label="Name" col="name" />
                          <SortHeader label="Address" col="address" />
                          <SortHeader label="City" col="city" />
                          <SortHeader label="State" col="state" />
                          <SortHeader label="ZIP" col="zip" />
                          <SortHeader label="Touchless" col="is_touchless" />
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Links</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Enrich</th>
                          <th className="px-4 py-2.5 w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {displayListings.map((listing) => (
                          <tr key={listing.id} className={`border-b last:border-0 hover:bg-gray-50/80 transition-colors group ${selectedIds.has(listing.id) ? 'bg-blue-50/50' : ''}`}>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(listing.id)}
                                onChange={() => toggleSelect(listing.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-2 py-1.5 w-16">
                              <div className="group/thumb relative">
                                <button
                                  onClick={() => setPhotoEditListingId(listing.id)}
                                  className="cursor-pointer"
                                  title="Click to edit photos"
                                >
                                  <img
                                    src={listing.hero_image || '/images/card-fallback.svg'}
                                    alt=""
                                    className="w-14 h-10 rounded object-cover border border-gray-200 group-hover/thumb:border-blue-400 transition-colors"
                                    loading="lazy"
                                  />
                                </button>
                                {listing.hero_image && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await supabase.from('listings').update({ hero_image: null }).eq('id', listing.id);
                                      setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, hero_image: null } : l));
                                    }}
                                    className="absolute -top-1.5 -left-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-sm opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                    title="Delete hero image"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                                {(listing.photos?.length ?? 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">
                                    {listing.photos!.length}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap max-w-[200px] truncate" title={listing.name}>
                              <button
                                onClick={() => handleOpenEditListing(listing)}
                                disabled={loadingEditListing === listing.id}
                                className="text-left hover:text-blue-600 transition-colors inline-flex items-center gap-1.5"
                              >
                                {loadingEditListing === listing.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                ) : (
                                  <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40" />
                                )}
                                <span className="truncate">{listing.name}</span>
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap max-w-[180px] truncate" title={listing.address || ''}>
                              {listing.address || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                              {listing.city}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">
                              {listing.state}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">
                              {listing.zip || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <TouchlessBadge listing={listing} />
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={listingUrl(listing)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="View our listing page"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </a>
                                {(listing.website || listing.location_page_url) && (
                                  <a
                                    href={listing.location_page_url || listing.website || ''}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                    title="View location website"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              {enrichingLocation === listing.id ? (
                                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-xs animate-pulse gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Enriching…
                                </Badge>
                              ) : enrichResults[listing.id] ? (
                                <button
                                  onClick={() => handleEnrich(listing)}
                                  title="Re-run enrichment"
                                  className="inline-flex items-center"
                                >
                                  <Badge
                                    variant="outline"
                                    className={`text-xs cursor-pointer transition-colors gap-1 ${
                                      enrichResults[listing.id].success
                                        ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                                        : 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100'
                                    }`}
                                  >
                                    {enrichResults[listing.id].success ? (
                                      <><CheckCircle2 className="w-3 h-3" />Done</>
                                    ) : (
                                      <><RotateCw className="w-3 h-3" />Retry</>
                                    )}
                                  </Badge>
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleEnrich(listing)}
                                    disabled={enrichingLocation !== null}
                                    className="inline-flex items-center"
                                    title={listing.website ? 'Enrich from website (scrape + classify + photos)' : 'Enrich from Google Places (photos + hours)'}
                                  >
                                    <Badge
                                      variant="outline"
                                      className={`text-xs cursor-pointer transition-colors gap-1 ${
                                        enrichingLocation !== null
                                          ? 'opacity-40 cursor-not-allowed'
                                          : listing.website
                                            ? 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100'
                                            : 'border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100'
                                      }`}
                                    >
                                      <Zap className="w-3 h-3" />
                                      {listing.website ? 'Website' : 'Google'}
                                    </Badge>
                                  </button>
                                  <button
                                    onClick={() => handleFullEnrichSingle(listing)}
                                    disabled={enrichingLocation !== null}
                                    className="inline-flex items-center"
                                    title="Full Enrich: Google data + photos + description"
                                  >
                                    <Badge
                                      variant="outline"
                                      className={`text-xs cursor-pointer transition-colors gap-1 ${
                                        enrichingLocation !== null
                                          ? 'opacity-40 cursor-not-allowed'
                                          : 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                                      }`}
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      Full
                                    </Badge>
                                  </button>
                                  <button
                                    onClick={() => handleMineNow(listing)}
                                    disabled={miningLocation === listing.id}
                                    className="inline-flex items-center"
                                    title="Mine reviews now: free Playwright harvest → label → Touchless Satisfaction Score (~few min)"
                                  >
                                    <Badge
                                      variant="outline"
                                      className={`text-xs cursor-pointer transition-colors gap-1 ${
                                        miningLocation === listing.id
                                          ? 'opacity-40 cursor-not-allowed'
                                          : 'border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100'
                                      }`}
                                    >
                                      {miningLocation === listing.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                                      Mine
                                    </Badge>
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => handleDeleteLocation(listing)}
                                disabled={deletingLocation === listing.id}
                                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete this location"
                              >
                                {deletingLocation === listing.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {editingListing && (
        <FullEditListingPanel
          listing={editingListing}
          open={!!editingListing}
          onClose={() => setEditingListing(null)}
          onSaved={handleListingEdited}
        />
      )}

      {showAddLocation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">Add Location</h2>
              <button onClick={() => setShowAddLocation(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <Input placeholder="e.g. Mister Car Wash - Austin" value={listingForm.name} onChange={(e) => setListingForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address <span className="text-xs text-gray-400 font-normal ml-1">Paste a full address to auto-fill city, state &amp; zip</span></label>
                <Input
                  placeholder="12570 Warwick Blvd, Newport News, VA 23606"
                  value={listingForm.address}
                  onChange={(e) => setListingForm((f) => ({ ...f, address: e.target.value }))}
                  onPaste={(e) => {
                    // Wait for the paste to complete, then try to parse
                    setTimeout(() => {
                      const val = (e.target as HTMLInputElement).value;
                      const parsed = parseFullAddress(val);
                      if (parsed) {
                        setListingForm((f) => ({
                          ...f,
                          address: parsed.street,
                          city: f.city || parsed.city,
                          state: f.state || parsed.state,
                          zip: f.zip || parsed.zip,
                        }));
                      }
                    }, 0);
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    // Only auto-parse if city is still empty (user hasn't filled it manually)
                    if (val && !listingForm.city) {
                      const parsed = parseFullAddress(val);
                      if (parsed) {
                        setListingForm((f) => ({
                          ...f,
                          address: parsed.street,
                          city: parsed.city,
                          state: parsed.state,
                          zip: parsed.zip,
                        }));
                      }
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
                  <Input placeholder="Austin" value={listingForm.city} onChange={(e) => setListingForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
                  <Input placeholder="TX" maxLength={2} value={listingForm.state} onChange={(e) => setListingForm((f) => ({ ...f, state: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                  <Input placeholder="78701" value={listingForm.zip} onChange={(e) => setListingForm((f) => ({ ...f, zip: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <Input placeholder="(555) 555-5555" value={listingForm.phone} onChange={(e) => setListingForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <Input placeholder="https://..." value={listingForm.website} onChange={(e) => setListingForm((f) => ({ ...f, website: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <Input placeholder="30.2672" type="number" step="any" value={listingForm.latitude} onChange={(e) => setListingForm((f) => ({ ...f, latitude: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <Input placeholder="-97.7431" type="number" step="any" value={listingForm.longitude} onChange={(e) => setListingForm((f) => ({ ...f, longitude: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <Button variant="outline" onClick={() => setShowAddLocation(false)} disabled={addingLocation}>Cancel</Button>
              <Button onClick={handleAddLocation} disabled={addingLocation} className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-2">
                {addingLocation ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><Check className="w-4 h-4" />Add Location</>}
              </Button>
            </div>
          </div>
        </div>
      )}
      {photoEditListing && (
        <PhotoEditModal
          listing={photoEditListing}
          open={!!photoEditListing}
          onClose={() => setPhotoEditListingId(null)}
          onUpdate={(updated) => handlePhotoUpdate(photoEditListing.id, updated)}
        />
      )}
    </div>
  );
}
