'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, Loader2, RotateCcw, ChevronRight, Info, TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/AdminNav';
const BATCH_SIZE = 500;
const XLSX_SIZE_LIMIT_MB = 20;
const XLSX_SIZE_LIMIT_BYTES = XLSX_SIZE_LIMIT_MB * 1024 * 1024;

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'done' | 'error';

interface BatchResult {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

interface ImportSummary {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

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

async function upsertViaApi(rows: NonNullable<ReturnType<typeof mapRowToListing>>[], onConflict: string): Promise<{ inserted: number; error?: string }> {
  const res = await fetch('/api/bulk-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, onConflict }),
  });
  const json = await res.json();
  if (!res.ok) return { inserted: 0, error: json.error ?? 'Server error' };
  return { inserted: json.inserted };
}

async function insertBatch(rows: ReturnType<typeof mapRowToListing>[]): Promise<BatchResult> {
  const valid = rows.filter(Boolean) as NonNullable<ReturnType<typeof mapRowToListing>>[];
  const result: BatchResult = { inserted: 0, skipped: rows.length - valid.length, failed: 0, errors: [] };

  if (valid.length === 0) return result;

  const withPlaceId = valid.filter(r => r.google_place_id);
  const withoutPlaceId = valid.filter(r => !r.google_place_id);

  if (withPlaceId.length > 0) {
    const { inserted, error } = await upsertViaApi(withPlaceId, 'google_place_id');
    if (error) {
      result.failed += withPlaceId.length;
      result.errors.push(`Place ID batch error: ${error}`);
    } else {
      result.inserted += inserted;
      result.skipped += withPlaceId.length - inserted;
    }
  }

  if (withoutPlaceId.length > 0) {
    const { inserted, error } = await upsertViaApi(withoutPlaceId, 'slug');
    if (error) {
      result.failed += withoutPlaceId.length;
      result.errors.push(`Slug batch error: ${error}`);
    } else {
      result.inserted += inserted;
      result.skipped += withoutPlaceId.length - inserted;
    }
  }

  return result;
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
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

async function parseFileToRows(
  file: File,
  onProgress?: (msg: string) => void
): Promise<RawRow[]> {
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  if (isCSV) {
    onProgress?.('Reading CSV file…');
    await yieldToMain();
    const text = await file.text();
    await yieldToMain();
    onProgress?.('Parsing CSV rows…');
    await yieldToMain();
    const rows = parseCSVText(text);
    await yieldToMain();
    return rows;
  }

  if (file.size > XLSX_SIZE_LIMIT_BYTES) {
    throw new Error(
      `This Excel file is ${(file.size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${XLSX_SIZE_LIMIT_MB} MB limit for XLSX files. ` +
      `Please convert it to CSV format first (File → Save As → CSV in Excel) and re-upload. CSV files parse much faster and support files with 30,000+ rows.`
    );
  }

  onProgress?.('Reading Excel file…');
  await yieldToMain();
  const buffer = await file.arrayBuffer();
  await yieldToMain();
  onProgress?.('Parsing Excel workbook…');
  await yieldToMain();
  const wb = xlsxRead(buffer, { type: 'array', dense: true });
  await yieldToMain();
  const ws = wb.Sheets[wb.SheetNames[0]];
  onProgress?.('Converting rows…');
  await yieldToMain();
  const rawRows: RawRow[] = xlsxUtils.sheet_to_json(ws, { defval: null });
  await yieldToMain();
  return rawRows;
}

export default function BulkImportPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [parseStage, setParseStage] = useState('');
  const [fileName, setFileName] = useState('');
  const [totalRows, setTotalRows] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = false;
    setStatus('idle');
    setFileName('');
    setTotalRows(0);
    setProcessedRows(0);
    setSummary(null);
    setErrorMsg('');
    setParseStage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  async function processFile(file: File) {
    if (!file) return;
    abortRef.current = false;
    setFileName(file.name);
    setStatus('parsing');
    setParseStage('Preparing…');
    setSummary(null);
    setErrorMsg('');
    setProcessedRows(0);
    setTotalRows(0);

    let rawRows: RawRow[];

    try {
      rawRows = await parseFileToRows(file, msg => setParseStage(msg));
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file. Please check the format and try again.');
      return;
    }

    if (rawRows.length === 0) {
      setStatus('error');
      setErrorMsg('The spreadsheet appears to be empty or has no valid data rows.');
      return;
    }

    setTotalRows(rawRows.length);
    setStatus('importing');

    const agg: ImportSummary = { total: rawRows.length, inserted: 0, skipped: 0, failed: 0, errors: [] };

    try {
      for (let i = 0; i < rawRows.length; i += BATCH_SIZE) {
        if (abortRef.current) break;

        const batchRaw = rawRows.slice(i, i + BATCH_SIZE);
        const mapped = batchRaw.map((r, j) => mapRowToListing(r, i + j));
        const result = await insertBatch(mapped);

        agg.inserted += result.inserted;
        agg.skipped += result.skipped;
        agg.failed += result.failed;
        if (result.errors.length > 0) agg.errors.push(...result.errors);

        setProcessedRows(Math.min(i + BATCH_SIZE, rawRows.length));

        await yieldToMain();
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred during import. Some rows may have been imported before the failure.');
      return;
    }

    setSummary(agg);
    setStatus('done');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  const progress = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;
  const isRunning = status === 'parsing' || status === 'importing';

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="container mx-auto px-4 max-w-3xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/admin/import"
            className="text-sm text-gray-500 hover:text-[#0F2744] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> URL Import
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Bulk Import</span>
        </div>

        <div className="mb-8 mt-4">
          <h1 className="text-3xl font-bold text-[#0F2744] mb-2">Bulk Spreadsheet Import</h1>
          <p className="text-gray-500">
            Upload a CSV or Excel file with up to 30,000+ rows. Rows are processed in batches of {BATCH_SIZE} with automatic deduplication.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Upload Spreadsheet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !isRunning && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer select-none ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : isRunning
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isRunning}
                />
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                {fileName ? (
                  <p className="text-sm font-medium text-[#0F2744]">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 mb-1">Drop your file here or click to browse</p>
                    <p className="text-xs text-gray-400">Supports .csv, .xlsx, .xls &mdash; use CSV for files over {XLSX_SIZE_LIMIT_MB} MB</p>
                  </>
                )}
              </div>

              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Large files:</span> Excel files over {XLSX_SIZE_LIMIT_MB} MB must be saved as CSV first.
                  In Excel: <span className="font-mono">File &rarr; Save As &rarr; CSV UTF-8</span>. CSV files handle 30,000+ rows without issue.
                </p>
              </div>
            </CardContent>
          </Card>

          {(status === 'parsing' || status === 'importing') && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-sm font-medium text-gray-700">
                      {status === 'parsing' ? parseStage || 'Parsing file…' : `Importing rows…`}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 tabular-nums">
                    {status === 'importing' ? `${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}` : ''}
                  </span>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: status === 'parsing' ? '5%' : `${progress}%` }}
                  />
                </div>

                {status === 'importing' && totalRows > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {progress}% complete &mdash; batch {Math.ceil(processedRows / BATCH_SIZE)} of {Math.ceil(totalRows / BATCH_SIZE)}
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { abortRef.current = true; }}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          )}

          {status === 'error' && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-5 flex gap-3 items-start">
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 mb-1">Import Failed</p>
                  <p className="text-sm text-red-600">{errorMsg}</p>
                </div>
                <Button size="sm" variant="outline" onClick={reset} className="shrink-0">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {status === 'done' && summary && (
            <Card className="border-green-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <p className="font-semibold text-green-800">Import complete</p>
                  <Button size="sm" variant="outline" onClick={reset} className="ml-auto shrink-0">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Import Another
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <StatCard label="Total rows" value={summary.total} color="gray" />
                  <StatCard label="Imported" value={summary.inserted} color="green" />
                  <StatCard label="Skipped (dupes)" value={summary.skipped} color="yellow" />
                  <StatCard label="Failed" value={summary.failed} color="red" />
                </div>

                {summary.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Batch errors ({summary.errors.length})
                    </p>
                    <ul className="space-y-1 max-h-32 overflow-y-auto">
                      {summary.errors.map((e, i) => (
                        <li key={i} className="text-xs text-red-600 font-mono">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm" className="bg-[#0F2744] hover:bg-[#1E3A8A] text-white">
                    <Link href="/admin/listings">View Listings</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-gray-100 bg-gray-50">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-3">
                <Info className="w-4 h-4 text-gray-400" /> Expected columns
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                {[
                  { col: 'name', req: true },
                  { col: 'address', req: false },
                  { col: 'city', req: true },
                  { col: 'state', req: true },
                  { col: 'zip', req: false },
                  { col: 'phone', req: false },
                  { col: 'website', req: false },
                  { col: 'rating', req: false },
                  { col: 'review_count', req: false },
                  { col: 'latitude', req: false },
                  { col: 'longitude', req: false },
                  { col: 'parent_chain', req: false },
                  { col: 'google_place_id', req: false },
                ].map(({ col: c, req }) => (
                  <div key={c} className="flex items-center gap-1.5 text-xs">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 ${req ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                    >
                      {req ? 'required' : 'optional'}
                    </Badge>
                    <span className="font-mono text-gray-600">{c}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Column headers are case-insensitive. Rows with the same <span className="font-mono">google_place_id</span> (or same name+address+city+zip) are skipped automatically on re-import.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'gray' | 'green' | 'yellow' | 'red' }) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: value > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-400',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
