'use client';

import { useState, useCallback } from 'react';
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Clipboard, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EQUIPMENT_BRANDS } from './types';

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

function normalizeBrand(input: string, customBrands?: { value: string; label: string }[]): string | null {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  // Check static aliases first
  if (BRAND_ALIASES[lower]) return BRAND_ALIASES[lower];
  // Check against EQUIPMENT_BRANDS labels (case-insensitive)
  const hardcoded = EQUIPMENT_BRANDS.find(b => b.label.toLowerCase() === lower);
  if (hardcoded) return hardcoded.value;
  // Check against custom brands from DB
  if (customBrands) {
    const custom = customBrands.find(b => b.label.toLowerCase() === lower || b.value === lower);
    if (custom) return custom.value;
  }
  // Try slug-ifying as a new custom brand
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

interface EquipmentImportProps {
  onComplete: () => void;
  getModelsForBrand: (brand: string) => string[];
  customBrands: { value: string; label: string }[];
}

export function EquipmentImport({ onComplete, getModelsForBrand, customBrands }: EquipmentImportProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const [copied, setCopied] = useState(false);

  const buildGeminiPrompt = useCallback(() => {
    // Build the brand+model reference from current DB state
    const allBrands = [
      ...EQUIPMENT_BRANDS.filter(b => b.value !== 'other'),
      ...customBrands,
    ];

    const brandLines = allBrands.map(b => {
      const models = getModelsForBrand(b.value);
      if (models.length > 0) {
        return `  - ${b.label}: ${models.join(', ')}`;
      }
      return `  - ${b.label}`;
    }).join('\n');

    return `Classify the car wash equipment for listing cards on this page.

STAY ON THIS PAGE. Do not click pagination, "Next", "Prev", or any links that leave this page. Scroll down to see all cards on the current page before responding.

WHAT TO DO:
1. Scroll through ALL cards on this page.
2. For each card WITHOUT a 🔧 wrench icon, look at the hero thumbnail photo and listing name.
3. Identify the equipment brand and model if you can. If you can't tell, skip that listing.

EVIDENCE TO USE:
- Equipment visible in the hero thumbnail (manufacturer logos, equipment shape, LED arches, spray arm design)
- The listing name and location
- Your knowledge of car wash chains and their equipment suppliers

RULES:
- SKIP cards that already have a 🔧 wrench icon (they're already classified).
- Do NOT guess based on the business name alone. "Laser Wash" in a name does NOT mean PDQ LaserWash equipment.
- Be specific about models when you can visually confirm (e.g., LED arches = LaserWash 360 Plus). If you can't tell the exact model, set model to null.
- Use the #xxxxxx ID code shown on each card.

Output ONLY a JSON array:
[
  {"id": "abc123", "brand": "PDQ (LaserWash)", "model": "LaserWash 360 Plus"},
  {"id": "def456", "brand": "WashWorld", "model": null}
]

Use EXACT brand/model names from this reference list:
${brandLines}

If a brand or model is not in this list, use the actual name — it will be added automatically.`;
  }, [getModelsForBrand, customBrands]);

  const handleCopyPrompt = async () => {
    const prompt = buildGeminiPrompt();
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

    // Batch-resolve short ID prefixes to full UUIDs
    const idMap = new Map<string, string>(); // shortId -> fullId
    const shortIds = preview.filter(r => r.id.length < 36).map(r => r.id);
    if (shortIds.length > 0) {
      // Fetch all touchless listing IDs and match prefixes client-side
      // Need to paginate since Supabase default limit is 1000
      let allListings: { id: string }[] = [];
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('listings')
          .select('id')
          .eq('is_touchless', true)
          .range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allListings = allListings.concat(batch);
        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      for (const shortId of shortIds) {
        const matches = allListings.filter(l => l.id.startsWith(shortId));
        if (matches.length === 1) {
          idMap.set(shortId, matches[0].id);
        } else if (matches.length > 1) {
          idMap.set(shortId, '__ambiguous__');
        }
      }
    }

    for (const row of preview) {
      const brand = normalizeBrand(row.brand, customBrands);
      if (!brand) {
        errors.push(`#${row.id}: unknown brand "${row.brand}"`);
        skipped++;
        continue;
      }

      // Resolve short ID prefix to full UUID
      let listingId = row.id;
      if (listingId.length < 36) {
        const resolved = idMap.get(listingId);
        if (!resolved) {
          errors.push(`#${row.id}: listing not found`);
          skipped++;
          continue;
        }
        if (resolved === '__ambiguous__') {
          errors.push(`#${row.id}: ambiguous ID prefix (multiple matches)`);
          skipped++;
          continue;
        }
        listingId = resolved;
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
          <div className="flex items-center gap-3 mt-3 mb-3">
            <button
              onClick={handleCopyPrompt}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Gemini Prompt'}
            </button>
            <span className="text-xs text-gray-400">Includes current list of brands &amp; models from database</span>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Paste Gemini&apos;s JSON output below. Each row needs: <code className="bg-gray-100 px-1 rounded">id</code> (the #prefix from card), <code className="bg-gray-100 px-1 rounded">brand</code>, and optionally <code className="bg-gray-100 px-1 rounded">model</code>.
          </p>

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
                    const canonical = normalizeBrand(row.brand, customBrands);
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
