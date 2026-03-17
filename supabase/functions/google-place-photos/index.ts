import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}

interface GooglePhoto {
  name: string;       // e.g. "places/ChIJ.../photos/AelY..."
  widthPx: number;
  heightPx: number;
  authorAttributions?: Array<{ displayName: string; uri: string }>;
}

// Fetch photo references from Google Places API
async function fetchPhotoReferences(placeId: string, apiKey: string): Promise<GooglePhoto[]> {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Places API error: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.photos ?? [];
}

// Resolve a Google Places media URL to its final CDN URL
async function resolveMediaUrl(photoName: string, apiKey: string, maxPx: number): Promise<string | null> {
  const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxPx}&maxWidthPx=${maxPx}&key=${apiKey}&skipHttpRedirect=true`;
  try {
    const res = await fetch(mediaUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return data.photoUri ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');
  if (!googleApiKey) {
    return json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, 500);
  }

  // ── GET: Browse photos ──────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const placeId = url.searchParams.get('place_id');
    if (!placeId) return json({ error: 'place_id required' }, 400);

    const photoRefs = await fetchPhotoReferences(placeId, googleApiKey);
    if (photoRefs.length === 0) return json({ photos: [] });

    // Resolve all thumbnail URLs in parallel
    const photoPromises = photoRefs.map(async (photo) => {
      const thumbUrl = await resolveMediaUrl(photo.name, googleApiKey, 800);
      if (!thumbUrl) return null;
      return {
        name: photo.name,
        url: thumbUrl,
        width: photo.widthPx,
        height: photo.heightPx,
        author: photo.authorAttributions?.[0]?.displayName ?? null,
      };
    });

    const photos = (await Promise.all(photoPromises)).filter(Boolean);
    return json({ photos, total: photoRefs.length });
  }

  // ── POST: Save a photo to listing ───────────────────────────
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { photo_name, listing_id, set_as_hero } = body;

    if (!photo_name || !listing_id) {
      return json({ error: 'photo_name and listing_id required' }, 400);
    }

    // 1. Fetch full-resolution image
    const fullUrl = await resolveMediaUrl(photo_name, googleApiKey, 1600);
    if (!fullUrl) return json({ error: 'Failed to resolve photo URL' }, 500);

    const imgRes = await fetch(fullUrl);
    if (!imgRes.ok) return json({ error: 'Failed to fetch image' }, 500);

    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const imageBuffer = await imgRes.arrayBuffer();

    // 2. Upload to Supabase Storage
    const filename = `${listing_id}/google-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('listing-photos')
      .upload(filename, imageBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return json({ error: 'Failed to upload image' }, 500);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('listing-photos')
      .getPublicUrl(filename);

    // 3. Update listing
    const { data: listing } = await supabase
      .from('listings')
      .select('photos, hero_image')
      .eq('id', listing_id)
      .maybeSingle();

    const currentPhotos: string[] = listing?.photos ?? [];
    const updatedPhotos = [...currentPhotos, publicUrl];

    const updateData: Record<string, unknown> = { photos: updatedPhotos };
    if (set_as_hero) {
      updateData.hero_image = publicUrl;
      updateData.hero_image_source = 'google';
    }

    await supabase.from('listings').update(updateData).eq('id', listing_id);

    return json({
      url: publicUrl,
      set_as_hero: !!set_as_hero,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
});
