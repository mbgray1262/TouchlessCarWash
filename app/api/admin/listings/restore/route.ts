import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidateListing } from '@/lib/revalidate-listing';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Restore a previously removed listing. Clears the REMOVED_BY_ADMIN
 * status so closed-detection can re-evaluate, and flips is_touchless +
 * is_approved back on. Caller is expected to also clear the bogus
 * flags via /api/admin/listings/dismiss-flags if desired.
 *
 * Body: { listing_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('listings')
      .update({
        is_approved: true,
        is_touchless: true,
        business_status: 'OPERATIONAL',
        crawl_notes: `[RESTORED ${new Date().toISOString()}]`,
      })
      .eq('id', listing_id)
      .select('slug, city, state')
      .maybeSingle();

    if (error) {
      console.error('restore listing error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    // Bust every cache layer so the restored listing serves a 200 within seconds.
    await revalidateListing(data);

    return NextResponse.json({ success: true, listing_id });
  } catch (err) {
    console.error('restore listing exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
