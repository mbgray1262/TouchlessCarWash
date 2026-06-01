// Supabase Edge Function: enrich-from-google
// Full enrichment pass for every approved touchless listing.
// For each listing: calls Google Place Details (Basic + Contact + Atmosphere fields)
// and populates:
//   - google_place_id (if missing)
//   - business_status (auto-reverts CLOSED_PERMANENTLY)
//   - google_category (primary type)
//   - google_photo_url (best photo URL)
//   - google_photos_count
//   - photos (array of up to 10 photo URLs)
//   - website (if ours is null)
//   - phone (if ours is null)
//   - hours (from opening_hours.weekday_text parsed into object)
//   - rating, review_count
//   - latitude, longitude (if ours are null)
//
// Cost: ~$0.025 per listing on paid plans, $0 within $200/mo Maps free tier.
// Mode: "all" = process everything; "incomplete" = only listings missing key data
//
// Invoke: POST /functions/v1/enrich-from-google {"limit": 50, "mode": "incomplete"}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TUNNEL_CHAINS = [
  'tidal wave', 'whistle express', 'mister car wash', 'quick quack',
  "tommy's express", 'take 5 car wash', 'zips car wash', 'tsunami',
  'mr clean car wash', 'crew carwash', 'club car wash', 'soapy joe',
];

function isTunnelChain(name: string): string | null {
  const lower = (name || '').toLowerCase();
  for (const chain of TUNNEL_CHAINS) if (lower.includes(chain)) return chain;
  return null;
}

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
  website: string | null;
  phone: string | null;
  touchless_verified: string | null;
}

async function findPlaceId(l: Listing, key: string): Promise<string | null> {
  const parts = [l.name, l.address, l.city, l.state].filter(Boolean).join(' ').trim();
  if (!parts) return null;
  const params = new URLSearchParams({ input: parts, inputtype: 'textquery', fields: 'place_id', key });
  if (l.latitude && l.longitude) params.set('locationbias', `circle:5000@${l.latitude},${l.longitude}`);
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`);
  const d = await r.json();
  return d.status === 'OK' && d.candidates?.[0]?.place_id || null;
}

interface PlaceDetails {
  name?: string;
  business_status?: string;
  types?: string[];
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  photos?: { photo_reference: string; width: number; height: number }[];
  opening_hours?: { weekday_text?: string[]; open_now?: boolean };
  geometry?: { location?: { lat: number; lng: number } };
  reviews?: {
    author_name?: string;
    rating?: number;
    text?: string;
    time?: number;
    relative_time_description?: string;
  }[];
}

async function fetchDetails(placeId: string, key: string): Promise<PlaceDetails | null> {
  const fields = [
    'name', 'business_status', 'types', 'formatted_address', 'geometry/location',
    'formatted_phone_number', 'website',
    'rating', 'user_ratings_total', 'opening_hours', 'photos', 'reviews',
  ].join(',');
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${key}`);
  const d = await r.json();
  return d.status === 'OK' ? (d.result as PlaceDetails) : null;
}

