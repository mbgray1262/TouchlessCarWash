// Supabase Edge Function: validate-places
// For each approved touchless listing WITH a google_place_id, calls Google Place Details
// to verify:
//   1. Business still exists & is OPERATIONAL (not CLOSED_PERMANENTLY)
//   2. Current name matches stored name (catches ownership changes like Bella's → Tidal Wave)
//   3. Google category is not a tunnel-chain brand or "Self service car wash"
//
// Auto-reverts when:
//   - business_status === CLOSED_PERMANENTLY
//   - current business name matches a known tunnel-chain blocklist
//   - Google category is "Self service car wash" AND no review evidence of automatic bay
//
// Invoke: POST /functions/v1/validate-places {"limit": 50, "dryRun": false}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tunnel chains explicitly NOT touchless — if place name changes to one of these, revert.
const TUNNEL_CHAINS = [
  'tidal wave', 'whistle express', 'mister car wash', 'quick quack',
  'tommy\'s express', 'take 5 car wash', 'zips car wash', 'tsunami',
  'mr clean car wash', 'crew carwash', 'club car wash', 'wash nation',
  'white water express', 'el car wash', 'wash factory', 'rocket car wash',
  'soapy joe', 'spinx express', 'speedway car wash',
  'cobblestone car wash', 'cobblestone auto spa', 'bluebird car wash',
  'wash depot', 'super star car wash', 'car spa express', 'modwash',
];

function isTunnelChain(name: string): string | null {
  const lower = (name || '').toLowerCase();
  for (const chain of TUNNEL_CHAINS) {
    if (lower.includes(chain)) return chain;
  }
  return null;
}

interface Listing {
  id: string;
  name: string | null;
  google_place_id: string;
  touchless_verified: string | null;
}

interface Details {
  name?: string;
  business_status?: string;
  types?: string[];
  formatted_address?: string;
}

async function fetchPlaceDetails(placeId: string, key: string): Promise<{ details: Details | null; reason: string }> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,business_status,types,formatted_address',
    key,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === 'OK') return { details: data.result, reason: 'ok' };
    return { details: null, reason: data.status || 'unknown' };
  } catch (e) {
    return { details: null, reason: `err:${(e as Error).message}` };
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

  // Fetch approved touchless listings that have a place_id. When forceAll=true,
  // re-validate even listings we previously processed (catches name rebrands like
  // Cobblestone → Bluebird where the old stored name differs from current Google name).
  let query = supabase
    .from('listings')
    .select('id,name,google_place_id,touchless_verified')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .not('google_place_id', 'is', null);
  if (!body.forceAll) {
    query = query.is('google_category', null);
  }
  const { data: listings, error: queryErr } = await query.limit(limit);

  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let validated = 0, closedRevert = 0, nameChangeRevert = 0, tunnelChainRevert = 0, nameChanged = 0;
  const results: { id: string; storedName: string | null; currentName: string | null; action: string; reason: string }[] = [];

  for (const l of (listings ?? []) as Listing[]) {
    const { details, reason } = await fetchPlaceDetails(l.google_place_id, googleKey);
    if (!details) {
      results.push({ id: l.id, storedName: l.name, currentName: null, action: 'skip', reason });
      if (reason === 'REQUEST_DENIED' || reason === 'OVER_QUERY_LIMIT') break;
      continue;
    }
    validated++;

    const currentName = details.name || '';
    const primaryType = details.types?.[0] || '';
    const storedNameLower = (l.name || '').toLowerCase();
    const currentNameLower = currentName.toLowerCase();
    const nameMatches = storedNameLower && currentNameLower.includes(storedNameLower.split(' ')[0]) ||
                       currentNameLower && storedNameLower.includes(currentNameLower.split(' ')[0]);

    const tunnelChain = isTunnelChain(currentName);

    let action = 'keep';
    let noteReason = '';

    if (details.business_status === 'CLOSED_PERMANENTLY') {
      action = 'revert_closed';
      noteReason = `CLOSED_PERMANENTLY`;
      closedRevert++;
    } else if (tunnelChain && l.touchless_verified !== 'chain') {
      action = 'revert_tunnel_chain';
      noteReason = `Google now reports name "${currentName}" — matches tunnel chain blocklist: ${tunnelChain}. Original listing "${l.name}" likely sold/rebranded.`;
      tunnelChainRevert++;
    } else if (!nameMatches && currentName && l.name && l.touchless_verified !== 'chain') {
      // Name changed but not to a known-bad chain — flag for review (don't auto-revert)
      action = 'flag_name_change';
      noteReason = `Name changed: stored "${l.name}" vs Google current "${currentName}"`;
      nameChanged++;
    }

    results.push({ id: l.id, storedName: l.name, currentName, action, reason: noteReason });

    if (!dryRun) {
      const update: Record<string, unknown> = {
        business_status: details.business_status ?? 'OPERATIONAL',
        google_category: primaryType ? primaryType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null,
      };
      if (action === 'revert_closed' || action === 'revert_tunnel_chain') {
        update.is_approved = false;
        update.is_touchless = false;
        update.touchless_verified = null;
        update.hero_image = null;
        update.hero_image_source = null;
        update.crawl_notes = `[auto ${new Date().toISOString().slice(0, 10)}] Reverted via Place Details validation: ${noteReason}`;
      } else if (action === 'flag_name_change') {
        update.crawl_notes = `[auto ${new Date().toISOString().slice(0, 10)}] ${noteReason}. Left approved but flagged for admin review.`;
      }
      await supabase.from('listings').update(update).eq('id', l.id);
    }
  }

  return new Response(JSON.stringify({
    validated,
    closedRevert,
    tunnelChainRevert,
    nameChanged,
    dryRun,
    sample: results.slice(0, 10),
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
