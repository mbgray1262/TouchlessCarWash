// Supabase Edge Function: qa-hero-streetview
// Helper for hero QA sampling — given a list of listing IDs, returns both the
// hero URL and a generated Street View static URL (with API key) so we can
// download both and visually review.
//
// Invoke: POST /functions/v1/qa-hero-streetview {"ids": ["uuid1","uuid2",...]}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!googleKey) return new Response(JSON.stringify({ error: 'no key' }), { status: 500, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0 || ids.length > 200) {
    return new Response(JSON.stringify({ error: 'provide 1-200 ids' }), { status: 400, headers: corsHeaders });
  }

  const { data: listings } = await supabase
    .from('listings')
    .select('id,name,city,state,latitude,longitude,hero_image,google_place_id,parent_chain,equipment_brand,equipment_model')
    .in('id', ids);

  const results: Array<Record<string, unknown>> = [];
  for (const l of listings ?? []) {
    let streetViewUrl: string | null = null;
    let streetViewPanoId: string | null = null;
    if (l.latitude && l.longitude) {
      try {
        // Check if a pano exists at the listing's place_id first (more accurate than raw lat/lng)
        const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${l.latitude},${l.longitude}&key=${googleKey}`;
        const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(5000) });
        const meta = await metaRes.json();
        if (meta.status === 'OK' && meta.pano_id) {
          streetViewPanoId = meta.pano_id;
          streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x400&pano=${meta.pano_id}&fov=90&key=${googleKey}`;
        }
      } catch { /* swallow */ }
    }
    results.push({
      id: l.id,
      name: l.name,
      city: l.city,
      state: l.state,
      hero_image: l.hero_image,
      street_view_url: streetViewUrl,
      pano_id: streetViewPanoId,
      parent_chain: l.parent_chain,
      equipment_brand: l.equipment_brand,
      equipment_model: l.equipment_model,
      place_id: l.google_place_id,
    });
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
