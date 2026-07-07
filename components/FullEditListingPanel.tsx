'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Plus, X, Trash2, Clock, Wifi, Building2, MapPin, Camera, Shield, FileText, Star, Upload, Crop as CropIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { CropModal } from '@/app/admin/hero-review/CropModal';
import { EQUIPMENT_BRANDS, EQUIPMENT_MODELS } from '@/app/admin/hero-review/types';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export interface EditableFullListing {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  description: string | null;
  hours: Record<string, string> | null;
  amenities: string[];
  wash_packages: Array<{ name: string; price: string; description?: string }>;
  photos: string[];
  rating: number;
  review_count: number;
  is_approved: boolean;
  is_featured: boolean;
  is_touchless: boolean | null;
  is_claimed: boolean;
  latitude: number | null;
  longitude: number | null;
  hero_image: string | null;
  hero_focal_point: 'top' | 'center' | 'bottom' | null;
  logo_photo: string | null;
  street_view_url: string | null;
  parent_chain: string | null;
  location_page_url: string | null;
  equipment_brand: string | null;
  equipment_model: string | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  google_description: string | null;
  booking_url: string | null;
  touchless_wash_types: string[] | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  crawl_status: string | null;
}

interface Props {
  listing: EditableFullListing;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: EditableFullListing) => void;
}

