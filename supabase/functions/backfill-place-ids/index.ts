// Supabase Edge Function: backfill-place-ids
// Iterates through approved touchless listings missing google_place_id,
// calls Google Places 'Find Place From Text' using GOOGLE_PLACES_API_KEY
// (stored as Supabase secret), and writes place_id back to the listing.
//
// Invoke: POST /functions/v1/backfill-place-ids {"limit": 100, "dryRun": false}

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
}

async function findPlaceId(l: Listing, key: string): Promise<{ pid: string | null; reason: string }> {
  const parts = [l.name, l.address, l.city, l.state].filter(Boolean);
  const input = parts.join(' ').trim();
  if (!input) return { pid: null, reason: 'no_input' };

  const params = new URLSearchParams({
    input,
    inputtype: 'textquery',
    fields: 'place_id,name,formatted_address',
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
      return { pid: data.candidates[0].place_id, reason: 'ok' };
    }
    return { pid: null, reason: status || 'no_candidates' };
  } catch (e) {
    return { pid: null, reason: `err:${(e as Error).message}` };
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
  const limit: number = Math.min(Math.max(1, body.limit ?? 100), 500);
  const dryRun: boolean = !!body.dryRun;

  const { data: listings, error: queryErr } = await supabase
    .from('listings')
    .select('id,name,address,city,state,zip,latitude,longitude')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .is('google_place_id', null)
    .limit(limit);

  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let ok = 0, miss = 0;
  const reasons: Record<string, number> = {};
  const results: { id: string; name: string | null; pid: string | null; reason: string }[] = [];

  for (const l of listings ?? []) {
    const { pid, reason } = await findPlaceId(l as Listing, googleKey);
    results.push({ id: l.id, name: l.name, pid, reason });
    if (pid) {
      ok++;
      if (!dryRun) {
        await supabase.from('listings').update({ google_place_id: pid }).eq('id', l.id);
      }
    } else {
      miss++;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (reason === 'REQUEST_DENIED' || reason === 'OVER_QUERY_LIMIT') {
        // Abort immediately on fatal API errors
        break;
      }
    }
  }

  return new Response(JSON.stringify({
    processed: ok + miss,
    found: ok,
    missed: miss,
    reasons,
    dryRun,
    sample: results.slice(0, 5),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
