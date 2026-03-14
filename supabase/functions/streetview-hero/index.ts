import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

/** Convert an ArrayBuffer to a base64 string (chunked to avoid stack overflow). */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

/**
 * Use Claude AI to select the street view image that best shows a car wash facility.
 * Returns the index (0-based) of the best image, or -1 if none show a car wash.
 */
async function selectBestCarWashImage(
  images: { heading: number; base64: string }[],
  anthropicKey: string,
): Promise<number> {
  const content: Array<Record<string, unknown>> = [];

  for (let i = 0; i < images.length; i++) {
    content.push({ type: 'text', text: `Image ${i + 1} (heading ${images[i].heading}°):` });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: images[i].base64,
      },
    });
  }

  content.push({
    type: 'text',
    text: `You are selecting the best Street View photo for a car wash directory listing. I've shown you ${images.length} photo(s) taken at different headings from the same location.

Pick the image that BEST shows a car wash facility. Look for:
- Car wash tunnel entrance or exit
- Wash bay structures, canopies, or roll-up doors
- Car wash signage (even partially visible)
- Automated wash equipment or conveyor tracks
- A building that is clearly identifiable as a car wash

REJECT images that primarily show:
- Trucks, trailers, or parked vehicles blocking the view
- Other businesses (restaurants, gas stations, convenience stores) without a visible car wash
- Empty roads, parking lots, or generic street scenes
- Residential areas or unrelated commercial buildings

Reply with ONLY the image number (1, 2, 3, or 4) or NONE if no image shows a car wash.`,
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 10,
          messages: [{ role: 'user', content }],
        }),
      });

      if (res.status === 529 || res.status === 503 || res.status === 429) {
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        return 0; // Fall back to first image on API overload
      }

      if (!res.ok) return 0;

      const data = await res.json() as { content: Array<{ text: string }> };
      const text = (data.content?.[0]?.text ?? '').trim().toUpperCase();

      if (text.includes('NONE')) return -1;

      const num = parseInt(text.replace(/\D/g, ''), 10);
      if (num >= 1 && num <= images.length) return num - 1;

      return 0;
    } catch {
      if (attempt < 3) continue;
      return 0;
    }
  }

  return 0;
}

/**
 * Detect listings within a vendor that share the same hero_image URL
 * (i.e., a generic chain photo that doesn't represent the specific location).
 */
async function detectGenericHeroes(
  supabase: ReturnType<typeof createClient>,
  vendorId?: number,
): Promise<{ vendor_id: number; vendor_name: string; total_listings: number; generic_count: number; hero_url: string }[]> {
  let query = supabase
    .from('listings')
    .select('id, vendor_id, hero_image')
    .not('hero_image', 'is', null)
    .not('vendor_id', 'is', null)
    .order('vendor_id');

  if (vendorId) {
    query = query.eq('vendor_id', vendorId);
  }

  const PAGE_SIZE = 1000;
  const allListings: { id: string; vendor_id: number; hero_image: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allListings.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const byVendor = new Map<number, { id: string; hero_image: string }[]>();
  for (const l of allListings) {
    const arr = byVendor.get(l.vendor_id) ?? [];
    arr.push(l);
    byVendor.set(l.vendor_id, arr);
  }

  const results: { vendor_id: number; vendor_name: string; total_listings: number; generic_count: number; hero_url: string }[] = [];

  for (const [vid, listings] of byVendor) {
    if (listings.length < 2) continue;

    const heroCounts = new Map<string, number>();
    for (const l of listings) {
      heroCounts.set(l.hero_image, (heroCounts.get(l.hero_image) ?? 0) + 1);
    }

    let maxUrl = '';
    let maxCount = 0;
    for (const [url, count] of heroCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxUrl = url;
      }
    }

    if (maxCount >= 2) {
      results.push({
        vendor_id: vid,
        vendor_name: '',
        total_listings: listings.length,
        generic_count: maxCount,
        hero_url: maxUrl,
      });
    }
  }

  if (results.length > 0) {
    const vendorIds = results.map(r => r.vendor_id);
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, canonical_name')
      .in('id', vendorIds);

    const vendorMap = new Map(vendors?.map(v => [v.id, v.canonical_name]) ?? []);
    for (const r of results) {
      r.vendor_name = vendorMap.get(r.vendor_id) ?? 'Unknown';
    }
  }

  return results.sort((a, b) => b.generic_count - a.generic_count);
}

