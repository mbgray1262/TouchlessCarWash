import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RATE_LIMIT_PER_DAY = 3;

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
    const { business_name, address, city, state, zip, phone, website, email, notes, photos } = body;

    if (!business_name?.trim()) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }
    if (!address?.trim()) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }
    if (!city?.trim()) {
      return NextResponse.json({ error: 'City is required' }, { status: 400 });
    }
    if (!state?.trim()) {
      return NextResponse.json({ error: 'State is required' }, { status: 400 });
    }
    if (!zip?.trim()) {
      return NextResponse.json({ error: 'ZIP code is required' }, { status: 400 });
    }

    const ip = getClientIp(req);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { count } = await supabaseAdmin
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', dayStart.toISOString());

    if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 3 submissions per day.' },
        { status: 429 }
      );
    }

    const { error } = await supabaseAdmin.from('submissions').insert({
      business_name: business_name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      submitter_email: email?.trim() || null,
      notes: notes?.trim() || null,
      photos: Array.isArray(photos) && photos.length > 0 ? photos : null,
      ip_address: ip,
    });

    if (error) {
      console.error('Error inserting submission:', error);
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('add-listing error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
