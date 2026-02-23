import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { edit_id, listing_id, action, issue_type } = await req.json();

    if (!edit_id || !action || !listing_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'dismissed';

    const { error: updateError } = await supabaseAdmin
      .from('listing_edits')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', edit_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update edit' }, { status: 500 });
    }

    if (action === 'approve' && issue_type === 'permanently_closed') {
      await supabaseAdmin
        .from('listings')
        .update({ is_touchless: false })
        .eq('id', listing_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('suggest-edit/action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
