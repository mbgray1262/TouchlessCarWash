import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Mark a listing's community flags for one wash type as RESOLVED (or reopen them).
 *
 * "Outstanding / needs review" in the admin queue means a listing still has UNRESOLVED
 * thumbs-down votes for a wash type. When the admin gives a verdict (keep it, mark it
 * not-touchless, or remove it), we stamp those negative votes with resolved_at so the
 * card drops out of the queue — WITHOUT deleting the votes, so the evidence and the
 * admin's decision are preserved and the action is reversible (Undo).
 *
 * Body: {
 *   listing_id: string,
 *   wash_type: 'touchless'|'self_serve'|'hand_wash'|'detailing',
 *   resolved: boolean,          // true = resolve, false = reopen (undo)
 *   action?: string             // 'confirmed' | 'not_touchless' | 'removed' (label only)
 * }
 */
const WASH_TYPES = ['touchless', 'self_serve', 'hand_wash', 'detailing'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listing_id = typeof body?.listing_id === 'string' ? body.listing_id : null;
    const wash_type = WASH_TYPES.includes(body?.wash_type) ? body.wash_type : null;
    const resolved = typeof body?.resolved === 'boolean' ? body.resolved : null;
    const action = typeof body?.action === 'string' ? body.action : null;
    if (!listing_id || !wash_type || resolved === null) {
      return NextResponse.json(
        { error: 'listing_id (string), wash_type (touchless|self_serve|hand_wash|detailing), and resolved (boolean) are required' },
        { status: 400 },
      );
    }

    const update = resolved
      ? { resolved_at: new Date().toISOString(), resolved_action: action }
      : { resolved_at: null, resolved_action: null };

    // Only the negative votes gate the queue; stamp those. Positive votes are left alone.
    const { error, count } = await supabaseAdmin
      .from('listing_verifications')
      .update(update, { count: 'exact' })
      .eq('listing_id', listing_id)
      .eq('wash_type', wash_type)
      .eq('is_touchless', false);

    if (error) {
      console.error('resolve-verifications error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, listing_id, wash_type, resolved, updated: count ?? 0 });
  } catch (err) {
    console.error('resolve-verifications exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
