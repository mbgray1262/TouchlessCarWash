import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { listing_ids } = await request.json();

    if (!listing_ids || !Array.isArray(listing_ids) || listing_ids.length === 0) {
      return NextResponse.json({ error: 'listing_ids array is required' }, { status: 400 });
    }

    // Fetch all listings with their current data
    const { data: listings, error: fetchErr } = await supabase
      .from('listings')
      .select('id, hero_image, hero_image_source, photos, street_view_url, latitude, longitude')
      .in('id', listing_ids);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    const results: Array<{ id: string; status: string; detail?: string }> = [];

    for (const listing of listings ?? []) {
      let streetViewUrl = listing.street_view_url as string | null;

      // Generate street view URL from lat/lng if not available
      if (!streetViewUrl && listing.latitude && listing.longitude && googleApiKey) {
        streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${listing.latitude},${listing.longitude}&key=${googleApiKey}`;
      }

      if (!streetViewUrl) {
        results.push({ id: listing.id, status: 'skipped', detail: 'No street view URL and no coordinates available' });
        continue;
      }

      // Delete old hero from Supabase Storage if it's stored there
      const oldHero = listing.hero_image as string | null;
      if (oldHero && oldHero.includes('/storage/v1/object/public/listing-photos/')) {
        const storagePath = oldHero.split('/storage/v1/object/public/listing-photos/')[1];
        if (storagePath) {
          await supabase.storage.from('listing-photos').remove([decodeURIComponent(storagePath)]);
        }
      }

      // Build new photos array: remove old hero, add street view URL
      let photos: string[] = Array.isArray(listing.photos) ? [...listing.photos] : [];

      // Remove old hero from photos array
      if (oldHero) {
        photos = photos.filter((p: string) => p !== oldHero);
      }

      // Add street view URL to photos array if not already present
      if (!photos.includes(streetViewUrl)) {
        photos.unshift(streetViewUrl);
      }

      // Update the listing
      const { error: updateErr } = await supabase
        .from('listings')
        .update({
          hero_image: streetViewUrl,
          hero_image_source: 'street_view',
          street_view_url: streetViewUrl,
          photos,
        })
        .eq('id', listing.id);

      if (updateErr) {
        results.push({ id: listing.id, status: 'error', detail: updateErr.message });
      } else {
        results.push({ id: listing.id, status: 'updated' });
      }
    }

    // Track any listing_ids that weren't found
    const foundIds = new Set((listings ?? []).map((l: { id: string }) => String(l.id)));
    for (const id of listing_ids) {
      if (!foundIds.has(String(id))) {
        results.push({ id, status: 'not_found' });
      }
    }

    const updated = results.filter(r => r.status === 'updated').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: errors === 0,
      updated,
      skipped,
      errors,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
