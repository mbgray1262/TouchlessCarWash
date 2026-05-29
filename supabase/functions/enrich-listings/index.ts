// Supabase Edge Function: enrich-listings
//
// One entry point that fills in INCOMPLETE listings using only free data
// sources. It is the edge-function port of scripts/enrich-new-candidates.sh,
// wired to the functions that work by listing id (so it can enrich the
// just-imported, still-unapproved listing the Import Hub hands it).
//
// A complete listing has: description, hero, amenities, hours,
// google_maps_url, and >=1 review snippet. This function delegates each gap to
// the cheapest free filler:
//
//   - google-enrich   → hours, google_maps_url, rating, photos, AND review
//                        snippets, all from one Google Place Details call
//                        ($0 inside the Maps free tier). Works by listing id on
//                        ANY listing (approved or not). This is our free
//                        reviews path — no SerpAPI / DataForSEO.
//   - generate-descriptions → the AI description, via its tuned anti-templating
//                        prompt (never re-implemented here).
//   - backfill-amenities    → amenities (limit-based; approved listings only),
//                        run in batch mode only.
//
// Hero images are intentionally NOT auto-assigned here: hero quality is
// curated (street-view fallbacks can be broken, Google's top photo can be a
// car close-up). Missing heroes are surfaced on the dashboard card and fixed
// with the dedicated Hero Audit / Hero Review tools instead.
//
// Request body (all optional):
//   { ids?: string[], batch?: number, regenerate?: boolean, dryRun?: boolean }
//   - ids:        enrich exactly these listings (used by the Import Hub)
//   - batch:      when ids omitted, enrich up to N incomplete listings
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

// Listings missing any of these column-based components are "incomplete".
// (review-snippet gaps overlap heavily with missing google_maps_url, which is
// included here, so a google-enrich pass also fills most missing reviews.)
const INCOMPLETE_FILTER =
  'description.is.null,hero_image.is.null,hours.is.null,google_maps_url.is.null,amenities.is.null,amenities.eq.{}';

interface Candidate {
  id: string;
  description: string | null;
}

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

    const invoke = (fn: string, payload: unknown) =>
      fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .catch((e) => ({ error: String(e) }));

    // ---- Resolve candidate listings (touchless only) ----
    let candidates: Candidate[];
    if (explicitIds) {
      const { data, error } = await supabase
        .from('listings')
        .select('id, description')
        .in('id', explicitIds)
        .eq('is_touchless', true);
      if (error) throw error;
      candidates = (data ?? []) as Candidate[];
    } else {
      const { data, error } = await supabase
        .from('listings')
        .select('id, description')
        .eq('is_touchless', true)
        .or(INCOMPLETE_FILTER)
        .order('google_maps_url', { nullsFirst: true })
        .limit(batch);
      if (error) throw error;
      candidates = (data ?? []) as Candidate[];
    }

    const allIds = candidates.map((c) => c.id);
    // Only (re)generate descriptions where actually missing, unless regenerate.
    const descIds = regenerate
      ? allIds
      : candidates.filter((c) => !c.description || c.description.trim() === '').map((c) => c.id);

    if (dryRun) {
      return Response.json(
        { dryRun: true, mode: explicitIds ? 'ids' : 'batch', candidates: allIds.length, needDescription: descIds.length, ids: allIds },
        { headers: corsHeaders },
      );
    }

    const result: Record<string, unknown> = {
      mode: explicitIds ? 'ids' : 'batch',
      candidates: allIds.length,
    };

    if (allIds.length === 0) {
      result.message = 'No incomplete touchless listings matched';
      return Response.json(result, { headers: corsHeaders });
    }

    // ---- 1. Google Place Details: hours, maps_url, photos, rating, reviews (FREE) ----
    result.google = await invoke('google-enrich', { action: 'enrich_batch', listing_ids: allIds });

    // ---- 2. AI descriptions (delegated to the tuned generator) ----
    if (descIds.length > 0) {
      result.descriptions = await invoke('generate-descriptions', {
        action: 'start',
        listing_ids: descIds,
        regenerate,
      });
    } else {
      result.descriptions = { message: 'No listings missing a description' };
    }

    // ---- 3. Amenities (batch sweep only; limit-based, approved listings) ----
    if (!explicitIds) {
      result.amenities = await invoke('backfill-amenities', { limit: batch });
    }

    return Response.json(result, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