export default function FullEditListingPanel({ listing, open, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Simple form fields
  const [form, setForm] = useState({
    name: listing.name,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    phone: listing.phone || '',
    website: listing.website || '',
    description: listing.description || '',
    latitude: listing.latitude?.toString() || '',
    longitude: listing.longitude?.toString() || '',
    location_page_url: listing.location_page_url || '',
    parent_chain: listing.parent_chain || '',
    equipment_brand: listing.equipment_brand || '',
    equipment_model: listing.equipment_model || '',
    google_place_id: listing.google_place_id || '',
    google_maps_url: listing.google_maps_url || '',
    google_description: listing.google_description || '',
    booking_url: listing.booking_url || '',
    rating: listing.rating.toString(),
    review_count: listing.review_count.toString(),
    hero_image: listing.hero_image || '',
    hero_focal_point: listing.hero_focal_point || '',
    logo_photo: listing.logo_photo || '',
    street_view_url: listing.street_view_url || '',
  });

  // Boolean states
  const [isTouchless, setIsTouchless] = useState(listing.is_touchless);
  const [isApproved, setIsApproved] = useState(listing.is_approved);
  const [isFeatured, setIsFeatured] = useState(listing.is_featured);
  const [isClaimed, setIsClaimed] = useState(listing.is_claimed);

  // Complex fields
  const [hours, setHours] = useState<Record<string, string>>(listing.hours || {});
  const [amenities, setAmenities] = useState<string[]>(listing.amenities || []);
  const [newAmenity, setNewAmenity] = useState('');
  const [packages, setPackages] = useState<Array<{ name: string; price: string; description?: string }>>(
    listing.wash_packages || []
  );
  const [photos, setPhotos] = useState<string[]>(listing.photos || []);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [croppingPhoto, setCroppingPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [touchlessWashTypes, setTouchlessWashTypes] = useState<string[]>(listing.touchless_wash_types || []);
  const [newWashType, setNewWashType] = useState('');
  const [showExtractedData, setShowExtractedData] = useState(false);

  // Reset when listing changes
  useEffect(() => {
    setForm({
      name: listing.name,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
      phone: listing.phone || '',
      website: listing.website || '',
      description: listing.description || '',
      latitude: listing.latitude?.toString() || '',
      longitude: listing.longitude?.toString() || '',
      location_page_url: listing.location_page_url || '',
      parent_chain: listing.parent_chain || '',
      equipment_brand: listing.equipment_brand || '',
      equipment_model: listing.equipment_model || '',
      google_place_id: listing.google_place_id || '',
      google_maps_url: listing.google_maps_url || '',
      google_description: listing.google_description || '',
      booking_url: listing.booking_url || '',
      rating: listing.rating.toString(),
      review_count: listing.review_count.toString(),
      hero_image: listing.hero_image || '',
      hero_focal_point: listing.hero_focal_point || '',
      logo_photo: listing.logo_photo || '',
      street_view_url: listing.street_view_url || '',
    });
    setIsTouchless(listing.is_touchless);
    setIsApproved(listing.is_approved);
    setIsFeatured(listing.is_featured);
    setIsClaimed(listing.is_claimed);
    setHours(listing.hours || {});
    setAmenities(listing.amenities || []);
    setNewAmenity('');
    setPackages(listing.wash_packages || []);
    setPhotos(listing.photos || []);
    setUploadingPhotos(false);
    setUploadProgress(null);
    setCroppingPhoto(null);
    setTouchlessWashTypes(listing.touchless_wash_types || []);
    setNewWashType('');
    setShowExtractedData(false);
    setSaving(false);
  }, [listing.id]);

  const updateField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Hours helpers
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

  // Amenities helpers
  const addAmenity = () => {
    const val = newAmenity.trim();
    if (val && !amenities.includes(val)) setAmenities((prev) => [...prev, val]);
    setNewAmenity('');
  };
  const removeAmenity = (a: string) => setAmenities((prev) => prev.filter((x) => x !== a));

  // Wash types helpers
  const addWashType = () => {
    const val = newWashType.trim();
    if (val && !touchlessWashTypes.includes(val)) setTouchlessWashTypes((prev) => [...prev, val]);
    setNewWashType('');
  };
  const removeWashType = (t: string) => setTouchlessWashTypes((prev) => prev.filter((x) => x !== t));

  // Packages helpers
  const addPackage = () => setPackages((prev) => [...prev, { name: '', price: '', description: '' }]);
  const updatePackage = (idx: number, field: 'name' | 'price' | 'description', value: string) =>
    setPackages((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const removePackage = (idx: number) => setPackages((prev) => prev.filter((_, i) => i !== idx));

  // Photos helpers
  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((p) => p !== url));
    if (form.hero_image === url) updateField('hero_image', '');
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        let { width, height } = img;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    const newUrls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Uploading ${i + 1}/${files.length}...`);
        const compressed = await compressImage(files[i]);
        const fd = new FormData();
        fd.append('file', compressed, `upload-${Date.now()}-${i}.jpg`);
        fd.append('listingId', listing.id);
        fd.append('type', 'gallery');
        const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
        if (res.ok) {
          const { url } = await res.json();
          newUrls.push(url);
        }
      }
      if (newUrls.length > 0) setPhotos((prev) => [...prev, ...newUrls]);
    } catch {
      toast({ title: 'Upload failed', description: 'One or more images failed to upload.', variant: 'destructive' });
    } finally {
      setUploadingPhotos(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetHero = (url: string) => {
    updateField('hero_image', form.hero_image === url ? '' : url);
  };

  const handleCropSave = (croppedUrl: string) => {
    if (croppingPhoto) {
      setPhotos((prev) => prev.map((p) => (p === croppingPhoto ? croppedUrl : p)));
      if (form.hero_image === croppingPhoto) updateField('hero_image', croppedUrl);
    }
    setCroppingPhoto(null);
  };

  // Touchless tri-state
  const cycleTouchless = () => {
    setIsTouchless((prev) => (prev === true ? false : prev === false ? null : true));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updates = {
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip: form.zip.trim(),
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        description: form.description.trim() || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        location_page_url: form.location_page_url.trim() || null,
        parent_chain: form.parent_chain.trim() || null,
        equipment_brand: (form.equipment_brand.trim() && form.equipment_brand.trim() !== '__other__') ? form.equipment_brand.trim() : null,
        equipment_model: (form.equipment_model.trim() && form.equipment_model.trim() !== '__other__') ? form.equipment_model.trim() : null,
        google_place_id: form.google_place_id.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
        google_description: form.google_description.trim() || null,
        booking_url: form.booking_url.trim() || null,
        hero_image: form.hero_image.trim() || null,
        hero_focal_point: (form.hero_focal_point as 'top' | 'center' | 'bottom') || null,
        logo_photo: form.logo_photo.trim() || null,
        street_view_url: form.street_view_url.trim() || null,
        rating: parseFloat(form.rating) || 0,
        review_count: parseInt(form.review_count, 10) || 0,
        is_touchless: isTouchless,
        is_approved: isApproved,
        is_featured: isFeatured,
        is_claimed: isClaimed,
        hours: Object.keys(hours).length > 0 ? hours : null,
        amenities: amenities.length > 0 ? amenities : [],
        wash_packages: packages.length > 0 ? packages : [],
        photos,
        touchless_wash_types: touchlessWashTypes.length > 0 ? touchlessWashTypes : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('listings').update(updates).eq('id', listing.id);
      if (error) throw error;

      // Bust the CDN/ISR cache for this listing's public page so the edit shows
      // up immediately instead of being masked by the cached page for up to an
      // hour (the listing page is on a 1-hour ISR window). Fire-and-forget —
      // never block or fail the save on this.
      if (listing.slug && listing.city && listing.state) {
        const path = `/state/${getStateSlug(listing.state)}/${slugify(listing.city)}/${listing.slug}`;
        fetch('/api/revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        }).catch(() => {});
      }

      onSaved({ ...listing, ...updates } as EditableFullListing);
      toast({ title: 'Saved', description: `${form.name} has been updated.` });
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

  const touchlessLabel = isTouchless === true ? 'Touchless' : isTouchless === false ? 'Not Touchless' : 'Unknown';
  const touchlessCls =
    isTouchless === true
      ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
      : isTouchless === false
        ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
        : 'border-gray-200 text-gray-500 hover:bg-gray-100';

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="!max-w-2xl !w-full sm:!max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-[#0F2744]">Edit Listing</SheetTitle>
          <SheetDescription>{listing.name} &mdash; {listing.city}, {listing.state}</SheetDescription>
        </SheetHeader>

        <Accordion type="multiple" defaultValue={['basic-info', 'status']} className="mt-4">
          {/* ───────── Basic Info ───────── */}
          <AccordionItem value="basic-info">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /> Basic Info</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Name</Label>
                  <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Address</Label>
                  <Input value={form.address} onChange={(e) => updateField('address', e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">City</Label>
                    <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">State</Label>
                    <Input value={form.state} onChange={(e) => updateField('state', e.target.value)} className="mt-1" maxLength={2} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">ZIP</Label>
                    <Input value={form.zip} onChange={(e) => updateField('zip', e.target.value)} className="mt-1" maxLength={10} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Phone</Label>
                    <Input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} className="mt-1" placeholder="(555) 555-5555" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Website</Label>
                    <Input value={form.website} onChange={(e) => updateField('website', e.target.value)} className="mt-1" placeholder="https://..." />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Chain Name</Label>
                  <Input value={form.parent_chain} onChange={(e) => updateField('parent_chain', e.target.value)} className="mt-1" placeholder="Leave blank if independent" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Location-Specific URL</Label>
                  <Input value={form.location_page_url} onChange={(e) => updateField('location_page_url', e.target.value)} className="mt-1" placeholder="https://brand.com/locations/this-city" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Description ───────── */}
          <AccordionItem value="description">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Description</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Business Description</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    rows={5}
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Describe this car wash..."
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Google Description (read-only)</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-input bg-gray-50 px-3 py-2 text-sm text-gray-500 resize-none"
                    rows={3}
                    value={form.google_description}
                    readOnly
                    placeholder="(populated by enrichment)"
                  />
                </div>
                {listing.extracted_data && (
                  <div>
                    <button
                      onClick={() => setShowExtractedData((prev) => !prev)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showExtractedData ? 'Hide' : 'View'} Extracted Data (read-only)
                    </button>
                    {showExtractedData && (
                      <pre className="mt-2 p-3 bg-gray-50 rounded-lg border text-xs text-gray-600 overflow-x-auto max-h-60 overflow-y-auto">
                        {JSON.stringify(listing.extracted_data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Location ───────── */}
          <AccordionItem value="location">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Location</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Latitude</Label>
                    <Input value={form.latitude} onChange={(e) => updateField('latitude', e.target.value)} className="mt-1" type="number" step="any" placeholder="30.2672" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Longitude</Label>
                    <Input value={form.longitude} onChange={(e) => updateField('longitude', e.target.value)} className="mt-1" type="number" step="any" placeholder="-97.7431" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Google Place ID</Label>
                  <Input value={form.google_place_id} onChange={(e) => updateField('google_place_id', e.target.value)} className="mt-1" placeholder="ChIJ..." />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Google Maps URL</Label>
                  <Input value={form.google_maps_url} onChange={(e) => updateField('google_maps_url', e.target.value)} className="mt-1" placeholder="https://maps.google.com/..." />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Booking URL</Label>
                  <Input value={form.booking_url} onChange={(e) => updateField('booking_url', e.target.value)} className="mt-1" placeholder="https://..." />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Hours ───────── */}
          <AccordionItem value="hours">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Hours of Operation</span>
            </AccordionTrigger>
            <AccordionContent>
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
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Amenities & Services ───────── */}
          <AccordionItem value="amenities-services">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><Wifi className="w-4 h-4 text-gray-400" /> Amenities & Services</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-5">
                {/* Amenities */}
                <div>
                  <Label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Amenities</Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-2">
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
                    {amenities.length === 0 && <span className="text-sm text-gray-400">No amenities</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newAmenity}
                      onChange={(e) => setNewAmenity(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAmenity(); } }}
                      placeholder="Add amenity..."
                      className="text-sm h-8"
                    />
                    <Button size="sm" variant="outline" onClick={addAmenity} className="h-8">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add
                    </Button>
                  </div>
                </div>

                {/* Touchless Wash Types */}
                <div>
                  <Label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Touchless Wash Types</Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-2">
                    {touchlessWashTypes.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="flex items-center gap-1 cursor-pointer hover:bg-red-100 hover:text-red-700 transition-colors"
                        onClick={() => removeWashType(t)}
                      >
                        {t}
                        <X className="w-3 h-3" />
                      </Badge>
                    ))}
                    {touchlessWashTypes.length === 0 && <span className="text-sm text-gray-400">None specified</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newWashType}
                      onChange={(e) => setNewWashType(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWashType(); } }}
                      placeholder="Add wash type..."
                      className="text-sm h-8"
                    />
                    <Button size="sm" variant="outline" onClick={addWashType} className="h-8">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add
                    </Button>
                  </div>
                </div>

                {/* Wash Packages */}
                <div>
                  <Label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Wash Packages</Label>
                  <div className="space-y-3 mt-2">
                    {packages.map((pkg, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 font-medium">Package {idx + 1}</span>
                          <button onClick={() => removePackage(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-500">Name</Label>
                            <Input value={pkg.name} onChange={(e) => updatePackage(idx, 'name', e.target.value)} className="h-8 text-sm mt-0.5" placeholder="e.g. Full Service" />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Price</Label>
                            <Input value={pkg.price} onChange={(e) => updatePackage(idx, 'price', e.target.value)} className="h-8 text-sm mt-0.5" placeholder="e.g. $12.99" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Description (optional)</Label>
                          <Input value={pkg.description || ''} onChange={(e) => updatePackage(idx, 'description', e.target.value)} className="h-8 text-sm mt-0.5" placeholder="Brief description..." />
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addPackage} className="w-full h-8 border-dashed">
                      <Plus className="w-3.5 h-3.5 mr-1" />Add Package
                    </Button>
                  </div>
                </div>

                {/* Equipment */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Equipment Brand</Label>
                    {(() => {
                      const allBrands = [...EQUIPMENT_BRANDS.filter(b => b.value !== 'other'), { value: '__other__', label: 'Other…' }];
                      const currentBrand = form.equipment_brand;
                      const isKnown = allBrands.some(b => b.value === currentBrand);
                      const showCustom = currentBrand === '__other__' || (currentBrand && !isKnown);
                      const selectVal = isKnown ? currentBrand : (currentBrand && currentBrand !== '__other__' ? '__other__' : '');

                      return (
                        <div className="mt-1 space-y-1">
                          <select
                            value={selectVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__other__') {
                                updateField('equipment_brand', '__other__');
                                updateField('equipment_model', '');
                              } else {
                                updateField('equipment_brand', val);
                                if (!val) updateField('equipment_model', '');
                              }
                            }}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                          >
                            <option value="">Select brand…</option>
                            {allBrands.map(b => (
                              <option key={b.value} value={b.value}>{b.label}</option>
                            ))}
                          </select>
                          {showCustom && (
                            <Input
                              value={currentBrand === '__other__' ? '' : currentBrand}
                              onChange={(e) => updateField('equipment_brand', e.target.value || '__other__')}
                              placeholder="Type brand name…"
                              className="text-sm"
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Equipment Model</Label>
                    {(() => {
                      const brand = form.equipment_brand;
                      const models = (brand && brand !== '__other__') ? (EQUIPMENT_MODELS[brand] || []) : [];
                      const currentModel = form.equipment_model;
                      const isKnown = models.includes(currentModel);
                      const showCustom = currentModel === '__other__' || (currentModel && !isKnown);
                      const selectVal = isKnown ? currentModel : (currentModel && currentModel !== '__other__' ? '__other__' : '');

                      if (!brand) {
                        return <Input value="" disabled className="mt-1 text-sm" placeholder="Select brand first" />;
                      }

                      return (
                        <div className="mt-1 space-y-1">
                          {models.length > 0 ? (
                            <select
                              value={selectVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateField('equipment_model', val === '__other__' ? '__other__' : val);
                              }}
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                            >
                              <option value="">Select model…</option>
                              {models.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              <option value="__other__">Other…</option>
                            </select>
                          ) : null}
                          {(showCustom || models.length === 0) && (
                            <Input
                              value={currentModel === '__other__' ? '' : currentModel}
                              onChange={(e) => updateField('equipment_model', e.target.value || (models.length > 0 ? '__other__' : ''))}
                              placeholder="Type model name…"
                              className="text-sm"
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Photos & Media ───────── */}
          <AccordionItem value="photos">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><Camera className="w-4 h-4 text-gray-400" /> Photos & Media</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* Current hero preview */}
                {form.hero_image && (
                  <div>
                    <Label className="text-xs text-gray-500">Current Hero Image</Label>
                    <div className="mt-1 relative">
                      <img src={form.hero_image} alt="Hero" className="w-full h-32 object-cover rounded-lg border" />
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-yellow-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5 fill-current" />Hero
                      </span>
                    </div>
                  </div>
                )}

                {/* Hero focal point */}
                <div>
                  <Label className="text-xs text-gray-500">Hero Focal Point</Label>
                  <select
                    value={form.hero_focal_point}
                    onChange={(e) => updateField('hero_focal_point', e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Auto</option>
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>

                {/* Gallery Photos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                      Gallery Photos ({photos.length})
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhotos}
                      className="h-7 text-xs"
                    >
                      {uploadingPhotos ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{uploadProgress || 'Uploading...'}</>
                      ) : (
                        <><Upload className="w-3 h-3 mr-1" />Upload</>
                      )}
                    </Button>
                  </div>

                  {photos.length === 0 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhotos}
                      className="w-full flex flex-col items-center py-8 text-gray-400 border-2 border-dashed rounded-lg hover:border-blue-300 hover:text-blue-500 transition-colors"
                    >
                      <Camera className="w-8 h-8 mb-2" />
                      <span className="text-xs">No photos yet &mdash; click to upload</span>
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((url, idx) => {
                      const isHero = form.hero_image === url;
                      return (
                        <div
                          key={idx}
                          className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isHero ? 'border-yellow-400 shadow-md shadow-yellow-100' : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent && !parent.querySelector('.broken-ph')) {
                                const ph = document.createElement('div');
                                ph.className = 'broken-ph w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs';
                                ph.textContent = 'Image unavailable';
                                parent.prepend(ph);
                              }
                            }}
                          />
                          {isHero && (
                            <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 bg-yellow-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full pointer-events-none">
                              <Star className="w-2.5 h-2.5 fill-current" />Hero
                            </span>
                          )}
                          {/* Hover action buttons */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={() => handleSetHero(url)}
                              title={isHero ? 'Unset hero' : 'Set as hero'}
                              className={`p-1.5 rounded-full transition-colors shadow ${
                                isHero
                                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                  : 'bg-white/90 text-yellow-600 hover:bg-yellow-50'
                              }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${isHero ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              onClick={() => setCroppingPhoto(url)}
                              title="Crop"
                              className="p-1.5 rounded-full bg-white/90 text-blue-600 hover:bg-blue-50 transition-colors shadow"
                            >
                              <CropIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removePhoto(url)}
                              title="Remove"
                              className="p-1.5 rounded-full bg-white/90 text-red-600 hover:bg-red-50 transition-colors shadow"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Logo photo */}
                <div>
                  <Label className="text-xs text-gray-500">Logo Photo URL</Label>
                  <Input value={form.logo_photo} onChange={(e) => updateField('logo_photo', e.target.value)} className="mt-1" placeholder="https://..." />
                  {form.logo_photo && (
                    <img src={form.logo_photo} alt="Logo preview" className="mt-2 w-16 h-16 object-contain rounded border bg-gray-50" />
                  )}
                </div>

                {/* Street view */}
                <div>
                  <Label className="text-xs text-gray-500">Street View URL</Label>
                  <Input value={form.street_view_url} onChange={(e) => updateField('street_view_url', e.target.value)} className="mt-1" placeholder="https://..." />
                  {form.street_view_url && (
                    <img src={form.street_view_url} alt="Street view preview" className="mt-2 w-full h-24 object-cover rounded-lg border" />
                  )}
                </div>
              </div>

              {/* Crop Modal */}
              {croppingPhoto && (
                <CropModal
                  imageUrl={croppingPhoto}
                  listingId={listing.id}
                  uploadType="gallery"
                  onSave={handleCropSave}
                  onClose={() => setCroppingPhoto(null)}
                />
              )}
            </AccordionContent>
          </AccordionItem>

          {/* ───────── Status & Flags ───────── */}
          <AccordionItem value="status">
            <AccordionTrigger className="text-sm font-semibold text-gray-700 hover:no-underline">
              <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-gray-400" /> Status & Flags</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Touchless Classification</Label>
                  <button onClick={cycleTouchless} className="inline-flex items-center" title="Click to cycle: Touchless → Not Touchless → Unknown">
                    <Badge variant="outline" className={`${touchlessCls} text-xs cursor-pointer transition-colors select-none`}>
                      {touchlessLabel}
                    </Badge>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-gray-500">Approved</Label>
                    <Switch checked={isApproved} onCheckedChange={setIsApproved} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-gray-500">Featured</Label>
                    <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-gray-500">Claimed</Label>
                    <Switch checked={isClaimed} onCheckedChange={setIsClaimed} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Rating</Label>
                    <Input value={form.rating} onChange={(e) => updateField('rating', e.target.value)} className="mt-1" type="number" step="0.1" min="0" max="5" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Review Count</Label>
                    <Input value={form.review_count} onChange={(e) => updateField('review_count', e.target.value)} className="mt-1" type="number" min="0" />
                  </div>
                </div>

                <div className="pt-3 border-t space-y-1">
                  <p className="text-xs text-gray-400"><span className="font-medium">Slug:</span> {listing.slug}</p>
                  <p className="text-xs text-gray-400"><span className="font-medium">Crawl Status:</span> {listing.crawl_status || 'none'}</p>
                  <p className="text-xs text-gray-400"><span className="font-medium">Created:</span> {new Date(listing.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-400"><span className="font-medium">Updated:</span> {new Date(listing.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t pt-4 mt-6 pb-2 flex items-center justify-end gap-3">
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
      </SheetContent>
    </Sheet>
  );
}
