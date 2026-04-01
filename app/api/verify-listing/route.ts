import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// One verification per listing per IP per 30 days — prevents spam while allowing
// returning visitors to update their assessment over time
const RATE_LIMIT_DAYS = 30;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listing_id, is_touchless, comment } = body;

    if (!listing_id || typeof listing_id !== 'string') {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
    }

    if (typeof is_touchless !== 'boolean') {
      return NextResponse.json({ error: 'is_touchless must be a boolean' }, { status: 400 });
    }

    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string' || comment.length > 500) {
        return NextResponse.json({ error: 'Comment must be 500 characters or fewer' }, { status: 400 });
      }
    }

    const ip = getClientIp(req);

    // Rate-limit: 1 verification per listing per IP per 30 days
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - RATE_LIMIT_DAYS);

    const { count } = await supabaseAdmin
      .from('listing_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listing_id)
      .eq('ip_address', ip)
      .gte('created_at', windowStart.toISOString());

    if ((count ?? 0) >= 1) {
      return NextResponse.json(
        { error: 'You have already submitted a verification for this location recently. You can verify again in 30 days.' },
        { status: 429 }
      );
    }

    const { error } = await supabaseAdmin.from('listing_verifications').insert({
      listing_id,
      is_touchless,
      comment: comment?.trim() || null,
      ip_address: ip,
    });

    if (error) {
      console.error('Error inserting listing_verification:', error);
      return NextResponse.json({ error: 'Failed to save verification' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('verify-listing error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
