// Supabase Edge Function: backfill-place-ids
// For each approved touchless listing, calls Google Places 'Find Place From Text'
// using GOOGLE_PLACES_API_KEY (Supabase secret) and writes:
//   - google_place_id (if not already set)
//   - business_status (OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY)
// When business_status == CLOSED_PERMANENTLY → auto-revert the listing.
//
// Invoke: POST /functions/v1/backfill-place-ids {"limit": 50, "dryRun": false, "mode": "missing-pid|missing-status|all"}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Listing {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
}

async function findPlaceInfo(l: Listing, key: string): Promise<{ pid: string | null; businessStatus: string | null; reason: string }> {
  const parts = [l.name, l.address, l.city, l.state].filter(Boolean);
  const input = parts.join(' ').trim();
  if (!input) return { pid: null, businessStatus: null, reason: 'no_input' };

  const params = new URLSearchParams({
    input,
    inputtype: 'textquery',
    fields: 'place_id,name,formatted_address,business_status',
    key,
  });
  if (l.latitude && l.longitude) {
    params.set('locationbias', `circle:5000@${l.latitude},${l.longitude}`);
  }

  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const status: string = data.status ?? '';
    if (status === 'OK' && data.candidates?.length) {
      const c = data.candidates[0];
      return { pid: c.place_id, businessStatus: c.business_status ?? 'OPERATIONAL', reason: 'ok' };
    }
    return { pid: null, businessStatus: null, reason: status || 'no_candidates' };
  } catch (e) {
    return { pid: null, businessStatus: null, reason: `err:${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

  if (!googleKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit: number = Math.min(Math.max(1, body.limit ?? 50), 500);
  const dryRun: boolean = !!body.dryRun;
  const mode: 'missing-pid' | 'all' | 'missing-status' = body.mode ?? 'missing-pid';

  let query = supabase
    .from('listings')
    .select('id,name,address,city,state,zip,latitude,longitude,google_place_id')
    .eq('is_touchless', true)
    .eq('is_approved', true);
  if (mode === 'missing-pid') query = query.is('google_place_id', null);
  else if (mode === 'missing-status') query = query.is('business_status', null);

  const { data: listings, error: queryErr } = await query.limit(limit);
  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let pidFound = 0, pidMissed = 0;
  let closedReverts = 0, operationalOk = 0, tempClosed = 0;
  const reasons: Record<string, number> = {};
  const results: { id: string; name: string | null; pid: string | null; status: string | null; reason: string }[] = [];

  for (const l of (listings ?? []) as Listing[]) {
    const { pid, businessStatus, reason } = await findPlaceInfo(l, googleKey);
    results.push({ id: l.id, name: l.name, pid, status: businessStatus, reason });
    if (pid) pidFound++; else pidMissed++;

    if (businessStatus === 'CLOSED_PERMANENTLY') {
      closedReverts++;
      if (!dryRun) {
        await supabase.from('listings').update({
          is_approved: false,
          is_touchless: false,
          touchless_verified: null,
          hero_image: null,
          hero_image_source: null,
          business_status: 'CLOSED_PERMANENTLY',
          google_place_id: pid ?? l.google_place_id,
          crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Reverted: Google Places reports CLOSED_PERMANENTLY.`,
        }).eq('id', l.id);
      }
    } else if (businessStatus === 'CLOSED_TEMPORARILY') {
      tempClosed++;
      if (!dryRun) {
        await supabase.from('listings').update({
          business_status: 'CLOSED_TEMPORARILY',
          google_place_id: pid ?? l.google_place_id,
        }).eq('id', l.id);
      }
    } else if (businessStatus === 'OPERATIONAL') {
      operationalOk++;
      if (!dryRun) {
        const update: Record<string, unknown> = { business_status: 'OPERATIONAL' };
        if (pid && !l.google_place_id) update.google_place_id = pid;
        await supabase.from('listings').update(update).eq('id', l.id);
      }
    } else if (pid && !dryRun && !l.google_place_id) {
      await supabase.from('listings').update({ google_place_id: pid }).eq('id', l.id);
    }

    if (!pid) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (reason === 'REQUEST_DENIED' || reason === 'OVER_QUERY_LIMIT') break;
    }
  }

  return new Response(JSON.stringify({
    mode,
    processed: pidFound + pidMissed,
    pidFound,
    pidMissed,
    closedReverts,
    tempClosed,
    operationalOk,
    reasons,
    dryRun,
    sample: results.slice(0, 5),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
