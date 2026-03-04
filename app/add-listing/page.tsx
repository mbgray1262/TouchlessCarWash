'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, CheckCircle2, Camera, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { US_STATES } from '@/lib/constants';

export default function AddListingPage() {
  const [formData, setFormData] = useState({
    business_name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    website: '',
    email: '',
    notes: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 5) {
      setSubmitError('Maximum 5 photos allowed.');
      return;
    }

    setUploadingPhoto(true);
    setSubmitError('');

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setSubmitError(`"${file.name}" is too large. Max 5MB per photo.`);
        continue;
      }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'submission');

      try {
        const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          setPhotos(prev => [...prev, data.url]);
        } else {
          setSubmitError(data.error || 'Failed to upload photo.');
        }
      } catch {
        setSubmitError('Failed to upload photo. Please try again.');
      }
    }

    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.business_name.trim()) newErrors.business_name = 'Business name is required';
    if (!formData.address.trim()) newErrors.address = 'Street address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state) newErrors.state = 'State is required';
    if (!formData.zip.trim()) newErrors.zip = 'ZIP code is required';
    else if (!/^\d{5}(-\d{4})?$/.test(formData.zip.trim())) newErrors.zip = 'Enter a valid ZIP code';

    if (formData.website.trim() && !/^https?:\/\/.+\..+/.test(formData.website.trim())) {
      newErrors.website = 'Enter a valid URL (e.g. https://example.com)';
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/add-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, photos }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen">
        <div className="bg-[#0F2744] py-10">
          <div className="container mx-auto px-4 max-w-3xl">
            <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white">Add Your Business</span>
            </nav>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Add Your Business</h1>
          </div>
        </div>
        <div className="container mx-auto px-4 max-w-3xl py-16">
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-3">Submission Received!</h2>
            <p className="text-muted-foreground text-lg mb-6">
              Thank you for submitting your car wash. Our team will review your listing
              and add it to the directory shortly.
            </p>
            <div className="flex gap-3 justify-center">
              <Button asChild variant="outline">
                <Link href="/">Back to Home</Link>
              </Button>
              <Button asChild className="bg-[#0F2744] hover:bg-[#1a3a5c]">
                <Link href="/search">Find a Wash</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Add Your Business</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Add Your Business</h1>
          <p className="text-white/70">
            Submit your touchless car wash to be listed in our directory. All submissions are reviewed before publishing.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Business Information</h2>

            <div>
              <Label htmlFor="business_name">Business Name <span className="text-red-500">*</span></Label>
              <Input
                id="business_name"
                placeholder="e.g. Sparkle Touchless Car Wash"
                value={formData.business_name}
                onChange={e => updateField('business_name', e.target.value)}
                className={errors.business_name ? 'border-red-500' : ''}
              />
              {errors.business_name && <p className="text-sm text-red-500 mt-1">{errors.business_name}</p>}
            </div>

            <div>
              <Label htmlFor="address">Street Address <span className="text-red-500">*</span></Label>
              <Input
                id="address"
                placeholder="e.g. 123 Main Street"
                value={formData.address}
                onChange={e => updateField('address', e.target.value)}
                className={errors.address ? 'border-red-500' : ''}
              />
              {errors.address && <p className="text-sm text-red-500 mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-1">
                <Label htmlFor="city">City <span className="text-red-500">*</span></Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={e => updateField('city', e.target.value)}
                  className={errors.city ? 'border-red-500' : ''}
                />
                {errors.city && <p className="text-sm text-red-500 mt-1">{errors.city}</p>}
              </div>

              <div>
                <Label htmlFor="state">State <span className="text-red-500">*</span></Label>
                <select
                  id="state"
                  value={formData.state}
                  onChange={e => updateField('state', e.target.value)}
                  className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    errors.state ? 'border-red-500' : 'border-input'
                  }`}
                >
                  <option value="">Select</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code}</option>
                  ))}
                </select>
                {errors.state && <p className="text-sm text-red-500 mt-1">{errors.state}</p>}
              </div>

              <div>
                <Label htmlFor="zip">ZIP Code <span className="text-red-500">*</span></Label>
                <Input
                  id="zip"
                  placeholder="ZIP"
                  value={formData.zip}
                  onChange={e => updateField('zip', e.target.value)}
                  className={errors.zip ? 'border-red-500' : ''}
                />
                {errors.zip && <p className="text-sm text-red-500 mt-1">{errors.zip}</p>}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Contact &amp; Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={e => updateField('phone', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://www.example.com"
                  value={formData.website}
                  onChange={e => updateField('website', e.target.value)}
                  className={errors.website ? 'border-red-500' : ''}
                />
                {errors.website && <p className="text-sm text-red-500 mt-1">{errors.website}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="email">Your Email <span className="text-muted-foreground text-xs">(optional, for follow-up)</span></Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={e => updateField('email', e.target.value)}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="notes">
                Additional Notes <span className="text-muted-foreground text-xs">(hours, wash types, amenities, etc.)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Tell us about your car wash — hours of operation, types of washes offered, amenities, pricing, etc."
                value={formData.notes}
                onChange={e => updateField('notes', e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Photos</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Upload up to 5 photos of your car wash (exterior, wash bay, equipment, etc.)
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {photos.map((url, i) => (
                <div key={url} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
                  <Image src={url} alt={`Photo ${i + 1}`} fill className="object-cover" sizes="96px" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {photos.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span className="text-xs">Add Photo</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Max 5MB each.</p>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm">{submitError}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="text-red-500">*</span> Required fields
            </p>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#22C55E] hover:bg-[#16A34A] text-white px-8 w-full sm:w-auto"
            >
              {submitting ? 'Submitting...' : 'Submit Listing'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
