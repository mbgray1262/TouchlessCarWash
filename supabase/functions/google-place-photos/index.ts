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
async function fetchPhotoReferences(placeId: string, apiKey: string): Promise<{ photos: GooglePhoto[]; debug?: string }> {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${apiKey}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    console.error(`Places API error: ${res.status} — ${text.slice(0, 300)}`);
    return { photos: [], debug: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  try {
    const data = JSON.parse(text);
    return { photos: data.photos ?? [], debug: data.photos ? undefined : `No photos field. Keys: ${Object.keys(data).join(',')}` };
  } catch {
    return { photos: [], debug: `JSON parse error: ${text.slice(0, 200)}` };
  }
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

  // ── GET: Browse photos (paginated) ─────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const placeId = url.searchParams.get('place_id');
    if (!placeId) return json({ error: 'place_id required' }, 400);

    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '5', 10);
    // Optional resolution (defaults to 800 for the review-tool thumbnails; the autophoto
    // photo-source pipeline passes size=1600 for hero-quality candidates). Capped at 1600.
    const size = Math.min(Math.max(parseInt(url.searchParams.get('size') ?? '800', 10) || 800, 200), 1600);

    const { photos: photoRefs, debug } = await fetchPhotoReferences(placeId, googleApiKey);
    if (photoRefs.length === 0) return json({ photos: [], total: 0, hasMore: false, debug });

    // Slice the page we need
    const page = photoRefs.slice(offset, offset + limit);

    // Resolve only this page of thumbnail URLs in parallel
    const photoPromises = page.map(async (photo) => {
      const thumbUrl = await resolveMediaUrl(photo.name, googleApiKey, size);
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
    return json({
      photos,
      total: photoRefs.length,
      hasMore: offset + limit < photoRefs.length,
    });
  }

  // ── POST: Save a photo to listing ───────────────────────────
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { photo_name, photo_url, listing_id, set_as_hero, update_listing } = body;
    // Default: mutate listings.photos (append + optionally set hero). Pass
    // update_listing=false from background rehost flows that have already
    // written the final photos array and just need an external→supabase URL
    // conversion — otherwise we double-write and create duplicates.
    const shouldUpdateListing = update_listing !== false;

    if ((!photo_name && !photo_url) || !listing_id) {
      return json({ error: 'photo_name or photo_url, and listing_id required' }, 400);
    }

    // 1. Fetch full-resolution image (from direct URL, Street View panoid, or Places API photo name)
    let fullUrl: string | null;
    if (photo_url?.startsWith('streetview:')) {
      // Street View panoid — use Google Street View Static API
      const parts = photo_url.split(':');
      const panoid = parts[1];
      const heading = parts[2] || '0';
      fullUrl = `https://maps.googleapis.com/maps/api/streetview?size=1600x1200&pano=${panoid}&heading=${heading}&pitch=0&key=${googleApiKey}`;
    } else if (photo_url) {
      fullUrl = photo_url;
    } else {
      fullUrl = await resolveMediaUrl(photo_name, googleApiKey, 1600);
      if (!fullUrl) return json({ error: 'Failed to resolve photo URL' }, 500);
    }

    const imgRes = await fetch(fullUrl);
    if (!imgRes.ok) return json({ error: `Failed to fetch image (${imgRes.status})` }, 500);

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

    // 3. Update listing (skip when caller will manage photos[] themselves).
    if (shouldUpdateListing) {
      const { data: listing } = await supabase
        .from('listings')
        .select('photos, hero_image')
        .eq('id', listing_id)
        .maybeSingle();

      const currentPhotos: string[] = listing?.photos ?? [];
      // Dedupe defensively: if the same public URL is already present (e.g.
      // a client retry or parallel call), don't create a duplicate entry.
      const updatedPhotos = currentPhotos.includes(publicUrl)
        ? currentPhotos
        : [...currentPhotos, publicUrl];

      const updateData: Record<string, unknown> = { photos: updatedPhotos };
      if (set_as_hero) {
        updateData.hero_image = publicUrl;
        updateData.hero_image_source = photo_url ? 'pasted' : 'google';
      }

      await supabase.from('listings').update(updateData).eq('id', listing_id);
    }

    return json({
      url: publicUrl,
      set_as_hero: !!set_as_hero,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
});
