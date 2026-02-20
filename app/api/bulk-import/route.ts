import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';

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

function makeSlug(row: RawRow, index: number): string {
  const parts = [
    row['name'] || row['Name'] || row['business_name'] || '',
    row['city'] || row['City'] || '',
    row['state'] || row['State'] || '',
  ]
    .map(String)
    .filter(Boolean);
  const base = slugify(parts.join('-')) || `listing-${index}`;
  return `${base}-${index}`;
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

function mapRowToListing(row: RawRow, index: number) {
  const name = col(row, 'name', 'Name', 'business_name', 'Business Name', 'title', 'Title');
  const address = col(row, 'address', 'Address', 'street', 'Street', 'street_address');
  const city = col(row, 'city', 'City');
  const state = col(row, 'state', 'State', 'state_code', 'State Code');
  const zip = col(row, 'zip', 'Zip', 'zip_code', 'Zip Code', 'postal_code', 'Postal Code');

  if (!name || !city || !state) return null;

  const placeId = col(row, 'google_place_id', 'place_id', 'Place ID', 'Google Place ID') || null;

  return {
    name,
    slug: makeSlug(row, index),
    address: address || '',
    city,
    state: state.toUpperCase().slice(0, 2),
    zip: zip.replace(/^(\d{4})$/, '0$1'),
    phone: col(row, 'phone', 'Phone', 'phone_number', 'Phone Number') || null,
    website: col(row, 'website', 'Website', 'url', 'URL', 'website_url') || null,
    rating: numCol(row, 'rating', 'Rating', 'stars', 'Stars'),
    review_count: Math.round(numCol(row, 'review_count', 'Review Count', 'reviews', 'Reviews', 'num_reviews')),
    latitude: numCol(row, 'latitude', 'Latitude', 'lat', 'Lat') || null,
    longitude: numCol(row, 'longitude', 'Longitude', 'lng', 'Lng', 'lon', 'Lon', 'long', 'Long') || null,
    parent_chain: col(row, 'parent_chain', 'Parent Chain', 'chain', 'Chain', 'brand', 'Brand') || null,
    google_place_id: placeId,
    is_approved: false,
    is_featured: false,
    photos: [],
    amenities: [],
    wash_packages: [],
    hours: {},
  };
}

async function upsertBatch(
  supabaseAdmin: any,
  rows: NonNullable<ReturnType<typeof mapRowToListing>>[],
  onConflict: string
): Promise<{ inserted: number; error?: string }> {
  const { data, error } = await (supabaseAdmin as any)
    .from('listings')
    .upsert(rows, { onConflict, ignoreDuplicates: true })
    .select('id');

  if (error) return { inserted: 0, error: error.message };
  return { inserted: (data as any[])?.length ?? 0 };
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
        if (inQuotes && line[c + 1] === '"') {
          current += '"';
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);

    const row: RawRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? null;
    });
    rows.push(row);
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server misconfiguration: missing service role key' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const contentType = req.headers.get('content-type') ?? '';

    let rawRows: RawRow[];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const isCSV = file.name.toLowerCase().endsWith('.csv');
      const isXLSX = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

      if (!isCSV && !isXLSX) {
        return NextResponse.json({ error: 'Unsupported file type. Please upload a .csv, .xlsx, or .xls file.' }, { status: 400 });
      }

      if (isCSV) {
        const text = await file.text();
        rawRows = parseCSVText(text);
      } else {
        const buffer = await file.arrayBuffer();
        const wb = xlsxRead(buffer, { type: 'array', dense: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawRows = xlsxUtils.sheet_to_json(ws, { defval: null });
      }
    } else {
      const { rows, onConflict } = await req.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
      }

      const { data, error } = await (supabaseAdmin as any)
        .from('listings')
        .upsert(rows, { onConflict, ignoreDuplicates: true })
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ inserted: (data as any[])?.length ?? 0 });
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'The file appears to be empty or has no valid data rows.' }, { status: 400 });
    }

    const summary = { total: rawRows.length, inserted: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (let i = 0; i < rawRows.length; i += BATCH_SIZE) {
      const batchRaw = rawRows.slice(i, i + BATCH_SIZE);
      const mapped = batchRaw.map((r, j) => mapRowToListing(r, i + j));
      const valid = mapped.filter(Boolean) as NonNullable<ReturnType<typeof mapRowToListing>>[];

      summary.skipped += mapped.length - valid.length;

      if (valid.length === 0) continue;

      const withPlaceId = valid.filter(r => r.google_place_id);
      const withoutPlaceId = valid.filter(r => !r.google_place_id);

      if (withPlaceId.length > 0) {
        const { inserted, error } = await upsertBatch(supabaseAdmin, withPlaceId, 'google_place_id');
        if (error) {
          summary.failed += withPlaceId.length;
          summary.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} (place_id): ${error}`);
        } else {
          summary.inserted += inserted;
          summary.skipped += withPlaceId.length - inserted;
        }
      }

      if (withoutPlaceId.length > 0) {
        const { inserted, error } = await upsertBatch(supabaseAdmin, withoutPlaceId, 'slug');
        if (error) {
          summary.failed += withoutPlaceId.length;
          summary.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} (slug): ${error}`);
        } else {
          summary.inserted += inserted;
          summary.skipped += withoutPlaceId.length - inserted;
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
