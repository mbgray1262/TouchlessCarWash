'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, Loader2, RotateCcw, ChevronRight, Info, Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/AdminNav';
import { parseSpreadsheetFile } from './parseSpreadsheet';

type ImportStatus = 'idle' | 'parsing' | 'processing' | 'done' | 'error';

interface EnrichSummary {
  total_rows: number;
  skipped_no_place_id: number;
  matched: number;
  skipped_no_match: number;
  columns_updated: Record<string, number>;
  errors: string[];
}

interface ProgressState {
  processed: number;
  total: number;
  pct: number;
  batch: number;
  totalBatches: number;
}

const COLUMN_MAP: { spreadsheet: string; db: string; description: string }[] = [
  { spreadsheet: 'place_id', db: 'google_place_id', description: 'Match key (must exist)' },
  { spreadsheet: 'photo', db: 'google_photo_url', description: 'Primary Google Business photo' },
  { spreadsheet: 'logo', db: 'google_logo_url', description: 'Business logo from Google' },
  { spreadsheet: 'street_view', db: 'street_view_url', description: 'Google Street View image' },
  { spreadsheet: 'photos_count', db: 'google_photos_count', description: 'Number of Google photos' },
  { spreadsheet: 'description', db: 'google_description', description: 'Business description' },
  { spreadsheet: 'about', db: 'google_about', description: 'Business attributes (JSON)' },
  { spreadsheet: 'subtypes', db: 'google_subtypes', description: 'Google subcategories' },
  { spreadsheet: 'category', db: 'google_category', description: 'Primary Google category' },
  { spreadsheet: 'business_status', db: 'business_status', description: 'OPERATIONAL / CLOSED_*' },
  { spreadsheet: 'verified', db: 'is_google_verified', description: 'Google verified (TRUE/FALSE)' },
  { spreadsheet: 'reviews_per_score', db: 'reviews_per_score', description: 'Rating distribution (JSON)' },
  { spreadsheet: 'popular_times', db: 'popular_times', description: 'Traffic patterns (JSON)' },
  { spreadsheet: 'typical_time_spent', db: 'typical_time_spent', description: 'Typical visit duration' },
  { spreadsheet: 'range', db: 'price_range', description: 'Price level indicator' },
  { spreadsheet: 'booking_appointment_link', db: 'booking_url', description: 'Booking/appointment link' },
  { spreadsheet: 'location_link', db: 'google_maps_url', description: 'Google Maps link' },
  { spreadsheet: 'google_id', db: 'google_id', description: 'Google hex ID' },
];

