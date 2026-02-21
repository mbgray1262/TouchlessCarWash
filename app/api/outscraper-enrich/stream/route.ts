import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

const BATCH_SIZE = 500;

interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

function col(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function safeJson(row: RawRow, ...keys: string[]): unknown | null {
  const v = col(row, ...keys);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function safeBool(row: RawRow, ...keys: string[]): boolean | null {
  const v = col(row, ...keys).toUpperCase();
  if (v === 'TRUE' || v === '1' || v === 'YES') return true;
  if (v === 'FALSE' || v === '0' || v === 'NO') return false;
  return null;
}

function safeInt(row: RawRow, ...keys: string[]): number | null {
  const v = col(row, ...keys);
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function mapRowToEnrichment(row: RawRow): { placeId: string; updates: Record<string, unknown> } | null {
  const placeId = col(row, 'place_id', 'Place ID');
  if (!placeId) return null;

  const updates: Record<string, unknown> = {};

  const googlePhotoUrl = col(row, 'photo', 'Photo');
  if (googlePhotoUrl) updates.google_photo_url = googlePhotoUrl;

  const googleLogoUrl = col(row, 'logo', 'Logo');
  if (googleLogoUrl) updates.google_logo_url = googleLogoUrl;

  const streetViewUrl = col(row, 'street_view', 'Street View');
  if (streetViewUrl) updates.street_view_url = streetViewUrl;

  const photosCount = safeInt(row, 'photos_count', 'Photos Count');
  if (photosCount !== null) updates.google_photos_count = photosCount;

  const description = col(row, 'description', 'Description');
  if (description) updates.google_description = description;

  const about = safeJson(row, 'about', 'About');
  if (about !== null) updates.google_about = about;

  const subtypes = col(row, 'subtypes', 'Subtypes');
  if (subtypes) updates.google_subtypes = subtypes;

  const category = col(row, 'category', 'Category');
  if (category) updates.google_category = category;

  const businessStatus = col(row, 'business_status', 'Business Status');
  if (businessStatus) updates.business_status = businessStatus;

  const isVerified = safeBool(row, 'verified', 'Verified');
  if (isVerified !== null) updates.is_google_verified = isVerified;

  const reviewsPerScore = safeJson(row, 'reviews_per_score', 'Reviews Per Score');
  if (reviewsPerScore !== null) updates.reviews_per_score = reviewsPerScore;

  const popularTimes = safeJson(row, 'popular_times', 'Popular Times');
  if (popularTimes !== null) updates.popular_times = popularTimes;

  const typicalTimeSpent = col(row, 'typical_time_spent', 'Typical Time Spent');
  if (typicalTimeSpent) updates.typical_time_spent = typicalTimeSpent;

  const priceRange = col(row, 'range', 'Range', 'price_range', 'Price Range');
  if (priceRange) updates.price_range = priceRange;

  const bookingUrl = col(row, 'booking_appointment_link', 'Booking Appointment Link');
  if (bookingUrl) updates.booking_url = bookingUrl;

  const googleMapsUrl = col(row, 'location_link', 'Location Link');
  if (googleMapsUrl) updates.google_maps_url = googleMapsUrl;

  const googleId = col(row, 'google_id', 'Google ID');
  if (googleId) updates.google_id = googleId;

  return { placeId, updates };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawRows: RawRow[] = body?.rows;

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows provided.' }, { status: 400 });
    }

    const mapped = rawRows.map(r => mapRowToEnrichment(r));
    const skippedNoPlaceId = mapped.filter(m => m === null).length;
    const valid = mapped.filter(Boolean) as NonNullable<ReturnType<typeof mapRowToEnrichment>>[];

    const result = {
      total_rows: rawRows.length,
      skipped_no_place_id: skippedNoPlaceId,
      matched: 0,
      skipped_no_match: 0,
      columns_updated: {} as Record<string, number>,
      errors: [] as string[],
    };

    for (let batchIdx = 0; batchIdx < valid.length; batchIdx += BATCH_SIZE) {
      const batch = valid.slice(batchIdx, batchIdx + BATCH_SIZE);
      const batchNum = Math.floor(batchIdx / BATCH_SIZE) + 1;

      const rpcRows = batch.map(item => ({
        place_id: item.placeId,
        ...Object.fromEntries(
          Object.entries(item.updates).map(([k, v]) => [
            k,
            v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v),
          ])
        ),
      }));

      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc('bulk_enrich_listings', { rows: rpcRows });

      if (rpcErr) {
        result.errors.push(`Batch ${batchNum} error: ${rpcErr.message}`);
        continue;
      }

      const batchResult = rpcResult as { matched: number; columns_updated: Record<string, number> };
      result.matched += batchResult.matched ?? 0;
      result.skipped_no_match += batch.length - (batchResult.matched ?? 0);

      for (const [col, count] of Object.entries(batchResult.columns_updated ?? {})) {
        result.columns_updated[col] = (result.columns_updated[col] ?? 0) + (count as number);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
