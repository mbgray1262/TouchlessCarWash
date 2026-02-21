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

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0) return true;
  return false;
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

    const candidates: { placeId: string; hours: HoursMap }[] = [];

    for (const row of rawRows) {
      const placeId = colStr(row, 'place_id', 'Place ID', 'google_place_id', 'Google Place ID');
      if (!placeId) { summary.skipped_no_place_id++; continue; }

      const rawHours = colStr(row, 'working_hours', 'Working Hours', 'hours', 'Hours');
      const hours = parseWorkingHours(rawHours);
      if (!hours) { summary.skipped_no_hours_data++; continue; }

      candidates.push({ placeId, hours });
    }

    if (candidates.length === 0) {
      return NextResponse.json(summary);
    }

    const placeIds = candidates.map(c => c.placeId);

    const { data: listings, error: fetchErr } = await supabase
      .from('listings')
      .select('id, google_place_id, hours')
      .in('google_place_id', placeIds);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const listingMap = new Map<string, { id: string; hours: unknown }>();
    for (const l of (listings ?? [])) {
      if (l.google_place_id) listingMap.set(l.google_place_id, { id: l.id, hours: l.hours });
    }

    const updates: { id: string; hours: HoursMap }[] = [];

    for (const { placeId, hours } of candidates) {
      const listing = listingMap.get(placeId);
      if (!listing) { summary.skipped_no_match++; continue; }
      if (!isEmpty(listing.hours)) { summary.skipped_already_has_hours++; continue; }
      updates.push({ id: listing.id, hours });
    }

    const DB_BATCH = 200;
    for (let i = 0; i < updates.length; i += DB_BATCH) {
      const batch = updates.slice(i, i + DB_BATCH);

      await Promise.all(
        batch.map(({ id, hours }) =>
          supabase
            .from('listings')
            .update({ hours })
            .eq('id', id)
            .then(({ error }) => {
              if (error) {
                if (summary.errors.length < 20) summary.errors.push(`id ${id}: ${error.message}`);
              } else {
                summary.hours_updated++;
              }
            })
        )
      );
    }

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
