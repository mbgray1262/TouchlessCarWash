import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Flip a listing's `is_touchless` flag. Used by the Community
 * Verifications admin tool so a flagged listing can be set to
 * not_touchless (or back to touchless) directly from the queue
 * without bouncing through the listing admin page.
 *
 * Body: { listing_id: string, is_touchless: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    const is_touchless = typeof body?.is_touchless === 'boolean' ? body.is_touchless : null;
    if (!listing_id || is_touchless === null) {
      return NextResponse.json(
        { error: 'listing_id (string) and is_touchless (boolean) are required' },
        { status: 400 },
      );
    }

    // When flipping to NOT touchless: also unapprove + clear the
    // touchless_verified pill, since this is a touchless-only directory
    // and a non-touchless listing shouldn't carry "Admin Verified" /
    // "User Verified" status. When flipping back to touchless, leave
    // is_approved + touchless_verified for the admin to set explicitly
    // (we don't auto-approve on a positive flip, since that's a
    // separate decision).
    const update: Record<string, unknown> = { is_touchless };
    if (is_touchless === false) {
      update.is_approved = false;
      update.touchless_verified = null;
    }

    const { error, count } = await supabaseAdmin
      .from('listings')
      .update(update, { count: 'exact' })
      .eq('id', listing_id);

    if (error) {
      console.error('toggle-touchless error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (count === 0) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, listing_id, is_touchless });
  } catch (err) {
    console.error('toggle-touchless exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
