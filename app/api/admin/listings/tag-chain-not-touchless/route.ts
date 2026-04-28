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
 * Match logic:
 *   - If the input name contains a " - " separator (i.e. follows the
 *     "Chain Name - Location" pattern that's common in our data, e.g.
 *     "El Car Wash - Hialeah Gardens", "Blue Tide Car Wash - Touchless",
 *     "Mister Car Wash - Tucson"), the BASE chain name is extracted and
 *     the search becomes a case-insensitive prefix match on that base.
 *     This catches the 89 "El Car Wash - X" variants in one shot.
 *   - Otherwise (no separator), falls back to exact case-insensitive
 *     match on the full name.
 * The preview returns counts grouped by exact name so the admin can see
 * exactly which variants will be tagged before confirming.
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

    // Detect "Chain Name - Location" pattern. If present, match the chain
    // PREFIX (so "El Car Wash - Hialeah Gardens" finds all 89 "El Car Wash
    // - X" variants). Permissive about spacing around the dash to handle
    // typos like "El Car Wash- Sunrise" (missing leading space).
    const dashMatch = rawName.match(/^(.+?)\s*[-–—]\s+\S/);
    const baseName = dashMatch && dashMatch[1].trim().length >= 3 ? dashMatch[1].trim() : null;
    const usePrefix = baseName !== null;
    const searchTerm = usePrefix ? baseName : rawName;
    if (usePrefix && (searchTerm?.length ?? 0) < 4) {
      // "Mr - X" style — base too short to be a useful prefix; bail.
      return NextResponse.json({ error: 'extracted chain prefix too short' }, { status: 400 });
    }

    // Find matching listings. Prefix mode escapes any %/_ in the base
    // before appending the wildcard so a name with a stray underscore
    // can't blow up the LIKE pattern.
    const escapedTerm = (searchTerm ?? '').replace(/[%_]/g, (m: string) => '\\' + m);
    const ilikePattern = usePrefix ? `${escapedTerm}%` : escapedTerm;
    const { data: matches, error: searchErr } = await supabaseAdmin
      .from('listings')
      .select('id, name, city, state, is_touchless, is_approved')
      .ilike('name', ilikePattern);

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
      // Preview mode. Group by exact name so the admin can see how many
      // distinct variants exist (e.g. "El Car Wash - Hialeah Gardens"
      // vs "El Car Wash - Doral" both roll up to the "El Car Wash" base
      // — the admin gets a clear count of how many unique storefronts).
      const byName = new Map<string, { count: number; sampleLocs: string[] }>();
      for (const t of targets) {
        const entry = byName.get(t.name) ?? { count: 0, sampleLocs: [] };
        entry.count++;
        if (entry.sampleLocs.length < 1) entry.sampleLocs.push(`${t.city}, ${t.state}`);
        byName.set(t.name, entry);
      }
      const variants = Array.from(byName.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, info]) => ({ name, count: info.count, sample_location: info.sampleLocs[0] }));

      return NextResponse.json({
        preview: true,
        match_mode: usePrefix ? 'prefix' : 'exact',
        base: searchTerm,
        match_count: targets.length,
        variant_count: byName.size,
        variants: variants.slice(0, 20),
        already_not_touchless: targets.filter(t => t.is_touchless === false).length,
      });
    }

    // Execute mode — bulk update
    if (targets.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const sourceNote = sourceId ? ` (admin reviewed listing ${sourceId} and identified the entire chain)` : '';
    const chainLabel = usePrefix ? searchTerm : rawName;
    const auditMarker = `[${today}] Manual photo-audit re-audit confirmed correctly demoted: bulk-tagged as part of a non-touchless chain — entire "${chainLabel}" chain confirmed not touchless${sourceNote}.`;

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
