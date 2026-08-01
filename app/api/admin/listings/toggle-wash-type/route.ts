import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidateListing } from '@/lib/revalidate-listing';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Flip ONE of a listing's wash-type flags from the Community Verifications queue,
 * for whichever category was being verified — the wash-type-aware successor to
 * toggle-touchless (still used for the touchless case; this one handles all four).
 *
 * Body: { listing_id: string, wash_type: 'touchless'|'self_serve'|'hand_wash'|'detailing', value: boolean }
 *
 * touchless keeps its historic side effects: flipping it OFF also unapproves the
 * listing and clears the touchless_verified pill (touchless is the flagship type and
 * a non-touchless listing shouldn't wear "Verified"). For the other three types we ONLY
 * flip the category flag — a mixed listing (e.g. also touchless) stays public, and the
 * admin can still use "Remove listing" for a full takedown. Flipping a type ON never
 * auto-approves (that stays an explicit admin decision).
 */
const FLAG: Record<string, string> = {
  touchless: 'is_touchless',
  self_serve: 'is_self_service',
  hand_wash: 'is_hand_wash',
  detailing: 'is_detailing',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    const wash_type = typeof body?.wash_type === 'string' ? body.wash_type : null;
    const value = typeof body?.value === 'boolean' ? body.value : null;
    if (!listing_id || value === null || !wash_type || !FLAG[wash_type]) {
      return NextResponse.json(
        { error: 'listing_id (string), wash_type (touchless|self_serve|hand_wash|detailing), and value (boolean) are required' },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { [FLAG[wash_type]]: value };
    if (wash_type === 'touchless' && value === false) {
      update.is_approved = false;
      update.touchless_verified = null;
    }

    const { data, error } = await supabaseAdmin
      .from('listings')
      .update(update)
      .eq('id', listing_id)
      .select('slug, city, state')
      .maybeSingle();

    if (error) {
      console.error('toggle-wash-type error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }

    // Bust every cache layer so the public page reflects the change within seconds.
    await revalidateListing(data);

    return NextResponse.json({ success: true, listing_id, wash_type, value });
  } catch (err) {
    console.error('toggle-wash-type exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