/**
 * Download a Street View image for a listing using AI-powered camera selection.
 *
 * 1. Checks metadata for coverage (full address, then coordinate fallback)
 * 2. Fetches images at 4 headings (0°, 90°, 180°, 270°) from the same panorama
 * 3. Uses Claude AI to pick the image that best shows a car wash facility
 * 4. Uploads the winning image to Supabase Storage
 */
async function downloadStreetView(
  supabase: ReturnType<typeof createClient>,
  listing: { id: string; address: string; city: string; state: string; zip: string; latitude: number | null; longitude: number | null },
  googleApiKey: string,
  anthropicKey?: string,
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  // Use full address for better geocoding (previously only used street address)
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`.trim();

  // Check metadata — also captures pano_id so all heading images come from the same spot
  const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(fullAddress)}&source=outdoor&key=${googleApiKey}`;
  const metaRes = await fetch(metaUrl);
  const meta = await metaRes.json();

  let panoId: string | null = meta.status === 'OK' ? (meta.pano_id ?? null) : null;

  if (meta.status !== 'OK') {
    if (listing.latitude && listing.longitude) {
      const coordMetaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${listing.latitude},${listing.longitude}&source=outdoor&key=${googleApiKey}`;
      const coordMetaRes = await fetch(coordMetaUrl);
      const coordMeta = await coordMetaRes.json();
      if (coordMeta.status !== 'OK') {
        return { success: false, error: `No Street View coverage (status: ${meta.status})` };
      }
      panoId = coordMeta.pano_id ?? null;
    } else {
      return { success: false, error: `No Street View coverage (status: ${meta.status})` };
    }
  }

  // Build location param — prefer pano_id (locks all headings to same panorama)
  const locationPart = panoId
    ? `pano=${encodeURIComponent(panoId)}`
    : `location=${encodeURIComponent(fullAddress)}`;

  // Fetch images at 4 headings in parallel
  const headings = [0, 90, 180, 270];
  const imagePromises = headings.map(async (heading) => {
    const url = `https://maps.googleapis.com/maps/api/streetview?size=1200x800&${locationPart}&heading=${heading}&source=outdoor&key=${googleApiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 5000) return null; // Placeholder / no coverage
      return { heading, buffer };
    } catch {
      return null;
    }
  });

  const results = await Promise.all(imagePromises);
  const validImages = results.filter((r): r is { heading: number; buffer: ArrayBuffer } => r !== null);

  if (validImages.length === 0) {
    return { success: false, error: 'No valid Street View images at any heading' };
  }

  // Use Claude AI to pick the best car wash image
  let bestIdx = 0;
  if (anthropicKey) {
    const imagesForAI = validImages.map(img => ({
      heading: img.heading,
      base64: bufferToBase64(img.buffer),
    }));

    bestIdx = await selectBestCarWashImage(imagesForAI, anthropicKey);
    if (bestIdx === -1) {
      return { success: false, error: 'AI: no street view angle shows a car wash facility' };
    }
  }

  const bestImage = validImages[bestIdx];

  // Upload to Supabase Storage
  const storagePath = `listings/${listing.id}/streetview_${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from('listing-photos')
    .upload(storagePath, bestImage.buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadErr) {
    return { success: false, error: `Upload failed: ${uploadErr.message}` };
  }

  const { data: urlData } = supabase.storage
    .from('listing-photos')
    .getPublicUrl(storagePath);

  return { success: true, imageUrl: urlData.publicUrl };
}

/**
 * Clean up old hero image: delete from Supabase Storage (if stored there)
 * and remove it from the listing's photos gallery array.
 */
async function cleanupOldHero(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  oldHeroUrl: string | null,
) {
  if (!oldHeroUrl) return;

  // Delete from Supabase Storage if it's our bucket URL
  const bucketBase = supabase.storage.from('listing-photos').getPublicUrl('').data.publicUrl;
  if (oldHeroUrl.startsWith(bucketBase)) {
    const path = oldHeroUrl.slice(bucketBase.length);
    if (path) {
      await supabase.storage.from('listing-photos').remove([path]).catch(() => {});
    }
  }

  // Remove old hero from the photos array so it no longer shows in gallery
  const { data: listing } = await supabase
    .from('listings')
    .select('photos')
    .eq('id', listingId)
    .maybeSingle();

  if (listing?.photos && Array.isArray(listing.photos)) {
    const filtered = listing.photos.filter((p: string) => p !== oldHeroUrl);
    if (filtered.length !== listing.photos.length) {
      await supabase.from('listings').update({ photos: filtered }).eq('id', listingId);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'detect';

    // ── DETECT generic hero images ──
    if (action === 'detect') {
      const vendorId = body.vendor_id ?? null;
      const results = await detectGenericHeroes(supabase, vendorId);
      return Response.json({
        total_vendors_with_generic: results.length,
        vendors: results,
      }, { headers: corsHeaders });
    }

    // ── REPLACE generic heroes with Street View for a vendor ──
    if (action === 'replace_vendor') {
      const vendorId = body.vendor_id;
      if (!vendorId) {
        return Response.json({ error: 'vendor_id required' }, { status: 400, headers: corsHeaders });
      }

      if (!googleApiKey) {
        return Response.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const generic = await detectGenericHeroes(supabase, vendorId);
      if (generic.length === 0) {
        return Response.json({ message: 'No generic heroes detected for this vendor' }, { headers: corsHeaders });
      }

      const genericUrl = generic[0].hero_url;

      const { data: listings } = await supabase
        .from('listings')
        .select('id, address, city, state, zip, latitude, longitude, hero_image')
        .eq('vendor_id', vendorId)
        .eq('hero_image', genericUrl)
        .order('id');

      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No listings to update' }, { headers: corsHeaders });
      }

      const results: { id: string; status: string; detail?: string }[] = [];

      for (const listing of listings) {
        const sv = await downloadStreetView(supabase, listing, googleApiKey, anthropicKey || undefined);
        if (sv.success && sv.imageUrl) {
          // Clean up old hero image from storage and gallery
          await cleanupOldHero(supabase, listing.id, listing.hero_image);

          const { error: updateErr } = await supabase
            .from('listings')
            .update({ hero_image: sv.imageUrl, hero_image_source: 'street_view' })
            .eq('id', listing.id);

          if (updateErr) {
            results.push({ id: listing.id, status: 'error', detail: `DB update failed: ${updateErr.message}` });
          } else {
            results.push({ id: listing.id, status: 'ok', detail: sv.imageUrl });
          }
        } else {
          results.push({ id: listing.id, status: 'no_coverage', detail: sv.error });
        }
      }

      const ok = results.filter(r => r.status === 'ok').length;
      const failed = results.filter(r => r.status !== 'ok').length;

      return Response.json({
        vendor_id: vendorId,
        total: results.length,
        replaced: ok,
        no_coverage: failed,
        results,
      }, { headers: corsHeaders });
    }

    // ── REPLACE hero for specific listing IDs ──
    if (action === 'replace_listings') {
      const listingIds: string[] = body.listing_ids ?? [];
      if (listingIds.length === 0) {
        return Response.json({ error: 'listing_ids required' }, { status: 400, headers: corsHeaders });
      }

      if (!googleApiKey) {
        return Response.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const { data: listings } = await supabase
        .from('listings')
        .select('id, address, city, state, zip, latitude, longitude, hero_image')
        .in('id', listingIds);

      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No listings found' }, { headers: corsHeaders });
      }

      const results: { id: string; status: string; detail?: string }[] = [];

      for (const listing of listings) {
        const sv = await downloadStreetView(supabase, listing, googleApiKey, anthropicKey || undefined);
        if (sv.success && sv.imageUrl) {
          // Clean up old hero image from storage and gallery
          await cleanupOldHero(supabase, listing.id, listing.hero_image);

          const { error: updateErr } = await supabase
            .from('listings')
            .update({ hero_image: sv.imageUrl, hero_image_source: 'street_view' })
            .eq('id', listing.id);

          if (updateErr) {
            results.push({ id: listing.id, status: 'error', detail: `DB update failed: ${updateErr.message}` });
          } else {
            results.push({ id: listing.id, status: 'ok', detail: sv.imageUrl });
          }
        } else {
          results.push({ id: listing.id, status: 'no_coverage', detail: sv.error });
        }
      }

      return Response.json({
        total: results.length,
        replaced: results.filter(r => r.status === 'ok').length,
        no_coverage: results.filter(r => r.status !== 'ok').length,
        results,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
