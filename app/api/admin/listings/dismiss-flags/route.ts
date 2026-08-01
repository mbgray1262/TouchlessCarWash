import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Delete the negative ("no") verifications for a listing — used when the
 * admin decides the community flag was wrong (e.g. user confused a payment
 * touchpad for a touchless wash, or vented at the wrong location). Only
 * deletes is_touchless=false rows; keeps positive votes intact.
 *
 * Body: { listing_id: string, wash_type?: 'touchless'|'self_serve'|'hand_wash'|'detailing' }
 * When wash_type is given, only that category's flags are cleared (so dismissing
 * self-serve flags doesn't wipe a separate hand-wash flag on a mixed listing).
 */
const WASH_TYPES = ['touchless', 'self_serve', 'hand_wash', 'detailing'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    const wash_type = WASH_TYPES.includes(body?.wash_type) ? body.wash_type : null;
    if (!listing_id) {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
    }

    let q = supabaseAdmin
      .from('listing_verifications')
      .delete({ count: 'exact' })
      .eq('listing_id', listing_id)
      .eq('is_touchless', false);
    if (wash_type) q = q.eq('wash_type', wash_type);
    const { error, count } = await q;

    if (error) {
      console.error('dismiss-flags error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, listing_id, dismissed: count ?? 0 });
  } catch (err) {
    console.error('dismiss-flags exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
