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

type ImportStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface ImportSummary {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export default function BulkImportPage() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setStatus('idle');
    setFileName('');
    setFileSize('');
    setUploadProgress(0);
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
    setStatus('uploading');
    setUploadProgress(0);
    setSummary(null);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(pct);
          if (pct === 100) setStatus('processing');
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: ImportSummary & { error?: string } = JSON.parse(xhr.responseText);
            if (result.error) {
              setStatus('error');
              setErrorMsg(result.error);
            } else {
              setSummary(result);
              setStatus('done');
            }
          } catch {
            setStatus('error');
            setErrorMsg('Unexpected response from server.');
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            setStatus('error');
            setErrorMsg(body.error ?? `Server error (${xhr.status})`);
          } catch {
            setStatus('error');
            setErrorMsg(`Server error (${xhr.status})`);
          }
        }
        resolve();
      });

      xhr.addEventListener('error', () => {
        setStatus('error');
        setErrorMsg('Network error. Please check your connection and try again.');
        reject();
      });

      xhr.addEventListener('abort', () => {
        setStatus('idle');
        resolve();
      });

      xhr.open('POST', '/api/bulk-import');
      xhr.send(formData);
    });
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

  const isRunning = status === 'uploading' || status === 'processing';

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
            Upload a CSV or Excel file with up to 30,000+ rows. Files are parsed on the server, so large XLSX files work fine.
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
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-sm font-medium text-gray-700">
                      {status === 'uploading' ? 'Uploading file to server…' : 'Server is parsing and importing rows…'}
                    </span>
                  </div>
                  {status === 'uploading' && (
                    <span className="text-sm text-gray-500 tabular-nums">{uploadProgress}%</span>
                  )}
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  {status === 'uploading' ? (
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  ) : (
                    <div className="bg-blue-500 h-2.5 rounded-full animate-pulse w-full" />
                  )}
                </div>

                {status === 'processing' && (
                  <p className="text-xs text-gray-400 mt-2">
                    Upload complete &mdash; processing and inserting rows into the database&hellip;
                  </p>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 text-red-600 border-red-200 hover:bg-red-50"
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
