import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rehostLogo(
  supabase: any,
  listingId: string,
  logoUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(logoUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TouchlessCarWashFinder/1.0)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowed.includes(baseType)) return null;

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Skip tiny files (likely broken/placeholder)
    if (bytes.length < 500) return null;

    const ext = baseType === 'image/png' ? 'png' : baseType === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${listingId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(storagePath, bytes, { contentType: baseType, upsert: true });

    if (uploadError) return null;

    const { data: pub } = supabase.storage
      .from('listing-photos')
      .getPublicUrl(storagePath);

    return pub.publicUrl;
  } catch {
    return null;
  }
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find listings with google_logo_url but no logo_photo
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, name, google_logo_url')
    .not('google_logo_url', 'is', null)
    .is('logo_photo', null)
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!listings || listings.length === 0) {
    return NextResponse.json({ message: 'No logos to rehost', processed: 0, success: 0, failed: 0, remaining: 0 });
  }

  let success = 0;
  let failed = 0;
  const results: Array<{ id: string; name: string; status: string }> = [];

  for (const listing of listings) {
    const newUrl = await rehostLogo(supabase, listing.id, listing.google_logo_url!);

    if (newUrl) {
      const { error: updateError } = await supabase
        .from('listings')
        .update({ logo_photo: newUrl })
        .eq('id', listing.id);

      if (!updateError) {
        success++;
        results.push({ id: listing.id, name: listing.name, status: 'success' });
      } else {
        failed++;
        results.push({ id: listing.id, name: listing.name, status: 'update_failed' });
      }
    } else {
      // Mark as processed by setting logo_photo to empty string to avoid re-processing
      // Actually, set google_logo_url to null so we don't retry broken URLs
      await supabase
        .from('listings')
        .update({ google_logo_url: null })
        .eq('id', listing.id);
      failed++;
      results.push({ id: listing.id, name: listing.name, status: 'download_failed' });
    }
  }

  // Count remaining
  const { count: remaining } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .not('google_logo_url', 'is', null)
    .is('logo_photo', null);

  return NextResponse.json({
    processed: listings.length,
    success,
    failed,
    remaining: remaining ?? 0,
    results,
  });
}