function photoUrl(photoRef: string, key: string, maxW = 1200): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxW}&photo_reference=${photoRef}&key=${key}`;
}

// Save up to 5 Google reviews as generic (non-touchless-evidence) review_snippets.
// These power the "More Customer Reviews" section on listing pages. We store them
// with is_touchless_evidence=false and source='google_places' so they never get
// confused with the curated touchless-evidence snippets. Sentiment is left null
// here and classified later by scripts/classify-generic-review-sentiment.mjs.
// Deduped against existing google_places snippets for this listing by review_id.
async function saveReviews(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  reviews: PlaceDetails['reviews'],
): Promise<number> {
  if (!reviews || reviews.length === 0) return 0;

  const { data: existing } = await supabase
    .from('review_snippets')
    .select('review_id')
    .eq('listing_id', listingId)
    .eq('source', 'google_places');
  const seen = new Set((existing ?? []).map((r: { review_id: string | null }) => r.review_id).filter(Boolean));

  const rows = reviews
    .slice(0, 5)
    .filter((rv) => (rv.text ?? '').trim().length >= 15)
    .map((rv) => {
      const reviewId = `gpl_${rv.time ?? 0}_${(rv.author_name ?? 'anon').replace(/\s+/g, '').slice(0, 20)}`;
      return {
        listing_id: listingId,
        reviewer_name: rv.author_name ?? null,
        rating: rv.rating ?? null,
        review_text: (rv.text ?? '').trim(),
        review_date: rv.relative_time_description ?? null,
        iso_date: rv.time ? new Date(rv.time * 1000).toISOString().slice(0, 10) : null,
        review_id: reviewId,
        touchless_keywords: [],
        is_touchless_evidence: false,
        source: 'google_places',
        sentiment: null,
      };
    })
    .filter((row) => !seen.has(row.review_id));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from('review_snippets').insert(rows);
  if (error) return 0;
  return rows.length;
}

// Parse weekday_text (["Monday: 8:00 AM – 10:00 PM", ...]) into {monday:"...", tuesday:"..."} object
function parseHours(weekdayText: string[] | undefined): Record<string, string> | null {
  if (!weekdayText || !weekdayText.length) return null;
  const hours: Record<string, string> = {};
  const dayMap: Record<string, string> = { monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday' };
  for (const line of weekdayText) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      const day = dayMap[m[1].toLowerCase()];
      if (day) hours[day] = m[2].trim();
    }
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!googleKey) return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), { status: 500, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const limit: number = Math.min(Math.max(1, body.limit ?? 25), 100);
  const mode: 'all' | 'incomplete' = body.mode ?? 'incomplete';

  let query = supabase
    .from('listings')
    .select('id,name,address,city,state,zip,latitude,longitude,google_place_id,website,phone,touchless_verified,google_photos_count')
    .eq('is_touchless', true)
    .eq('is_approved', true);

  // "incomplete" mode = missing photos OR missing hours (use google_photos_count null as proxy)
  if (mode === 'incomplete') query = query.is('google_photos_count', null);

  const { data: listings, error } = await query.limit(limit);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let enriched = 0, closed = 0, tunnel = 0, noPid = 0, skipped = 0, reviewsSaved = 0;
  const results: Array<{ id: string; action: string; fields: string[] }> = [];

  for (const l of (listings ?? []) as Listing[]) {
    // Step 1: ensure we have a place_id
    let pid = l.google_place_id;
    if (!pid) {
      pid = await findPlaceId(l, googleKey);
      if (!pid) { noPid++; results.push({ id: l.id, action: 'no_pid', fields: [] }); continue; }
    }

    // Step 2: fetch full details
    const details = await fetchDetails(pid, googleKey);
    if (!details) { skipped++; continue; }

    // Handle closed / tunnel-chain reverts
    if (details.business_status === 'CLOSED_PERMANENTLY') {
      closed++;
      await supabase.from('listings').update({
        is_approved: false, is_touchless: false, touchless_verified: null,
        hero_image: null, hero_image_source: null,
        google_place_id: pid, business_status: 'CLOSED_PERMANENTLY',
        crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Reverted: CLOSED_PERMANENTLY.`,
      }).eq('id', l.id);
      results.push({ id: l.id, action: 'closed', fields: [] });
      continue;
    }
    const tunnelMatch = isTunnelChain(details.name || '');
    if (tunnelMatch && l.touchless_verified !== 'chain') {
      tunnel++;
      await supabase.from('listings').update({
        is_approved: false, is_touchless: false, touchless_verified: null,
        hero_image: null, hero_image_source: null, google_place_id: pid,
        crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Reverted: Google now shows "${details.name}" — matches tunnel chain "${tunnelMatch}".`,
      }).eq('id', l.id);
      results.push({ id: l.id, action: 'tunnel_chain', fields: [] });
      continue;
    }

    // Step 3: build the update object — only fill in fields that are currently missing
    const update: Record<string, unknown> = {
      google_place_id: pid,
      business_status: details.business_status || 'OPERATIONAL',
    };
    const filled: string[] = ['pid', 'status'];

    if (details.types?.[0]) {
      update.google_category = details.types[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      filled.push('category');
    }

    if (details.photos && details.photos.length > 0) {
      const urls = details.photos.slice(0, 10).map(p => photoUrl(p.photo_reference, googleKey, 1200));
      update.google_photo_url = urls[0];
      update.google_photos_count = details.photos.length;
      // Merge into photos array (dedupe)
      const { data: existing } = await supabase.from('listings').select('photos').eq('id', l.id).single();
      const existingPhotos = (existing?.photos as string[] | null) ?? [];
      const merged = [...new Set([...existingPhotos, ...urls])].slice(0, 15);
      update.photos = merged;
      filled.push('photos');
    } else {
      update.google_photos_count = 0;
    }

    if (!l.website && details.website) { update.website = details.website; filled.push('website'); }
    if (!l.phone && details.formatted_phone_number) { update.phone = details.formatted_phone_number; filled.push('phone'); }

    if (details.rating) update.rating = details.rating;
    if (details.user_ratings_total) update.review_count = details.user_ratings_total;

    const hours = parseHours(details.opening_hours?.weekday_text);
    if (hours) { update.hours = hours; filled.push('hours'); }

    if (!l.latitude && details.geometry?.location) {
      update.latitude = details.geometry.location.lat;
      update.longitude = details.geometry.location.lng;
      filled.push('latlng');
    }

    await supabase.from('listings').update(update).eq('id', l.id);
    enriched++;

    const saved = await saveReviews(supabase, l.id, details.reviews);
    if (saved > 0) { reviewsSaved += saved; filled.push(`reviews:${saved}`); }

    results.push({ id: l.id, action: 'enriched', fields: filled });
  }

  return new Response(JSON.stringify({
    mode,
    processed: (listings ?? []).length,
    enriched, closed, tunnelChain: tunnel, noPid, skipped, reviewsSaved,
    sample: results.slice(0, 10),
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
