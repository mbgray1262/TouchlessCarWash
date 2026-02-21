import { NextRequest, NextResponse } from 'next/server';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import { supabase } from '@/lib/supabase';

const BATCH_SIZE = 200;

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
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
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
  const placeId = col(row, 'place_id', 'Place ID', 'place_id');
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

function parseCSVText(text: string): RawRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let inQuotes = false;
    let current = '';

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        if (inQuotes && line[c + 1] === '"') { current += '"'; c++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);

    const row: RawRow = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
    rows.push(row);
  }

  return rows;
}

interface EnrichSummary {
  total_rows: number;
  skipped_no_place_id: number;
  matched: number;
  skipped_no_match: number;
  columns_updated: Record<string, number>;
  errors: string[];
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Please upload a file.' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
      return NextResponse.json({ error: 'Unsupported file type. Please upload .csv, .xlsx, or .xls.' }, { status: 400 });
    }

    let rawRows: RawRow[];
    if (ext === 'csv') {
      rawRows = parseCSVText(await file.text());
    } else {
      const wb = xlsxRead(await file.arrayBuffer(), { type: 'array', dense: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rawRows = xlsxUtils.sheet_to_json(ws, { defval: null });
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'File is empty or has no data rows.' }, { status: 400 });
    }

    const summary: EnrichSummary = {
      total_rows: rawRows.length,
      skipped_no_place_id: 0,
      matched: 0,
      skipped_no_match: 0,
      columns_updated: {},
      errors: [],
    };

    const mapped = rawRows.map(r => mapRowToEnrichment(r));
    summary.skipped_no_place_id = mapped.filter(m => m === null).length;
    const valid = mapped.filter(Boolean) as NonNullable<ReturnType<typeof mapRowToEnrichment>>[];

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const placeIds = batch.map(b => b.placeId);

      const { data: existing, error: fetchErr } = await supabase
        .from('listings')
        .select('id, google_place_id, google_photo_url, google_logo_url, street_view_url, google_photos_count, google_description, google_about, google_subtypes, google_category, business_status, is_google_verified, reviews_per_score, popular_times, typical_time_spent, price_range, booking_url, google_maps_url, google_id')
        .in('google_place_id', placeIds);

      if (fetchErr) {
        summary.errors.push(`Batch fetch error: ${fetchErr.message}`);
        continue;
      }

      const byPlaceId = new Map((existing ?? []).map(r => [r.google_place_id, r]));

      for (const item of batch) {
        const existing = byPlaceId.get(item.placeId);
        if (!existing) { summary.skipped_no_match++; continue; }

        const toSet: Record<string, unknown> = {};
        for (const [col, value] of Object.entries(item.updates)) {
          if (existing[col as keyof typeof existing] === null || existing[col as keyof typeof existing] === undefined) {
            toSet[col] = value;
          }
        }

        if (Object.keys(toSet).length === 0) continue;

        const { error: updateErr } = await supabase
          .from('listings')
          .update(toSet)
          .eq('id', existing.id);

        if (updateErr) {
          if (summary.errors.length < 20) summary.errors.push(`place_id ${item.placeId}: ${updateErr.message}`);
          continue;
        }

        summary.matched++;
        for (const col of Object.keys(toSet)) {
          summary.columns_updated[col] = (summary.columns_updated[col] ?? 0) + 1;
        }
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
