import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

const BATCH_SIZE = 500;

interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function makeSlug(row: RawRow): string {
  const parts = [
    row['name'] || row['Name'] || row['business_name'] || '',
    row['address'] || row['Address'] || row['street'] || '',
    row['city'] || row['City'] || '',
    row['state'] || row['State'] || '',
  ]
    .map(String)
    .filter(Boolean);
  return slugify(parts.join('-')) || `listing-${Date.now()}`;
}

function col(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function numCol(row: RawRow, ...keys: string[]): number {
  const v = col(row, ...keys);
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function numColOrNull(row: RawRow, ...keys: string[]): number | null {
  const v = col(row, ...keys);
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function intColOrNull(row: RawRow, ...keys: string[]): number | null {
  const v = col(row, ...keys);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function safeBool(row: RawRow, ...keys: string[]): boolean | null {
  const v = col(row, ...keys).toUpperCase();
  if (v === 'TRUE' || v === '1' || v === 'YES') return true;
  if (v === 'FALSE' || v === '0' || v === 'NO') return false;
  return null;
}

function safeJson(row: RawRow, ...keys: string[]): unknown | null {
  const v = col(row, ...keys);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function safeJsonArray(row: RawRow, ...keys: string[]): unknown[] {
  const v = col(row, ...keys);
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(row: RawRow, ...keys: string[]): Record<string, unknown> {
  const v = col(row, ...keys);
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapRowToListing(row: RawRow) {
  const name = col(row, 'name', 'Name', 'business_name', 'Business Name', 'title', 'Title');
  const address = col(row, 'address', 'Address', 'street', 'Street', 'street_address');
  const city = col(row, 'city', 'City');
  const state = col(row, 'state', 'State', 'state_code', 'State Code');
  const zip = col(row, 'zip', 'Zip', 'zip_code', 'Zip Code', 'postal_code', 'Postal Code');

  if (!name || !city || !state) return null;

  const placeId = col(row, 'place_id', 'Place ID', 'google_place_id', 'Google Place ID') || null;

  const listing: Record<string, unknown> = {
    name,
    slug: makeSlug(row),
    address: address || '',
    city,
    state: state.toUpperCase().slice(0, 2),
    zip: zip.replace(/^(\d{4})$/, '0$1'),
    phone: col(row, 'phone', 'Phone', 'phone_number', 'Phone Number') || null,
    website: col(row, 'website', 'Website', 'url', 'URL', 'website_url') || null,
    rating: numCol(row, 'rating', 'Rating', 'stars', 'Stars'),
    review_count: Math.round(numCol(row, 'review_count', 'Review Count', 'reviews', 'Reviews', 'num_reviews')),
    latitude: numColOrNull(row, 'latitude', 'Latitude', 'lat', 'Lat'),
    longitude: numColOrNull(row, 'longitude', 'Longitude', 'lng', 'Lng', 'lon', 'Lon', 'long', 'Long'),
    parent_chain: col(row, 'parent_chain', 'Parent Chain', 'chain', 'Chain', 'brand', 'Brand') || null,
    google_place_id: placeId,
    is_approved: false,
    is_featured: false,
    photos: safeJsonArray(row, 'photos', 'Photos'),
    amenities: safeJsonArray(row, 'amenities', 'Amenities'),
    wash_packages: safeJsonArray(row, 'wash_packages', 'Wash Packages'),
    hours: safeJsonObject(row, 'hours', 'Hours'),
  };

  const googlePhotoUrl = col(row, 'photo', 'Photo');
  if (googlePhotoUrl) listing.google_photo_url = googlePhotoUrl;

  const googleLogoUrl = col(row, 'logo', 'Logo');
  if (googleLogoUrl) listing.google_logo_url = googleLogoUrl;

  const streetViewUrl = col(row, 'street_view', 'Street View');
  if (streetViewUrl) listing.street_view_url = streetViewUrl;

  const photosCount = intColOrNull(row, 'photos_count', 'Photos Count');
  if (photosCount !== null) listing.google_photos_count = photosCount;

  const description = col(row, 'description', 'Description');
  if (description) listing.google_description = description;

  const about = safeJson(row, 'about', 'About');
  if (about !== null) listing.google_about = about;

  const subtypes = col(row, 'subtypes', 'Subtypes');
  if (subtypes) listing.google_subtypes = subtypes;

  const category = col(row, 'category', 'Category');
  if (category) listing.google_category = category;

  const businessStatus = col(row, 'business_status', 'Business Status');
  if (businessStatus) listing.business_status = businessStatus;

  const isVerified = safeBool(row, 'verified', 'Verified');
  if (isVerified !== null) listing.is_google_verified = isVerified;

  const reviewsPerScore = safeJson(row, 'reviews_per_score', 'Reviews Per Score');
  if (reviewsPerScore !== null) listing.reviews_per_score = reviewsPerScore;

  const popularTimes = safeJson(row, 'popular_times', 'Popular Times');
  if (popularTimes !== null) listing.popular_times = popularTimes;

  const typicalTimeSpent = col(row, 'typical_time_spent', 'Typical Time Spent');
  if (typicalTimeSpent) listing.typical_time_spent = typicalTimeSpent;

  const priceRange = col(row, 'range', 'Range', 'price_range', 'Price Range');
  if (priceRange) listing.price_range = priceRange;

  const bookingUrl = col(row, 'booking_appointment_link', 'Booking Appointment Link');
  if (bookingUrl) listing.booking_url = bookingUrl;

  const googleMapsUrl = col(row, 'location_link', 'Location Link');
  if (googleMapsUrl) listing.google_maps_url = googleMapsUrl;

  const googleId = col(row, 'google_id', 'Google ID');
  if (googleId) listing.google_id = googleId;

  return listing;
}

async function upsertBatch(rows: Record<string, unknown>[]): Promise<{ inserted: number; error?: string }> {
  const { data, error } = await supabase
    .from('listings')
    .upsert(rows as any, { onConflict: 'google_place_id', ignoreDuplicates: true })
    .select('id');

  if (error) return { inserted: 0, error: error.message };
  return { inserted: (data as any[])?.length ?? 0 };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected application/json body with { rows: [...] }' }, { status: 400 });
    }

    const body = await req.json();
    const rawRows: RawRow[] = body?.rows;

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows provided.' }, { status: 400 });
    }

    const summary = { total: rawRows.length, inserted: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (let i = 0; i < rawRows.length; i += BATCH_SIZE) {
      const batchRaw = rawRows.slice(i, i + BATCH_SIZE);
      const mapped = batchRaw.map(r => mapRowToListing(r));
      const valid = mapped.filter(Boolean) as Record<string, unknown>[];

      summary.skipped += mapped.length - valid.length;

      if (valid.length === 0) continue;

      const { inserted, error } = await upsertBatch(valid);
      if (error) {
        for (const row of valid) {
          const { inserted: ins, error: rowErr } = await upsertBatch([row]);
          if (rowErr) {
            summary.failed += 1;
            if (summary.errors.length < 20) {
              summary.errors.push(`Row "${row.name}" (${row.city}, ${row.state}): ${rowErr}`);
            }
          } else {
            summary.inserted += ins;
            summary.skipped += 1 - ins;
          }
        }
      } else {
        summary.inserted += inserted;
        summary.skipped += valid.length - inserted;
      }
    }

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
