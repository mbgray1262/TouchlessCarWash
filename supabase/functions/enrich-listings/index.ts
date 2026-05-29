// Supabase Edge Function: enrich-listings
//
// Single entry point that "fills in" thin listings. It is the edge-function
// port of scripts/enrich-new-candidates.sh — but distilled to the steps that
// can run on the real `listings` table by id, including UNAPPROVED listings
// that the Import Hub just created.
//
// Design notes:
//   - Descriptions are the sensitive part (the site was once flagged by AdSense
//     for templated content), so we DELEGATE description writing to the
//     generate-descriptions function, which owns the tuned anti-templating
//     prompt. We never re-implement that prompt here.
//   - Amenity + Google passes (backfill-amenities, enrich-from-google) only run
//     on approved listings and select by `limit`, so they only make sense in
//     batch mode — they are skipped when specific ids are passed.
//
// Request body (all optional):
//   { ids?: string[], batch?: number, regenerate?: boolean, dryRun?: boolean }
//   - ids:        enrich exactly these listings (used by the Import Hub)
//   - batch:      when ids omitted, enrich up to N thin listings (bulk-fix button)
//   - regenerate: rewrite descriptions even if one already exists
//   - dryRun:     report what would be enriched without calling anything
//
// Deno runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const explicitIds: string[] | undefined = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : undefined;
    const batch: number = Math.min(Math.max(1, body.batch ?? 25), 100);
    const regenerate: boolean = body.regenerate ?? false;
    const dryRun: boolean = body.dryRun ?? false;

    // ---- Resolve which listings need a description ----
    // Only touchless listings get descriptions (matches generate-descriptions).
    let targetIds: string[];
    if (explicitIds) {
      let q = supabase
        .from('listings')
        .select('id')
        .in('id', explicitIds)
        .eq('is_touchless', true);
      if (!regenerate) q = q.is('description', null);
      const { data, error } = await q;
      if (error) throw error;
      targetIds = (data ?? []).map((r: { id: string }) => r.id);
    } else {
      let q = supabase
        .from('listings')
        .select('id')
        .eq('is_touchless', true)
        .order('review_count', { ascending: false })
        .limit(batch);
      if (!regenerate) q = q.is('description', null);
      const { data, error } = await q;
      if (error) throw error;
      targetIds = (data ?? []).map((r: { id: string }) => r.id);
    }

    if (dryRun) {
      return Response.json(
        { dryRun: true, mode: explicitIds ? 'ids' : 'batch', wouldEnrich: targetIds.length, ids: targetIds },
        { headers: corsHeaders },
      );
    }

    const result: Record<string, unknown> = {
      mode: explicitIds ? 'ids' : 'batch',
      targeted: targetIds.length,
    };

    // ---- 1. Descriptions (delegated to the tuned generator) ----
    if (targetIds.length > 0) {
      const descRes = await fetch(`${supabaseUrl}/functions/v1/generate-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: 'start', listing_ids: targetIds, regenerate }),
      });
      result.descriptions = await descRes.json().catch(() => ({ error: 'non-json response' }));
    } else {
      result.descriptions = { message: 'No listings missing a description' };
    }

    // ---- 2. Batch-only passes: amenities + Google data (approved listings only) ----
    // These select by limit internally and require is_approved=true, so they are
    // only meaningful for a broad bulk sweep, not a single just-imported listing.
    if (!explicitIds) {
      const amenitiesRes = await fetch(`${supabaseUrl}/functions/v1/backfill-amenities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ limit: batch }),
      });
      result.amenities = await amenitiesRes.json().catch(() => ({ error: 'non-json response' }));

      const googleRes = await fetch(`${supabaseUrl}/functions/v1/enrich-from-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ limit: batch, mode: 'incomplete' }),
      });
      result.google = await googleRes.json().catch(() => ({ error: 'non-json response' }));
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
