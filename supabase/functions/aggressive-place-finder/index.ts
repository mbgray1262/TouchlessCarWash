// Supabase Edge Function: aggressive-place-finder
// For listings lacking google_place_id, tries multiple strategies to find one.
// Properly handles the unique constraint on google_place_id:
//   - If Google returns a pid already claimed by another listing → DUPLICATE DETECTED
//     → revert the current listing (hard revert as dup)
//   - If Google returns a fresh pid → set it on this listing
//
// Strategies tried in order:
//   1. name + full address + city + state (what original Find Place tries)
//   2. name + city + state (no street)
//   3. name only, biased by lat/lng
//   4. Nearby Search by lat/lng + name keyword
//
// Invoke: POST /functions/v1/aggressive-place-finder {"limit": 50}

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
  latitude: number | null;
  longitude: number | null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function findPlace(input: string, key: string, locationBias?: string): Promise<{ pid: string; name: string; status: string } | null> {
  const params = new URLSearchParams({
    input, inputtype: 'textquery',
    fields: 'place_id,name,business_status', key,
  });
  if (locationBias) params.set('locationbias', locationBias);
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`);
    const d = await r.json();
    if (d.status === 'OK' && d.candidates?.[0]?.place_id) {
      const c = d.candidates[0];
      return { pid: c.place_id, name: c.name ?? '', status: c.business_status ?? 'OPERATIONAL' };
    }
  } catch { /* swallow */ }
  return null;
}

async function nearbySearch(lat: number, lng: number, name: string, key: string): Promise<{ pid: string; name: string; status: string } | null> {
  const params = new URLSearchParams({
    location: `${lat},${lng}`, radius: '2000', keyword: name, type: 'car_wash', key,
  });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`);
    const d = await r.json();
    if (d.status === 'OK' && Array.isArray(d.results) && d.results.length > 0) {
      const target = normName(name);
      let best: any = null;
      let bestScore = 0;
      for (const result of d.results) {
        const resultName = normName(result.name || '');
        let score = 0;
        if (resultName === target) score = 1.0;
        else if (resultName.includes(target) || target.includes(resultName)) score = 0.8;
        else {
          const targetWords = target.match(/.{3,}/g) ?? [];
          const hitWords = targetWords.filter(w => resultName.includes(w));
          if (hitWords.length > 0) score = 0.3 + 0.2 * (hitWords.length / targetWords.length);
        }
        if (score > bestScore) { bestScore = score; best = result; }
      }
      if (best && bestScore >= 0.5) {
        return { pid: best.place_id, name: best.name ?? '', status: best.business_status ?? 'OPERATIONAL' };
      }
    }
  } catch { /* swallow */ }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!googleKey) return new Response(JSON.stringify({ error: 'no key' }), { status: 500, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit: number = Math.min(Math.max(1, body.limit ?? 50), 200);

  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,name,address,city,state,latitude,longitude')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .is('google_place_id', null)
    .limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let linked = 0, dupsReverted = 0, notFound = 0;
  const byStrategy: Record<string, number> = { s1_full: 0, s2_name_city: 0, s3_name_biased: 0, s4_nearby: 0 };
  const results: Array<{ id: string; name: string | null; action: string; reason: string }> = [];

  for (const l of (listings ?? []) as Listing[]) {
    if (!l.name) { notFound++; continue; }
    const locBias = (l.latitude && l.longitude) ? `circle:3000@${l.latitude},${l.longitude}` : undefined;

    let hit = null;
    let strategy: string | null = null;

    const full = [l.name, l.address, l.city, l.state].filter(Boolean).join(' ');
    hit = await findPlace(full, googleKey, locBias);
    if (hit) strategy = 's1_full';

    if (!hit && l.name && l.city && l.state) {
      hit = await findPlace(`${l.name} ${l.city} ${l.state}`, googleKey, locBias);
      if (hit) strategy = 's2_name_city';
    }
    if (!hit && l.name && locBias) {
      hit = await findPlace(l.name, googleKey, locBias);
      if (hit) strategy = 's3_name_biased';
    }
    if (!hit && l.latitude && l.longitude) {
      hit = await nearbySearch(l.latitude, l.longitude, l.name, googleKey);
      if (hit) strategy = 's4_nearby';
    }

    if (!hit) {
      notFound++;
      results.push({ id: l.id, name: l.name, action: 'notfound', reason: 'no Google match' });
      continue;
    }

    // Check if this pid is already claimed by another listing (duplicate detection)
    const { data: existing } = await supabase
      .from('listings')
      .select('id,is_approved,is_touchless,hero_image,google_photos_count')
      .eq('google_place_id', hit.pid)
      .neq('id', l.id)
      .limit(1);

    if (existing && existing.length > 0) {
      // Duplicate: the pid already belongs to another listing.
      // Revert this one as a dup (it's the same physical business).
      dupsReverted++;
      await supabase.from('listings').update({
        is_approved: false,
        is_touchless: false,
        touchless_verified: null,
        hero_image: null,
        hero_image_source: null,
        crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Reverted as duplicate: same Google place_id as ${existing[0].id} (Google name: "${hit.name}").`,
      }).eq('id', l.id);
      results.push({ id: l.id, name: l.name, action: 'revert_dup', reason: `same pid as ${existing[0].id.slice(0, 8)}` });
    } else {
      // Fresh pid — link it
      linked++;
      byStrategy[strategy!] = (byStrategy[strategy!] ?? 0) + 1;
      await supabase.from('listings').update({
        google_place_id: hit.pid,
        business_status: hit.status,
      }).eq('id', l.id);
      results.push({ id: l.id, name: l.name, action: 'linked', reason: `${strategy} → "${hit.name}"` });
    }
  }

  return new Response(JSON.stringify({
    processed: (listings ?? []).length, linked, dupsReverted, notFound, byStrategy,
    sample: results.slice(0, 15),
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
