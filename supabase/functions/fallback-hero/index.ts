// Supabase Edge Function: fallback-hero
// For every approved touchless listing missing a hero_image:
//   1. Try google_photo_url (already happens elsewhere)
//   2. Try Google Street View: call metadata endpoint to verify a pano exists,
//      then build a Street View Static URL and save as hero
//
// Both steps use Google Maps free-tier APIs (Street View metadata is FREE,
// Street View Static is $7/1000 views — but we only pay for VIEWS not URLs).
// So populating the URL field costs $0; each user that loads the listing
// page triggers a Static view at $0.007 (still within $200/mo free tier).
//
// Invoke: POST /functions/v1/fallback-hero {"limit": 100}

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
  if (!googleKey) return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), { status: 500, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit: number = Math.min(Math.max(1, body.limit ?? 100), 500);

  // Find listings lacking hero but having lat/lng
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,name,latitude,longitude,google_photo_url')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .is('hero_image', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let usedGooglePhoto = 0, usedStreetView = 0, noneAvailable = 0;
  for (const l of listings ?? []) {
    // First prefer google_photo_url
    if (l.google_photo_url) {
      await supabase.from('listings').update({
        hero_image: l.google_photo_url,
        hero_image_source: 'google-auto',
      }).eq('id', l.id);
      usedGooglePhoto++;
      continue;
    }
    // Fallback: Street View
    try {
      const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${l.latitude},${l.longitude}&key=${googleKey}`;
      const metaRes = await fetch(metaUrl, { signal: AbortSignal.timeout(5000) });
      const meta = await metaRes.json();
      if (meta.status === 'OK' && meta.pano_id) {
        const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=1200x628&pano=${meta.pano_id}&fov=90&key=${googleKey}`;
        await supabase.from('listings').update({
          hero_image: svUrl,
          hero_image_source: 'streetview-auto',
          street_view_url: svUrl,
        }).eq('id', l.id);
        usedStreetView++;
      } else {
        noneAvailable++;
      }
    } catch {
      noneAvailable++;
    }
  }

  return new Response(JSON.stringify({
    processed: (listings ?? []).length,
    usedGooglePhoto,
    usedStreetView,
    noneAvailable,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
