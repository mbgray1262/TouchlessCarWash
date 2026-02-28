'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Building2, Link2, Globe, ChevronDown, ChevronUp, X, Check, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { AdminNav } from '@/components/AdminNav';

interface Vendor {
  id: number;
  canonical_name: string;
  domain: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  is_chain: boolean;
  created_at: string;
  updated_at: string;
  listing_count: number;
}

interface VendorFormData {
  canonical_name: string;
  domain: string;
  website: string;
  logo_url: string;
  description: string;
  is_chain: boolean;
}

const emptyForm: VendorFormData = {
  canonical_name: '',
  domain: '',
  website: '',
  logo_url: '',
  description: '',
  is_chain: false,
};

export default function AdminVendorsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filtered, setFiltered] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [chainFilter, setChainFilter] = useState<'all' | 'chain' | 'standalone'>('all');
  const [sortField, setSortField] = useState<'canonical_name' | 'listing_count'>('canonical_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<VendorFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchVendors(); }, []);

  useEffect(() => {
    let result = [...vendors];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (v) => v.canonical_name.toLowerCase().includes(q) || (v.domain ?? '').toLowerCase().includes(q)
      );
    }
    if (chainFilter === 'chain') result = result.filter((v) => v.is_chain);
    if (chainFilter === 'standalone') result = result.filter((v) => !v.is_chain);
    result.sort((a, b) => {
      const valA = sortField === 'canonical_name' ? a.canonical_name.toLowerCase() : a.listing_count;
      const valB = sortField === 'canonical_name' ? b.canonical_name.toLowerCase() : b.listing_count;
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    setFiltered(result);
  }, [vendors, searchQuery, chainFilter, sortField, sortDir]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*, listings(id, is_touchless)')
        .order('canonical_name', { ascending: true });
      if (error) throw error;
      const withCounts = (data || [])
        .map((v: any) => ({
          ...v,
          listing_count: Array.isArray(v.listings) ? v.listings.filter((l: any) => l.is_touchless).length : 0,
          listings: undefined,
        }))
        .filter((v: any) => v.listing_count > 0);
      setVendors(withCounts);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load vendors', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.canonical_name.trim()) {
      toast({ title: 'Validation Error', description: 'Canonical name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('vendors').insert({
        canonical_name: formData.canonical_name.trim(),
        domain: formData.domain.trim() || null,
        website: formData.website.trim() || null,
        logo_url: formData.logo_url.trim() || null,
        description: formData.description.trim() || null,
        is_chain: formData.is_chain,
      }).select().single();
      if (error) throw error;
      toast({ title: 'Created', description: `${formData.canonical_name} added` });
      setShowForm(false);
      setFormData(emptyForm);
      router.push(`/admin/vendors/${data.id}`);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to create vendor', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir(field === 'canonical_name' ? 'asc' : 'desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const chainCount = vendors.filter((v) => v.is_chain).length;
  const standaloneCount = vendors.filter((v) => !v.is_chain).length;
  const totalListings = vendors.reduce((s, v) => s + v.listing_count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin/listings" className="hover:text-gray-700">Admin</Link>
              <span>/</span>
              <span className="text-gray-900 font-medium">Vendors</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          </div>
          <Button onClick={() => { setFormData(emptyForm); setShowForm(true); }} className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-2">
            <Plus className="w-4 h-4" />
            Create Vendor
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Vendors', value: vendors.length },
            { label: 'Chains', value: chainCount },
            { label: 'Standalone', value: standaloneCount },
            { label: 'Linked Listings', value: totalListings },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-4">
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name or domain..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'chain', 'standalone'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={chainFilter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChainFilter(f)}
                    className={chainFilter === f ? 'bg-[#0F2744] text-white' : ''}
                  >
                    {f === 'all' ? 'All' : f === 'chain' ? 'Chains' : 'Standalone'}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <button className="flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort('canonical_name')}>
                        Vendor <SortIcon field="canonical_name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Domain</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <button className="flex items-center gap-1 hover:text-gray-900" onClick={() => toggleSort('listing_count')}>
                        Locations <SortIcon field="listing_count" />
                      </button>
                    </th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading vendors...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400">
                        {vendors.length === 0 ? (
                          <div>
                            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p>No vendors yet. Click &ldquo;Create Vendor&rdquo; to get started.</p>
                          </div>
                        ) : 'No vendors match your search.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((vendor) => (
                      <tr
                        key={vendor.id}
                        className="border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/admin/vendors/${vendor.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {vendor.logo_url ? (
                              <img src={vendor.logo_url} alt={vendor.canonical_name} className="w-8 h-8 rounded object-contain bg-gray-100 border flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 border flex items-center justify-center flex-shrink-0">
                                <Building2 className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <span className="font-medium text-gray-900">{vendor.canonical_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {vendor.domain ? (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Link2 className="w-3 h-3 flex-shrink-0" />
                              <span className="font-mono text-xs">{vendor.domain}</span>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <Badge variant="outline" className={vendor.is_chain ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-600'}>
                            {vendor.is_chain ? 'Chain' : 'Standalone'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{vendor.listing_count}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-2 border-t text-xs text-gray-400">
                Showing {filtered.length} of {vendors.length} vendors
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Create Vendor</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Canonical Name <span className="text-red-500">*</span></label>
                <Input placeholder="e.g. Mister Car Wash" value={formData.canonical_name} onChange={(e) => setFormData((f) => ({ ...f, canonical_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                <Input placeholder="e.g. mistercarwash.com" value={formData.domain} onChange={(e) => setFormData((f) => ({ ...f, domain: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                <Input placeholder="https://..." value={formData.website} onChange={(e) => setFormData((f) => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <Input placeholder="https://..." value={formData.logo_url} onChange={(e) => setFormData((f) => ({ ...f, logo_url: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  rows={3}
                  placeholder="Brief description..."
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((f) => ({ ...f, is_chain: !f.is_chain }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.is_chain ? 'bg-[#0F2744]' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${formData.is_chain ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
                <label className="text-sm font-medium text-gray-700">Is a chain / franchise</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Check className="w-4 h-4" />Create &amp; Edit</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
