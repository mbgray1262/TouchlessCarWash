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

/**
 * Detect listings within a vendor that share the same hero_image URL
 * (i.e., a generic chain photo that doesn't represent the specific location).
 */
async function detectGenericHeroes(
  supabase: ReturnType<typeof createClient>,
  vendorId?: number,
): Promise<{ vendor_id: number; vendor_name: string; total_listings: number; generic_count: number; hero_url: string }[]> {
  // Get all listings with hero images, grouped by vendor
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

  // Group by vendor_id, then find duplicate hero_image URLs
  const byVendor = new Map<number, { id: string; hero_image: string }[]>();
  for (const l of allListings) {
    const arr = byVendor.get(l.vendor_id) ?? [];
    arr.push(l);
    byVendor.set(l.vendor_id, arr);
  }

  const results: { vendor_id: number; vendor_name: string; total_listings: number; generic_count: number; hero_url: string }[] = [];

  for (const [vid, listings] of byVendor) {
    if (listings.length < 2) continue;

    // Count hero_image occurrences
    const heroCounts = new Map<string, number>();
    for (const l of listings) {
      heroCounts.set(l.hero_image, (heroCounts.get(l.hero_image) ?? 0) + 1);
    }

    // Find the most common hero that appears 2+ times
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
        vendor_name: '', // filled in below
        total_listings: listings.length,
        generic_count: maxCount,
        hero_url: maxUrl,
      });
    }
  }

  // Fetch vendor names
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
 * Download a Street View image for a listing and store it in Supabase Storage.
 * Uses address-based lookup so Google auto-orients the camera toward the building.
 */
async function downloadStreetView(
  supabase: ReturnType<typeof createClient>,
  listing: { id: string; address: string; city: string; state: string; zip: string; latitude: number | null; longitude: number | null },
  googleApiKey: string,
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  // First check if Street View coverage exists using the metadata API
  const addressQuery = `${listing.address}`;
  const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(addressQuery)}&source=outdoor&key=${googleApiKey}`;
  const metaRes = await fetch(metaUrl);
  const meta = await metaRes.json();

  if (meta.status !== 'OK') {
    // Try with coordinates as fallback
    if (listing.latitude && listing.longitude) {
      const coordMetaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${listing.latitude},${listing.longitude}&source=outdoor&key=${googleApiKey}`;
      const coordMetaRes = await fetch(coordMetaUrl);
      const coordMeta = await coordMetaRes.json();
      if (coordMeta.status !== 'OK') {
        return { success: false, error: `No Street View coverage (status: ${meta.status})` };
      }
    } else {
      return { success: false, error: `No Street View coverage (status: ${meta.status})` };
    }
  }

  // Download the Street View image - use address so Google auto-orients to building
  const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=1200x800&location=${encodeURIComponent(addressQuery)}&source=outdoor&key=${googleApiKey}`;
  const imageRes = await fetch(imageUrl);

  if (!imageRes.ok) {
    return { success: false, error: `Street View fetch failed: ${imageRes.status}` };
  }

  const imageBuffer = await imageRes.arrayBuffer();
  const contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';

  // Check if we got an actual image (not the "no imagery" placeholder)
  if (imageBuffer.byteLength < 5000) {
    return { success: false, error: 'Image too small, likely no coverage' };
  }

  // Upload to Supabase Storage
  const timestamp = Date.now();
  const storagePath = `listings/${listing.id}/streetview_${timestamp}.jpg`;

  const { error: uploadErr } = await supabase.storage
    .from('listing-photos')
    .upload(storagePath, imageBuffer, {
      contentType,
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');

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

      // Find the generic hero URL for this vendor
      const generic = await detectGenericHeroes(supabase, vendorId);
      if (generic.length === 0) {
        return Response.json({ message: 'No generic heroes detected for this vendor' }, { headers: corsHeaders });
      }

      const genericUrl = generic[0].hero_url;

      // Get all listings with this generic hero
      const { data: listings } = await supabase
        .from('listings')
        .select('id, address, city, state, zip, latitude, longitude, hero_image')
        .eq('vendor_id', vendorId)
        .eq('hero_image', genericUrl)
        .order('id');

      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No listings to update' }, { headers: corsHeaders });
      }

      // Process listings: download Street View, update hero
      const results: { id: string; status: string; detail?: string }[] = [];

      for (const listing of listings) {
        const sv = await downloadStreetView(supabase, listing, googleApiKey);
        if (sv.success && sv.imageUrl) {
          // Update the listing's hero_image
          const { error: updateErr } = await supabase
            .from('listings')
            .update({ hero_image: sv.imageUrl })
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
        .select('id, address, city, state, zip, latitude, longitude')
        .in('id', listingIds);

      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No listings found' }, { headers: corsHeaders });
      }

      const results: { id: string; status: string; detail?: string }[] = [];

      for (const listing of listings) {
        const sv = await downloadStreetView(supabase, listing, googleApiKey);
        if (sv.success && sv.imageUrl) {
          const { error: updateErr } = await supabase
            .from('listings')
            .update({ hero_image: sv.imageUrl })
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
