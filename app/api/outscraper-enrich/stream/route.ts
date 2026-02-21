import { NextRequest } from 'next/server';
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

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(data)));
      }

      try {
        const contentType = req.headers.get('content-type') ?? '';
        if (!contentType.includes('multipart/form-data')) {
          send({ type: 'error', message: 'Please upload a file.' });
          controller.close();
          return;
        }

        send({ type: 'status', message: 'Parsing file…', phase: 'parse' });

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
          send({ type: 'error', message: 'No file provided.' });
          controller.close();
          return;
        }

        const ext = file.name.toLowerCase().split('.').pop();
        if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
          send({ type: 'error', message: 'Unsupported file type. Please upload .csv, .xlsx, or .xls.' });
          controller.close();
          return;
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
          send({ type: 'error', message: 'File is empty or has no data rows.' });
          controller.close();
          return;
        }

        const totalRows = rawRows.length;
        send({ type: 'parsed', totalRows });

        const mapped = rawRows.map(r => mapRowToEnrichment(r));
        const skippedNoPlaceId = mapped.filter(m => m === null).length;
        const valid = mapped.filter(Boolean) as NonNullable<ReturnType<typeof mapRowToEnrichment>>[];

        const summary = {
          total_rows: totalRows,
          skipped_no_place_id: skippedNoPlaceId,
          matched: 0,
          skipped_no_match: 0,
          columns_updated: {} as Record<string, number>,
          errors: [] as string[],
        };

        const totalBatches = Math.ceil(valid.length / BATCH_SIZE);

        for (let batchIdx = 0; batchIdx < valid.length; batchIdx += BATCH_SIZE) {
          const batch = valid.slice(batchIdx, batchIdx + BATCH_SIZE);
          const placeIds = batch.map(b => b.placeId);
          const currentBatch = Math.floor(batchIdx / BATCH_SIZE) + 1;
          const processedSoFar = batchIdx;
          const pct = Math.round((processedSoFar / valid.length) * 100);

          send({
            type: 'progress',
            processed: processedSoFar,
            total: valid.length,
            pct,
            batch: currentBatch,
            totalBatches,
          });

          const { data: existing, error: fetchErr } = await supabase
            .from('listings')
            .select('id, google_place_id, google_photo_url, google_logo_url, street_view_url, google_photos_count, google_description, google_about, google_subtypes, google_category, business_status, is_google_verified, reviews_per_score, popular_times, typical_time_spent, price_range, booking_url, google_maps_url, google_id')
            .in('google_place_id', placeIds);

          if (fetchErr) {
            summary.errors.push(`Batch ${currentBatch} fetch error: ${fetchErr.message}`);
            continue;
          }

          const byPlaceId = new Map((existing ?? []).map(r => [r.google_place_id, r]));

          for (const item of batch) {
            const existingRow = byPlaceId.get(item.placeId);
            if (!existingRow) { summary.skipped_no_match++; continue; }

            const toSet: Record<string, unknown> = {};
            for (const [colName, value] of Object.entries(item.updates)) {
              if (existingRow[colName as keyof typeof existingRow] === null || existingRow[colName as keyof typeof existingRow] === undefined) {
                toSet[colName] = value;
              }
            }

            if (Object.keys(toSet).length === 0) continue;

            const { error: updateErr } = await supabase
              .from('listings')
              .update(toSet)
              .eq('id', existingRow.id);

            if (updateErr) {
              if (summary.errors.length < 20) summary.errors.push(`place_id ${item.placeId}: ${updateErr.message}`);
              continue;
            }

            summary.matched++;
            for (const colName of Object.keys(toSet)) {
              summary.columns_updated[colName] = (summary.columns_updated[colName] ?? 0) + 1;
            }
          }
        }

        send({ type: 'progress', processed: valid.length, total: valid.length, pct: 100, batch: totalBatches, totalBatches });
        send({ type: 'done', summary });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
