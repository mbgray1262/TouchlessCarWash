import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RATE_LIMIT_PER_DAY = 3;

const VALID_ISSUE_TYPES = [
  'permanently_closed',
  'not_touchless',
  'wrong_address',
  'wrong_phone',
  'wrong_hours',
  'wrong_website',
  'other',
] as const;

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
    const { listing_id, issue_type, details, email } = body;

    if (!listing_id || typeof listing_id !== 'string') {
      return NextResponse.json({ error: 'listing_id is required' }, { status: 400 });
    }

    if (!issue_type || !VALID_ISSUE_TYPES.includes(issue_type)) {
      return NextResponse.json({ error: 'Valid issue_type is required' }, { status: 400 });
    }

    const ip = getClientIp(req);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { count } = await supabaseAdmin
      .from('listing_edits')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', dayStart.toISOString());

    if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 3 submissions per day.' },
        { status: 429 }
      );
    }

    const { error } = await supabaseAdmin.from('listing_edits').insert({
      listing_id,
      issue_type,
      details: details?.trim() || null,
      email: email?.trim() || null,
      ip_address: ip,
    });

    if (error) {
      console.error('Error inserting listing_edit:', error);
      return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('suggest-edit error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
