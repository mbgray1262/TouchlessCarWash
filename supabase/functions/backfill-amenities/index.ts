// Supabase Edge Function: backfill-amenities
// For each approved touchless listing with empty/null amenities, fetches
// Place Details and infers amenities from types + editorial_summary +
// reviews. Stores a curated amenities array.
//
// Invoke: POST /functions/v1/backfill-amenities {"limit": 50}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Standard touchless-wash amenities we'll infer from Place Details + reviews
const AMENITY_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Touchless automatic wash', re: /touch[\s-]?(less|free)|brushless/i },
  { name: 'Laser wash', re: /laser[\s-]?wash/i },
  { name: 'Free vacuums', re: /free\s+vacuum/i },
  { name: 'Vacuum stations', re: /vacuum/i },
  { name: 'Open 24 hours', re: /24[\s-]?(hour|hr|\/7)/i },
  { name: 'Unlimited wash plans', re: /unlimited|monthly\s+plan|membership/i },
  { name: 'Tire shine', re: /tire\s+shine/i },
  { name: 'Wax', re: /\bwax\b|ceramic/i },
  { name: 'Underbody wash', re: /underbody|under\s+carriage/i },
  { name: 'Spot-free rinse', re: /spot[\s-]?free/i },
  { name: 'Pet wash', re: /pet\s+wash|dog\s+wash/i },
  { name: 'Self-serve bays', re: /self[\s-]?serv/i },
  { name: 'Credit card accepted', re: /credit[\s-]?card/i },
];

interface Listing {
  id: string;
  name: string | null;
  google_place_id: string;
  parent_chain: string | null;
}

async function placeDetails(pid: string, key: string): Promise<any> {
  const fields = ['types', 'editorial_summary', 'reviews'].join(',');
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pid}&fields=${fields}&key=${key}`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    return d.status === 'OK' ? d.result : null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!googleKey) return new Response(JSON.stringify({ error: 'no key' }), { status: 500, headers: corsHeaders });
  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const limit: number = Math.min(Math.max(1, body.limit ?? 50), 200);

  const { data: listings, error } = await supabase
    .from('listings')
    .select('id,name,google_place_id,parent_chain')
    .eq('is_touchless', true).eq('is_approved', true)
    .not('google_place_id', 'is', null)
    .or('amenities.is.null,amenities.eq.{}')
    .limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let populated = 0, skipped = 0;
  for (const l of (listings ?? []) as Listing[]) {
    const d = await placeDetails(l.google_place_id, googleKey);
    if (!d) { skipped++; continue; }
    const text = [
      d.editorial_summary?.overview || '',
      ...(d.reviews?.slice(0, 5).map((r: any) => r.text || '') ?? []),
      ...(d.types ?? []),
      l.name ?? '',
    ].join(' ').toLowerCase();

    const amenities = new Set<string>();
    // Always add "touchless automatic" for touchless-verified listings
    amenities.add('Touchless automatic wash');
    for (const { name, re } of AMENITY_PATTERNS) {
      if (re.test(text)) amenities.add(name);
    }
    // Gas-station chains typically have vacuums + 24h
    if (l.parent_chain && ['Circle K', 'Holiday Stationstores', 'Kwik Trip', 'Sheetz', 'BP', 'Shell'].includes(l.parent_chain)) {
      amenities.add('Vacuum stations');
      amenities.add('Credit card accepted');
    }
    const arr = Array.from(amenities);
    await supabase.from('listings').update({ amenities: arr }).eq('id', l.id);
    populated++;
  }

  return new Response(JSON.stringify({ processed: (listings ?? []).length, populated, skipped }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
