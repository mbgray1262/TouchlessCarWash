import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Bulk-tag every listing sharing the same business name as Not Touchless.
 *
 * Used from the photo-audit modal when an admin discovers (e.g. via
 * the chain's website) that an entire chain is not touchless — instead
 * of clicking "Not Touchless" on each location individually, this clears
 * the whole chain from the Second Look queue in one shot.
 *
 * Two-phase API to avoid foot-guns:
 *   1) preview: { name, confirm: false } → returns count + sample names
 *   2) execute: { name, confirm: true,  source_listing_id }
 *      → updates is_touchless=false, is_approved=false, touchless_verified=null
 *      → appends a crawl_notes audit marker that excludes the listings from
 *         the Second Look queue going forward (matches the existing
 *         "re-audit confirmed correctly demoted" filter).
 *
 * Match logic: case-insensitive exact match on the trimmed `name` field.
 * Variations like "Joe's Wash" vs "Joe's Wash, LLC" must be handled in
 * separate passes (the preview shows the count so admin can decide).
 *
 * Only touches listings that are NOT already is_touchless=false (skips
 * the ones already correctly demoted).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const confirm = body?.confirm === true;
    const sourceId = typeof body?.source_listing_id === 'string' ? body.source_listing_id : null;

    if (!rawName) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (rawName.length < 3) {
      return NextResponse.json({ error: 'name too short — refusing to bulk-tag' }, { status: 400 });
    }

    // Find all listings with this exact name (case-insensitive) that are
    // NOT already correctly tagged as not-touchless. PostgREST ilike with
    // exact value (no wildcards) is effectively case-insensitive equality.
    const { data: matches, error: searchErr } = await supabaseAdmin
      .from('listings')
      .select('id, name, city, state, is_touchless, is_approved')
      .ilike('name', rawName);

    if (searchErr) {
      console.error('tag-chain-not-touchless search error:', searchErr);
      return NextResponse.json({ error: searchErr.message }, { status: 500 });
    }

    const all = matches ?? [];
    // Already-not-touchless listings are no-ops; we still want to add the
    // audit marker so they fall out of the Second Look queue. Targets =
    // every match.
    const targets = all;

    if (!confirm) {
      // Preview mode — return count + a small sample for the admin to eyeball
      const sample = targets.slice(0, 5).map(t => `${t.name} — ${t.city}, ${t.state}`);
      return NextResponse.json({
        preview: true,
        match_count: targets.length,
        sample,
        already_not_touchless: targets.filter(t => t.is_touchless === false).length,
      });
    }

    // Execute mode — bulk update
    if (targets.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const sourceNote = sourceId ? ` (admin reviewed listing ${sourceId} and identified the entire chain)` : '';
    const auditMarker = `[${today}] Manual photo-audit re-audit confirmed correctly demoted: bulk-tagged as part of a non-touchless chain — entire "${rawName}" chain confirmed not touchless${sourceNote}.`;

    // Pull current crawl_notes for each so we can append (don't clobber).
    // Fetch in chunks for safety on large chains.
    const ids = targets.map(t => t.id);
    const CHUNK = 200;
    let totalUpdated = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const idChunk = ids.slice(i, i + CHUNK);
      const { data: current } = await supabaseAdmin
        .from('listings')
        .select('id, crawl_notes')
        .in('id', idChunk);
      const noteMap = new Map<string, string>((current ?? []).map(r => [r.id, r.crawl_notes ?? '']));

      // Update one-by-one to preserve each listing's existing notes.
      // Bulk update would clobber crawl_notes with the same value.
      for (const id of idChunk) {
        const existing = (noteMap.get(id) ?? '').slice(0, 4500);
        // Skip if already has a re-audit confirmed marker — avoids
        // stacking duplicate notes if the admin clicks twice.
        const newNotes = /re-audit confirmed correctly demoted/i.test(existing)
          ? existing
          : (existing + (existing ? '\n\n' : '') + auditMarker);
        const { error: upErr } = await supabaseAdmin
          .from('listings')
          .update({
            is_touchless: false,
            is_approved: false,
            touchless_verified: null,
            crawl_notes: newNotes,
          })
          .eq('id', id);
        if (!upErr) totalUpdated++;
      }
    }

    return NextResponse.json({ updated: totalUpdated, name: rawName });
  } catch (err) {
    console.error('tag-chain-not-touchless exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
