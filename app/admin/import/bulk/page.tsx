'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, Loader2, RotateCcw, ChevronRight, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminNav } from '@/components/AdminNav';
import { parseSpreadsheetFile } from '../enrich/parseSpreadsheet';

type ImportStatus = 'idle' | 'parsing' | 'processing' | 'done' | 'error';

interface ImportSummary {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

interface ProgressState {
  processed: number;
  total: number;
  pct: number;
  batch: number;
  totalBatches: number;
}

const CHUNK = 2000;

export default function BulkImportPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
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
    setStatusMessage('');
    setProgress(null);
    setTotalRows(null);
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
    setStatusMessage('Reading file into memory…');
    setProgress(null);
    setTotalRows(null);
    setSummary(null);
    setErrorMsg('');

    let rawRows: Record<string, unknown>[];
    try {
      await new Promise(r => setTimeout(r, 30));
      setStatusMessage('Parsing spreadsheet (this may take a moment for large files)…');
      rawRows = await parseSpreadsheetFile(file, true) as Record<string, unknown>[];
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
    setStatusMessage('Importing rows into the database…');

    const ac = new AbortController();
    abortRef.current = ac;

    const totalChunks = Math.ceil(total / CHUNK);
    const accumulated: ImportSummary = { total, inserted: 0, skipped: 0, failed: 0, errors: [] };

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

        const res = await fetch('/api/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
          signal: ac.signal,
        });

        if (!res.ok) {
          let msg = `Server error (${res.status}) on batch ${chunkNum}`;
          try { const b = await res.json(); msg = b.error ?? msg; } catch { }
          setStatus('error');
          setErrorMsg(msg);
          return;
        }

        const result: ImportSummary = await res.json();
        accumulated.inserted += result.inserted ?? 0;
        accumulated.skipped += result.skipped ?? 0;
        accumulated.failed += result.failed ?? 0;
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
            Upload a CSV or Excel file. The file is parsed in your browser and sent in batches — large files work fine.
            All Outscraper enrichment columns are captured in a single pass, so no separate enrichment step is needed.
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
                  <div>
                    <p className="text-sm font-medium text-[#0F2744]">{fileName}</p>
                    {fileSize && <p className="text-xs text-gray-400 mt-1">{fileSize}</p>}
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 mb-1">Drop your file here or click to browse</p>
                    <p className="text-xs text-gray-400">Supports .csv, .xlsx, .xls &mdash; any file size</p>
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
                      label="Importing rows into the database"
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
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Core listing fields</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {[
                      { col: 'name', req: true },
                      { col: 'city', req: true },
                      { col: 'state', req: true },
                      { col: 'address', req: false },
                      { col: 'zip', req: false },
                      { col: 'phone', req: false },
                      { col: 'website', req: false },
                      { col: 'rating', req: false },
                      { col: 'review_count', req: false },
                      { col: 'latitude', req: false },
                      { col: 'longitude', req: false },
                      { col: 'parent_chain', req: false },
                      { col: 'place_id / google_place_id', req: false },
                    ].map(({ col: c, req }) => (
                      <div key={c} className="flex items-center gap-1.5 text-xs">
                        <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${req ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {req ? 'required' : 'optional'}
                        </Badge>
                        <span className="font-mono text-gray-600">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Outscraper enrichment fields (auto-captured)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {[
                      'photo', 'logo', 'street_view', 'photos_count',
                      'description', 'about', 'subtypes', 'category',
                      'business_status', 'verified', 'reviews_per_score',
                      'popular_times', 'typical_time_spent', 'range',
                      'booking_appointment_link', 'location_link', 'google_id',
                    ].map(c => (
                      <div key={c} className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono text-gray-500">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Column headers are case-insensitive. Rows with the same <span className="font-mono">place_id</span> (or same name+address+city+zip) are skipped automatically on re-import.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProgressSection({
  label, sublabel, pct, indeterminate,
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
