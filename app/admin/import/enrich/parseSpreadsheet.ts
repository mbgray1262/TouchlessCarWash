'use client';


export interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

const NEEDED_COLUMNS = [
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
  'working_hours', 'Working Hours',
];

const NEEDED_SET = new Set(NEEDED_COLUMNS);

function slimRow(row: RawRow): RawRow {
  const slim: RawRow = {};
  for (const key of Object.keys(row)) {
    if (NEEDED_SET.has(key)) slim[key] = row[key];
  }
  return slim;
}

function parseXlsxViaWorker(buffer: ArrayBuffer, keepAllColumns: boolean): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/xlsx-worker.js');

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Spreadsheet parsing timed out (> 3 minutes). Try a smaller file or CSV format.'));
    }, 180_000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      if (e.data.ok) {
        resolve(e.data.rows as RawRow[]);
      } else {
        reject(new Error(e.data.error || 'Worker parsing failed.'));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message || 'Worker error.'));
    };

    worker.postMessage(
      { buffer, neededColumns: NEEDED_COLUMNS, keepAllColumns },
      [buffer]
    );
  });
}

export async function parseSpreadsheetFile(file: File, keepAllColumns = false): Promise<RawRow[]> {
  const ext = file.name.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    const text = await file.text();
    const rows = parseCSVText(text);
    return keepAllColumns ? rows : rows.map(slimRow);
  }

  const buffer = await file.arrayBuffer();
  return parseXlsxViaWorker(buffer, keepAllColumns);
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
