'use client';

import { useState } from 'react';
import { X, Trash2, Save, Loader2, Plus, Clock, Wifi, Link2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export interface EditableListing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  hours: Record<string, string> | null;
  amenities: string[] | null;
  wash_packages: Array<{ name: string; price: string; description?: string }> | null;
  rating: number;
  review_count: number;
  parent_chain: string | null;
  location_page_url: string | null;
}

interface Props {
  listing: EditableListing;
  onClose: () => void;
  onSaved: (updated: EditableListing) => void;
  onDeleted: (id: string) => void;
}

export default function EditListingModal({ listing, onClose, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(listing.name);
  const [address, setAddress] = useState(listing.address);
  const [city, setCity] = useState(listing.city);
  const [state, setState] = useState(listing.state);
  const [zip, setZip] = useState(listing.zip);
  const [phone, setPhone] = useState(listing.phone || '');
  const [website, setWebsite] = useState(listing.website || '');
  const [hours, setHours] = useState<Record<string, string>>(listing.hours || {});
  const [amenities, setAmenities] = useState<string[]>(listing.amenities || []);
  const [newAmenity, setNewAmenity] = useState('');
  const [packages, setPackages] = useState<Array<{ name: string; price: string; description?: string }>>(
    listing.wash_packages || []
  );
  const [parentChain, setParentChain] = useState(listing.parent_chain || '');
  const [locationPageUrl, setLocationPageUrl] = useState(listing.location_page_url || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        phone: phone.trim() || null,
        website: website.trim() || null,
        hours: Object.keys(hours).length > 0 ? hours : null,
        amenities: amenities.length > 0 ? amenities : [],
        wash_packages: packages.length > 0 ? packages : [],
        parent_chain: parentChain.trim() || null,
        location_page_url: locationPageUrl.trim() || null,
      };

      const { error } = await supabase.from('listings').update(updates).eq('id', listing.id);
      if (error) throw error;

      onSaved({ ...listing, ...updates });
      toast({ title: 'Saved', description: `${name} has been updated.` });
      onClose();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from('listings').delete().eq('id', listing.id);
      if (error) throw error;
      onDeleted(listing.id);
      toast({ title: 'Deleted', description: `${listing.name} has been removed.` });
      onClose();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const setHoursDay = (day: string, value: string) => {
    setHours((prev) => {
      if (!value.trim()) {
        const next = { ...prev };
        delete next[day];
        return next;
      }
      return { ...prev, [day]: value };
    });
  };

  const addAmenity = () => {
    const val = newAmenity.trim();
    if (val && !amenities.includes(val)) {
      setAmenities((prev) => [...prev, val]);
    }
    setNewAmenity('');
  };

  const removeAmenity = (a: string) => setAmenities((prev) => prev.filter((x) => x !== a));

  const addPackage = () =>
    setPackages((prev) => [...prev, { name: '', price: '', description: '' }]);

  const updatePackage = (
    idx: number,
    field: 'name' | 'price' | 'description',
    value: string
  ) => {
    setPackages((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const removePackage = (idx: number) =>
    setPackages((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#0F2744]">Edit Listing</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Basic Info
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Label className="text-sm">City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">State</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} className="mt-1" maxLength={2} />
                </div>
                <div>
                  <Label className="text-sm">ZIP</Label>
                  <Input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="mt-1"
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="(555) 555-5555" />
                </div>
                <div>
                  <Label className="text-sm">Website</Label>
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} className="mt-1" placeholder="https://..." />
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Chain / Multi-Location
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Chain Name</Label>
                <Input
                  value={parentChain}
                  onChange={(e) => setParentChain(e.target.value)}
                  className="mt-1"
                  placeholder="e.g. Golden Nozzle Car Wash (leave blank if independent)"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Set this to the brand name if this is one of multiple locations operated under the same chain.
                </p>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Location-Specific URL
                </Label>
                <Input
                  value={locationPageUrl}
                  onChange={(e) => setLocationPageUrl(e.target.value)}
                  className="mt-1"
                  placeholder="https://brand.com/locations/this-city"
                />
                <p className="text-xs text-gray-400 mt-1">
                  If this location has its own page on the chain's website, paste it here. This URL will be used when crawling for hours and touchless info instead of the root website.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Hours of Operation
            </h3>
            <div className="space-y-2">
              {DAY_ORDER.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-gray-600 shrink-0">{DAY_LABELS[day]}</span>
                  <Input
                    value={hours[day] || ''}
                    onChange={(e) => setHoursDay(day, e.target.value)}
                    placeholder="e.g. 7am–9pm or Closed"
                    className="text-sm h-8"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Wifi className="w-4 h-4" /> Amenities
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {amenities.map((a) => (
                <Badge
                  key={a}
                  variant="secondary"
                  className="flex items-center gap-1 cursor-pointer hover:bg-red-100 hover:text-red-700 transition-colors"
                  onClick={() => removeAmenity(a)}
                >
                  {a}
                  <X className="w-3 h-3" />
                </Badge>
              ))}
              {amenities.length === 0 && (
                <span className="text-sm text-gray-400">No amenities added yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newAmenity}
                onChange={(e) => setNewAmenity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAmenity();
                  }
                }}
                placeholder="Add amenity..."
                className="text-sm h-8"
              />
              <Button size="sm" variant="outline" onClick={addAmenity} className="h-8">
                <Plus className="w-3.5 h-3.5 mr-1" />Add
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Wash Packages
            </h3>
            <div className="space-y-3">
              {packages.map((pkg, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium">Package {idx + 1}</span>
                    <button
                      onClick={() => removePackage(idx)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">Name</Label>
                      <Input
                        value={pkg.name}
                        onChange={(e) => updatePackage(idx, 'name', e.target.value)}
                        className="h-8 text-sm mt-0.5"
                        placeholder="e.g. Full Service"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Price</Label>
                      <Input
                        value={pkg.price}
                        onChange={(e) => updatePackage(idx, 'price', e.target.value)}
                        className="h-8 text-sm mt-0.5"
                        placeholder="e.g. $12.99"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Description (optional)</Label>
                    <Input
                      value={pkg.description || ''}
                      onChange={(e) => updatePackage(idx, 'description', e.target.value)}
                      className="h-8 text-sm mt-0.5"
                      placeholder="Brief description..."
                    />
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addPackage} className="w-full h-8 border-dashed">
                <Plus className="w-3.5 h-3.5 mr-1" />Add Package
              </Button>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div>
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />Delete Listing
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700 font-medium">Are you sure?</span>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yes, delete'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0F2744] hover:bg-[#1a3a5c] text-white"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
