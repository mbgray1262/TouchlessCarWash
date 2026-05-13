import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Soft-remove a listing reported as "no car wash here" by community users.
 * Sets is_approved=false + business_status='REMOVED_BY_ADMIN' so the row
 * disappears from public pages but stays in the database (keeps place_id,
 * snapshots, history) for audit and possible restore.
 *
 * REMOVED_BY_ADMIN is distinct from CLOSED_PERMANENTLY (Google-detected)
 * so we can tell intentional admin removals apart from auto-closures.
 *
 * Body: { listing_id: string, reason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : 'Reported as not a car wash by community';
    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
    }

    const stamp = new Date().toISOString();
    const note = `[REMOVED ${stamp}] ${reason}`;

    const { error, count } = await supabaseAdmin
      .from('listings')
      .update(
        {
          is_approved: false,
          is_touchless: false,
          touchless_verified: null,
          business_status: 'REMOVED_BY_ADMIN',
          crawl_notes: note,
        },
        { count: 'exact' },
      )
      .eq('id', listing_id);

    if (error) {
      console.error('remove listing error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (count === 0) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, listing_id });
  } catch (err) {
    console.error('remove listing exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
