'use client';

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ImportRow {
  id: string;        // listing ID (full UUID or short prefix)
  brand: string;     // canonical brand slug or display name
  model?: string;    // model name (optional)
}

interface ImportResult {
  total: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Map common display names to canonical brand slugs
const BRAND_ALIASES: Record<string, string> = {
  'pdq': 'pdq',
  'pdq laserwash': 'pdq',
  'pdq (laserwash)': 'pdq',
  'laserwash': 'pdq',
  'washworld': 'washworld',
  'wash world': 'washworld',
  'belanger': 'belanger',
  'ryko': 'ryko',
  'istobal': 'istobal',
  'd&s': 'ds',
  'ds': 'ds',
  'd&s car wash': 'ds',
  'petit': 'petit',
  'petit autowash': 'petit',
  'oasis': 'oasis',
  'mark vii': 'mark_vii',
  'mark_vii': 'mark_vii',
  'karcher': 'karcher',
  'kärcher': 'karcher',
  'autec': 'autec',
  'saber': 'saber',
  'broadway': 'broadway',
  'hydrospray': 'hydrospray',
  'hydro-spray': 'hydrospray',
  'hydro spray': 'hydrospray',
  'dencar': 'dencar',
  'dencar technology': 'dencar',
  'ns corporation': 'ns_corp',
  'ns_corp': 'ns_corp',
  'other': 'other',
};

function normalizeBrand(input: string): string | null {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  if (BRAND_ALIASES[lower]) return BRAND_ALIASES[lower];
  // Try slug-ifying as a custom brand
  const slug = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return slug || null;
}

function parseInput(text: string): { rows: ImportRow[]; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: 'No input provided' };

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const rows: ImportRow[] = [];
    for (const item of arr) {
      if (!item.id) continue;
      rows.push({
        id: String(item.id).trim(),
        brand: String(item.brand || item.manufacturer || '').trim(),
        model: item.model ? String(item.model).trim() : undefined,
      });
    }
    if (rows.length === 0) return { rows: [], error: 'No valid rows found in JSON' };
    return { rows };
  } catch {
    // Not JSON, try CSV/TSV
  }

  // CSV/TSV parsing
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], error: 'No lines found' };

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  // Check for header row
  const headerLower = firstLine.toLowerCase();
  const hasHeader = headerLower.includes('id') || headerLower.includes('brand') || headerLower.includes('manufacturer');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: ImportRow[] = [];
  for (const line of dataLines) {
    const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) continue;
    rows.push({
      id: parts[0],
      brand: parts[1],
      model: parts[2] || undefined,
    });
  }

  if (rows.length === 0) return { rows: [], error: 'No valid rows found. Expected: id, brand, model (CSV/TSV)' };
  return { rows };
}

export function EquipmentImport({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ImportRow[] | null>(null);

  const handlePreview = () => {
    setResult(null);
    const { rows, error } = parseInput(input);
    if (error) {
      setResult({ total: 0, updated: 0, skipped: 0, errors: [error] });
      setPreview(null);
      return;
    }
    setPreview(rows);
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    setResult(null);

    const errors: string[] = [];
    let updated = 0;
    let skipped = 0;

    for (const row of preview) {
      const brand = normalizeBrand(row.brand);
      if (!brand) {
        errors.push(`#${row.id}: unknown brand "${row.brand}"`);
        skipped++;
        continue;
      }

      // Resolve short ID prefix to full UUID
      let listingId = row.id;
      if (listingId.length < 36) {
        // Look up by prefix
        const { data } = await supabase
          .from('listings')
          .select('id')
          .ilike('id', `${listingId}%`)
          .eq('is_touchless', true)
          .limit(2);

        if (!data || data.length === 0) {
          errors.push(`#${row.id}: listing not found`);
          skipped++;
          continue;
        }
        if (data.length > 1) {
          errors.push(`#${row.id}: ambiguous ID prefix (${data.length} matches)`);
          skipped++;
          continue;
        }
        listingId = data[0].id;
      }

      const updateData: Record<string, string | null> = { equipment_brand: brand };
      if (row.model) updateData.equipment_model = row.model;

      const { error } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', listingId);

      if (error) {
        errors.push(`#${row.id}: ${error.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    setResult({ total: preview.length, updated, skipped, errors });
    setImporting(false);
    if (updated > 0) onComplete();
  };

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Import Equipment Data (JSON/CSV)
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mt-3 mb-2">
            Paste JSON or CSV from Gemini. Each row needs: <code className="bg-gray-100 px-1 rounded">id</code> (listing ID or #prefix from card), <code className="bg-gray-100 px-1 rounded">brand</code>, and optionally <code className="bg-gray-100 px-1 rounded">model</code>.
          </p>
          <div className="text-xs text-gray-400 mb-2 space-y-1">
            <p><strong>JSON example:</strong> <code className="bg-gray-50 px-1 rounded">{`[{"id":"3d6e09","brand":"PDQ","model":"LaserWash 360"},...]`}</code></p>
            <p><strong>CSV example:</strong> <code className="bg-gray-50 px-1 rounded">id,brand,model</code> (one per line)</p>
          </div>

          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setPreview(null); setResult(null); }}
            placeholder={`Paste JSON array or CSV here...\n\nJSON: [{"id":"3d6e09","brand":"PDQ","model":"LaserWash 360"}]\nCSV: 3d6e09,PDQ,LaserWash 360`}
            rows={6}
            className="w-full text-xs font-mono p-3 border border-gray-300 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-y"
          />

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handlePreview}
              disabled={!input.trim()}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-40 transition-colors"
            >
              Preview
            </button>
            {preview && preview.length > 0 && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 transition-colors"
              >
                {importing ? 'Importing...' : `Import ${preview.length} listings`}
              </button>
            )}
          </div>

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto border border-gray-200 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">ID</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Brand</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Model</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">→ Canonical</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const canonical = normalizeBrand(row.brand);
                    return (
                      <tr key={i} className={`border-t border-gray-100 ${!canonical ? 'bg-red-50' : ''}`}>
                        <td className="px-2 py-1 font-mono text-gray-500">#{row.id}</td>
                        <td className="px-2 py-1">{row.brand}</td>
                        <td className="px-2 py-1 text-gray-500">{row.model || '—'}</td>
                        <td className="px-2 py-1">
                          {canonical ? (
                            <span className="text-green-700">{canonical}</span>
                          ) : (
                            <span className="text-red-600">unknown</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`mt-3 p-3 rounded-md text-xs ${result.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex items-center gap-1.5 font-medium">
                {result.updated > 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                )}
                {result.updated} updated, {result.skipped} skipped
              </div>
              {result.errors.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-red-600">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
