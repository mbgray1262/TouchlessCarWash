'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Save, Loader2, Plus, X, Check, CheckCircle2, XCircle, ExternalLink, MapPin, Trash2, Globe, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Eye, Zap, RotateCw, Pencil, Camera, ZoomIn } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  street_view_url: string | null;
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
  const [enrichingLocation, setEnrichingLocation] = useState<string | null>(null);
  const [enrichResults, setEnrichResults] = useState<Record<string, { success: boolean; steps: { name: string; status: string; detail?: string }[] }>>({});
  const [editingListing, setEditingListing] = useState<EditableFullListing | null>(null);
  const [loadingEditListing, setLoadingEditListing] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [streetViewHeroesRunning, setStreetViewHeroesRunning] = useState(false);
  const [photoEditListingId, setPhotoEditListingId] = useState<string | null>(null);

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
          .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, street_view_url, photos')
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
      const { error } = await supabase
        .from('listings')
        .update({ is_touchless: next })
        .eq('id', listing.id);
      if (error) throw error;
      setListings((prev) => prev.map((l) => l.id === listing.id ? { ...l, is_touchless: next } : l));
      const label = next === true ? 'Touchless' : next === false ? 'Not Touchless' : 'Unknown';
      toast({ title: 'Updated', description: `${listing.name} set to ${label}` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setTogglingTouchless(null);
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
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, street_view_url, photos')
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
      hero_image: (updated as unknown as Record<string, unknown>).hero_image as string | null,
      street_view_url: (updated as unknown as Record<string, unknown>).street_view_url as string | null,
      photos: (updated as unknown as Record<string, unknown>).photos as string[] | null,
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
      if (prev.size === displayListings.length && displayListings.length > 0) return new Set();
      return new Set(displayListings.map(l => l.id));
    });
  }, [displayListings]);

  const handleStreetViewHeroes = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Set street view as hero for ${selectedIds.size} selected location(s)? This will replace existing heroes.`)) return;

    setStreetViewHeroesRunning(true);
    try {
      const res = await fetch('/api/street-view-heroes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_ids: Array.from(selectedIds) }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: 'Error', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }

      // Refresh listings data
      const { data: refreshed } = await supabase
        .from('listings')
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, street_view_url, photos')
        .eq('vendor_id', vendorId)
        .order('state', { ascending: true })
        .order('city', { ascending: true });

      if (refreshed) {
        setListings(refreshed as VendorListing[]);
      }

      setSelectedIds(new Set());

      const parts: string[] = [];
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped (no street view)`);
      if (data.errors > 0) parts.push(`${data.errors} errors`);

      toast({
        title: data.errors === 0 ? 'Street View Heroes Updated' : 'Partial Update',
        description: parts.join(', '),
        variant: data.errors > 0 ? 'destructive' : undefined,
      });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to update heroes', variant: 'destructive' });
    } finally {
      setStreetViewHeroesRunning(false);
    }
  };

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
        .select('id, name, slug, address, city, state, zip, is_touchless, crawl_status, website, location_page_url, hero_image, street_view_url, photos')
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
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vendor Details</CardTitle>
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

          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base">
                    Locations
                    <span className="ml-2 text-sm font-normal text-gray-400">
                      ({stateFilter ? `${displayListings.length} of ${listings.length}` : listings.length})
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && (
                      <Button
                        onClick={handleStreetViewHeroes}
                        disabled={streetViewHeroesRunning}
                        size="sm"
                        variant="outline"
                        className="gap-1 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                      >
                        {streetViewHeroesRunning ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Processing...</>
                        ) : (
                          <><Camera className="w-4 h-4" />Street View Heroes ({selectedIds.size})</>
                        )}
                      </Button>
                    )}
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
                      onClick={() => { setListingForm(emptyListingForm); setShowAddLocation(true); }}
                      size="sm"
                      className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Location
                    </Button>
                  </div>
                </div>
              </CardHeader>
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
                          <th className="px-4 py-2.5 w-10">
                            <Checkbox
                              checked={selectedIds.size === displayListings.length && displayListings.length > 0 ? true : selectedIds.size > 0 ? 'indeterminate' : false}
                              onCheckedChange={toggleSelectAll}
                            />
                          </th>
                          <th className="px-2 py-2.5 w-14 font-medium text-gray-600 text-xs">Hero</th>
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
                            <td className="px-4 py-2.5 w-10">
                              <Checkbox
                                checked={selectedIds.has(listing.id)}
                                onCheckedChange={() => toggleSelect(listing.id)}
                              />
                            </td>
                            <td className="px-2 py-2.5 w-14">
                              <button
                                onClick={() => setPhotoEditListingId(listing.id)}
                                className="group/thumb relative cursor-pointer"
                                title="Click to edit photos"
                              >
                                {listing.hero_image ? (
                                  <div className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={listing.hero_image}
                                      alt={`${listing.name} hero`}
                                      className="w-14 h-10 rounded object-cover border border-gray-200 group-hover/thumb:border-blue-400 transition-colors"
                                    />
                                    <div className="absolute inset-0 rounded bg-black/0 group-hover/thumb:bg-black/30 flex items-center justify-center transition-colors">
                                      <ZoomIn className="w-3.5 h-3.5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity drop-shadow" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-14 h-10 rounded bg-gray-100 border border-gray-200 group-hover/thumb:border-blue-400 flex items-center justify-center transition-colors">
                                    <Camera className="w-3.5 h-3.5 text-gray-300 group-hover/thumb:text-blue-400 transition-colors" />
                                  </div>
                                )}
                                {(listing.photos?.length ?? 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">
                                    {listing.photos!.length}
                                  </span>
                                )}
                              </button>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <Input placeholder="123 Main St" value={listingForm.address} onChange={(e) => setListingForm((f) => ({ ...f, address: e.target.value }))} />
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