export default function OutscraperEnrichPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [summary, setSummary] = useState<EnrichSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setFileName('');
    setFileSize('');
    setProgress(null);
    setTotalRows(null);
    setStatusMessage('');
    setSummary(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  async function processFile(file: File) {
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
      setStatus('error');
      setErrorMsg('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
      return;
    }

    setFileName(file.name);
    setFileSize((file.size / 1024 / 1024).toFixed(1) + ' MB');
    setStatus('parsing');
    setStatusMessage('Reading file…');
    setProgress(null);
    setTotalRows(null);
    setSummary(null);
    setErrorMsg('');

    let rawRows: Record<string, unknown>[];
    try {
      setStatusMessage('Reading file into memory…');
      await new Promise(r => setTimeout(r, 30));
      setStatusMessage('Parsing spreadsheet (this may take a moment for large files)…');
      rawRows = await parseSpreadsheetFile(file) as Record<string, unknown>[];
      setStatusMessage('Parsed successfully, preparing rows…');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file.');
      return;
    }

    if (rawRows.length === 0) {
      setStatus('error');
      setErrorMsg('File is empty or has no data rows.');
      return;
    }

    const total = rawRows.length;
    setTotalRows(total);
    setStatus('processing');
    setStatusMessage('Matching rows and writing enrichment data…');

    const ac = new AbortController();
    abortRef.current = ac;

    const CHUNK = 2000;
    const totalChunks = Math.ceil(total / CHUNK);

    const accumulated: EnrichSummary = {
      total_rows: total,
      skipped_no_place_id: 0,
      matched: 0,
      skipped_no_match: 0,
      columns_updated: {},
      errors: [],
    };

    try {
      for (let chunkIdx = 0; chunkIdx < total; chunkIdx += CHUNK) {
        if (ac.signal.aborted) return;

        const chunk = rawRows.slice(chunkIdx, chunkIdx + CHUNK);
        const chunkNum = Math.floor(chunkIdx / CHUNK) + 1;

        setProgress({
          processed: chunkIdx,
          total,
          pct: Math.round((chunkIdx / total) * 100),
          batch: chunkNum,
          totalBatches: totalChunks,
        });

        const res = await fetch('/api/outscraper-enrich/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
          signal: ac.signal,
        });

        if (!res.ok) {
          let msg = `Server error (${res.status}) on chunk ${chunkNum}`;
          try { const b = await res.json(); msg = b.error ?? msg; } catch { }
          setStatus('error');
          setErrorMsg(msg);
          return;
        }

        const result: EnrichSummary = await res.json();
        accumulated.skipped_no_place_id += result.skipped_no_place_id ?? 0;
        accumulated.matched += result.matched ?? 0;
        accumulated.skipped_no_match += result.skipped_no_match ?? 0;
        for (const [col, count] of Object.entries(result.columns_updated ?? {})) {
          accumulated.columns_updated[col] = (accumulated.columns_updated[col] ?? 0) + count;
        }
        accumulated.errors.push(...(result.errors ?? []));
      }

      setProgress({ processed: total, total, pct: 100, batch: totalChunks, totalBatches: totalChunks });
      setSummary(accumulated);
      setStatus('done');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file).catch(() => {});
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file).catch(() => {});
  }

  const isRunning = status === 'parsing' || status === 'processing';
  const matchRate = summary ? Math.round((summary.matched / Math.max(summary.total_rows - summary.skipped_no_place_id, 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="container mx-auto px-4 max-w-3xl py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/admin/import/bulk"
            className="text-sm text-gray-500 hover:text-[#0F2744] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Bulk Import
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Outscraper Enrichment</span>
        </div>

        <div className="mb-8 mt-4">
          <div className="flex items-center gap-2.5 mb-2">
            <Database className="w-6 h-6 text-[#0F2744]" />
            <h1 className="text-3xl font-bold text-[#0F2744]">Import Outscraper Enrichment Data</h1>
          </div>
          <p className="text-gray-500 leading-relaxed">
            Re-upload your original Outscraper spreadsheets (MA or Tier1_US_minus_MA) to populate new columns.
            Rows are matched by <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">place_id</span>.
            Existing data is never overwritten — only empty fields are filled.
          </p>
        </div>

        <div className="space-y-5">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex gap-3 items-start">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-semibold">Additive-only operation.</span> This import will never overwrite
                existing values. Each column is only set if it is currently NULL in the database.
                Safe to run multiple times.
              </div>
            </CardContent>
          </Card>

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
                  <div>
                    <p className="text-sm font-medium text-[#0F2744]">{fileName}</p>
                    {fileSize && <p className="text-xs text-gray-400 mt-1">{fileSize}</p>}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 mb-1">Drop your Outscraper file here or click to browse</p>
                    <p className="text-xs text-gray-400">Supports .csv, .xlsx, .xls</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {isRunning && (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {status === 'parsing' && (
                    <ProgressSection
                      label={statusMessage || 'Reading and parsing file…'}
                      sublabel="Processing spreadsheet in your browser"
                      pct={100}
                      indeterminate={true}
                    />
                  )}

                  {status === 'processing' && (
                    <ProgressSection
                      label="Matching rows and writing enrichment data"
                      sublabel={
                        progress
                          ? `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} rows — batch ${progress.batch} of ${progress.totalBatches}`
                          : totalRows
                          ? `0 / ${totalRows.toLocaleString()} rows`
                          : 'Starting…'
                      }
                      pct={progress?.pct ?? 0}
                      indeterminate={!progress}
                    />
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={reset}
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
                  <p className="font-semibold text-green-800">Enrichment complete</p>
                  <Button size="sm" variant="outline" onClick={reset} className="ml-auto shrink-0">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Import Another
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <StatCard label="Total rows" value={summary.total_rows} color="gray" />
                  <StatCard label="Matched" value={summary.matched} color="green" />
                  <StatCard label="No match" value={summary.skipped_no_match} color="yellow" />
                  <StatCard label="No place_id" value={summary.skipped_no_place_id} color="yellow" />
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Match rate</p>
                    <span className="text-sm font-bold text-[#0F2744] tabular-nums">{matchRate}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-[#0F2744] transition-all duration-500"
                      style={{ width: `${matchRate}%` }}
                    />
                  </div>
                </div>

                {Object.keys(summary.columns_updated).length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-blue-800 mb-3">Columns populated</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {Object.entries(summary.columns_updated)
                        .sort((a, b) => b[1] - a[1])
                        .map(([col, count]) => (
                          <div key={col} className="flex items-center justify-between text-xs">
                            <span className="font-mono text-blue-700">{col}</span>
                            <span className="text-blue-600 font-medium tabular-nums">{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {summary.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Row errors ({summary.errors.length})
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
                <Info className="w-4 h-4 text-gray-400" /> Column mapping
              </p>
              <div className="space-y-1.5">
                {COLUMN_MAP.map(({ spreadsheet, db, description }) => (
                  <div key={db} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                    <span className="font-mono text-gray-600 truncate">{spreadsheet}</span>
                    <span className="text-gray-300">&rarr;</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[#0F2744] truncate">{db}</span>
                      {spreadsheet === 'place_id' && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200 shrink-0">match key</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Only NULL columns are written. Rows without a <span className="font-mono">place_id</span> are skipped.
                Rows where no matching listing exists in the database are counted as &ldquo;no match&rdquo;.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProgressSection({
  label,
  sublabel,
  pct,
  indeterminate,
}: {
  label: string;
  sublabel: string;
  pct: number;
  indeterminate: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        {!indeterminate && (
          <span className="text-sm text-gray-500 tabular-nums font-medium">{pct}%</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2 ml-6">{sublabel}</p>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        {indeterminate ? (
          <div className="bg-blue-500 h-2.5 rounded-full animate-pulse w-full" />
        ) : (
          <div
            className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'gray' | 'green' | 'yellow' | 'red' }) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: value > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-gray-50 border-gray-200 text-gray-400',
    red: value > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-400',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
