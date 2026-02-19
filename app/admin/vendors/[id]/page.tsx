'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Loader2, Plus, X, Check, CheckCircle2, XCircle, ExternalLink, MapPin, Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

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
  address: string;
  city: string;
  state: string;
  zip: string;
  is_touchless: boolean | null;
  crawl_status: string | null;
  website: string | null;
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

  const [form, setForm] = useState({
    canonical_name: '',
    domain: '',
    website: '',
    logo_url: '',
    description: '',
    is_chain: false,
  });

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
          .select('id, name, address, city, state, zip, is_touchless, crawl_status, website')
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
        .select('id, name, address, city, state, zip, is_touchless, crawl_status, website')
        .single();

      if (error) throw error;
      setListings((prev) => [...prev, data as VendorListing].sort((a, b) => `${a.state}${a.city}`.localeCompare(`${b.state}${b.city}`)));
      setListingForm(emptyListingForm);
      setShowAddLocation(false);
      toast({ title: 'Location added', description: `${listingForm.name} created and linked to this vendor` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to add location', variant: 'destructive' });
    } finally {
      setAddingLocation(false);
    }
  };

  const getTouchlessBadge = (is_touchless: boolean | null) => {
    if (is_touchless === true) return <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 text-xs">Touchless</Badge>;
    if (is_touchless === false) return <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-xs">Not Touchless</Badge>;
    return <Badge variant="outline" className="border-gray-200 text-gray-500 text-xs">Unknown</Badge>;
  };

  const getStatusBadge = (status: string | null, website: string | null) => {
    if (!website) return <Badge variant="outline" className="border-gray-200 text-gray-500 text-xs">No Website</Badge>;
    if (status === 'crawled') return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
    if (status === 'failed') return <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50 text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    return <Badge variant="outline" className="border-yellow-200 text-yellow-700 bg-yellow-50 text-xs">Pending</Badge>;
  };

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
      <div className="max-w-5xl mx-auto px-4 py-8">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Locations
                    <span className="ml-2 text-sm font-normal text-gray-400">({listings.length})</span>
                  </CardTitle>
                  <Button
                    onClick={() => { setListingForm(emptyListingForm); setShowAddLocation(true); }}
                    size="sm"
                    className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Location
                  </Button>
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
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Location</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600 hidden sm:table-cell">Status</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600 hidden md:table-cell">Touchless</th>
                          <th className="px-4 py-2.5 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {listings.map((listing) => (
                          <tr key={listing.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/listings`}
                                className="font-medium text-[#0F2744] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {listing.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">
                              {listing.city}, {listing.state}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {getStatusBadge(listing.crawl_status, listing.website)}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {getTouchlessBadge(listing.is_touchless)}
                            </td>
                            <td className="px-4 py-3">
                              {listing.website && (
                                <a href={listing.website} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
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
    </div>
  );
}
