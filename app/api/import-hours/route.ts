import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type HoursMap = Record<string, string>;

function parseWorkingHours(raw: unknown): HoursMap | null {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const result: HoursMap = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    const dayKey = key.toLowerCase();
    if (!DAYS.includes(dayKey)) continue;

    if (Array.isArray(val)) {
      const first = val[0];
      if (!first || String(first).toLowerCase() === 'closed') {
        result[dayKey] = 'Closed';
      } else {
        result[dayKey] = String(first).trim();
      }
    } else if (typeof val === 'string') {
      const str = val.trim();
      result[dayKey] = str === '' || str.toLowerCase() === 'closed' ? 'Closed' : str;
    }
  }

  if (Object.keys(result).length === 0) return null;
  return result;
}

function colStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected application/json body with { rows: [...] }' }, { status: 400 });
    }

    const body = await req.json();
    const rawRows: Record<string, unknown>[] = body?.rows;

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows provided.' }, { status: 400 });
    }

    const summary = {
      total_rows: rawRows.length,
      hours_updated: 0,
      skipped_already_has_hours: 0,
      skipped_no_match: 0,
      skipped_no_place_id: 0,
      skipped_no_hours_data: 0,
      errors: [] as string[],
    };

    const rpcRows: { place_id: string; working_hours: HoursMap }[] = [];

    for (const row of rawRows) {
      const placeId = colStr(row, 'place_id', 'Place ID', 'google_place_id', 'Google Place ID');
      if (!placeId) { summary.skipped_no_place_id++; continue; }

      const rawHours = colStr(row, 'working_hours', 'Working Hours', 'hours', 'Hours');
      const hours = parseWorkingHours(rawHours);
      if (!hours) { summary.skipped_no_hours_data++; continue; }

      rpcRows.push({ place_id: placeId, working_hours: hours });
    }

    if (rpcRows.length === 0) {
      return NextResponse.json(summary);
    }

    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('bulk_import_hours', { rows: rpcRows });

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const r = rpcResult as { matched: number; updated: number; skipped_already_has_hours: number; skipped_no_match: number };
    summary.hours_updated = r.updated ?? 0;
    summary.skipped_already_has_hours = r.skipped_already_has_hours ?? 0;
    summary.skipped_no_match = r.skipped_no_match ?? 0;

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
