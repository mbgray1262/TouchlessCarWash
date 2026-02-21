'use client';

import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';

export interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

const NEEDED_COLUMNS = new Set([
  'place_id', 'Place ID',
  'photo', 'Photo',
  'logo', 'Logo',
  'street_view', 'Street View',
  'photos_count', 'Photos Count',
  'description', 'Description',
  'about', 'About',
  'subtypes', 'Subtypes',
  'category', 'Category',
  'business_status', 'Business Status',
  'verified', 'Verified',
  'reviews_per_score', 'Reviews Per Score',
  'popular_times', 'Popular Times',
  'typical_time_spent', 'Typical Time Spent',
  'range', 'Range', 'price_range', 'Price Range',
  'booking_appointment_link', 'Booking Appointment Link',
  'location_link', 'Location Link',
  'google_id', 'Google ID',
]);

function slimRow(row: RawRow): RawRow {
  const slim: RawRow = {};
  for (const key of Object.keys(row)) {
    if (NEEDED_COLUMNS.has(key)) slim[key] = row[key];
  }
  return slim;
}

export async function parseSpreadsheetFile(file: File): Promise<RawRow[]> {
  const ext = file.name.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    const text = await file.text();
    return parseCSVText(text).map(slimRow);
  }

  const buffer = await file.arrayBuffer();
  const wb = xlsxRead(buffer, { type: 'array', dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsxUtils.sheet_to_json(ws, { defval: null }) as RawRow[];
  return rows.map(slimRow);
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
