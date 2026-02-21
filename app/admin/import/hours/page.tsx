'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, Loader2, RotateCcw, ChevronRight, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminNav } from '@/components/AdminNav';
import { parseSpreadsheetFile } from '../enrich/parseSpreadsheet';

type ImportStatus = 'idle' | 'parsing' | 'processing' | 'done' | 'error';

interface HoursSummary {
  total_rows: number;
  hours_updated: number;
  skipped_already_has_hours: number;
  skipped_no_match: number;
  skipped_no_place_id: number;
  skipped_no_hours_data: number;
  errors: string[];
}

interface ProgressState {
  processed: number;
  total: number;
  pct: number;
  batch: number;
  totalBatches: number;
}

const CHUNK = 200;

export default function ImportHoursPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [summary, setSummary] = useState<HoursSummary | null>(null);
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
      const HOURS_COLUMNS = ['place_id', 'Place ID', 'google_place_id', 'Google Place ID', 'working_hours', 'Working Hours', 'hours', 'Hours'];
      rawRows = await parseSpreadsheetFile(file, false, HOURS_COLUMNS) as Record<string, unknown>[];
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
    setStatusMessage('Matching rows and updating hours…');

    const ac = new AbortController();
    abortRef.current = ac;

    const totalChunks = Math.ceil(total / CHUNK);
    const accumulated: HoursSummary = {
      total_rows: total,
      hours_updated: 0,
      skipped_already_has_hours: 0,
      skipped_no_match: 0,
      skipped_no_place_id: 0,
      skipped_no_hours_data: 0,
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

        const res = await fetch('/api/import-hours', {
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

        const result: HoursSummary = await res.json();
        accumulated.hours_updated += result.hours_updated ?? 0;
        accumulated.skipped_already_has_hours += result.skipped_already_has_hours ?? 0;
        accumulated.skipped_no_match += result.skipped_no_match ?? 0;
        accumulated.skipped_no_place_id += result.skipped_no_place_id ?? 0;
        accumulated.skipped_no_hours_data += result.skipped_no_hours_data ?? 0;
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
            <ArrowLeft className="w-3.5 h-3.5" /> Import
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-sm font-medium text-[#0F2744]">Import Working Hours</span>
        </div>

        <div className="mb-8 mt-4">
          <div className="flex items-center gap-2.5 mb-2">
            <Clock className="w-6 h-6 text-[#0F2744]" />
            <h1 className="text-3xl font-bold text-[#0F2744]">Import Working Hours</h1>
          </div>
          <p className="text-gray-500 leading-relaxed">
            Re-upload your Outscraper spreadsheets to backfill the <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">hours</span> column.
            Rows are matched by <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">place_id</span>.
            Only listings with empty hours are updated — existing data is never overwritten.
          </p>
        </div>

        <div className="space-y-5">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex gap-3 items-start">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-semibold">Additive-only.</span> Hours are written only where the{' '}
                <span className="font-mono text-xs">hours</span> column is currently NULL or empty (
                <span className="font-mono text-xs">{'{}'}</span>). Safe to run multiple times.
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
                    <p className="text-xs text-gray-400">Supports .csv, .xlsx, .xls — large files work fine</p>
                  </>
                )}
              </div>

              <div className="mt-4 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">Required columns in the spreadsheet:</p>
                <div className="flex gap-6">
                  <div>
                    <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">place_id</span>
                    <span className="ml-2">— used to match listings</span>
                  </div>
                  <div>
                    <span className="font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">working_hours</span>
                    <span className="ml-2">— JSON hours object from Outscraper</span>
                  </div>
                </div>
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
                      label="Matching rows and updating hours"
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

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                  <StatCard label="Total rows" value={summary.total_rows} color="gray" />
                  <StatCard label="Hours updated" value={summary.hours_updated} color="green" />
                  <StatCard label="Already had hours" value={summary.skipped_already_has_hours} color="blue" />
                  <StatCard label="No DB match" value={summary.skipped_no_match} color="yellow" />
                  <StatCard label="No place_id" value={summary.skipped_no_place_id} color="yellow" />
                  <StatCard label="No hours data" value={summary.skipped_no_hours_data} color="yellow" />
                </div>

                {summary.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" /> Errors ({summary.errors.length})
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
                  <Button variant="outline" size="sm" onClick={reset}>
                    Import Another File
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
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

function StatCard({
  label, value, color,
}: {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'blue' | 'yellow' | 'red';
}) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
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
