'use client';

import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';

export interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

export async function parseSpreadsheetFile(file: File): Promise<RawRow[]> {
  const ext = file.name.toLowerCase().split('.').pop();

  if (ext === 'csv') {
    const text = await file.text();
    return parseCSVText(text);
  }

  const buffer = await file.arrayBuffer();
  const wb = xlsxRead(buffer, { type: 'array', dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return xlsxUtils.sheet_to_json(ws, { defval: null }) as RawRow[];
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
