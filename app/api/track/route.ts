import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Use the service-role client (server-only). The anon-key client is blocked
// by RLS on listing_events on prod — every event write since launch was
// silently swallowed by the catch below, leaving the stats page perma-zero.
// This route is server-side, so the service key never reaches the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const VALID_EVENTS = new Set(['directions', 'phone', 'website', 'favorite', 'unfavorite']);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { listing_id, event_type } = body;

    if (!listing_id || !event_type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!VALID_EVENTS.has(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('listing_events').insert({
      listing_id,
      event_type,
    } as Record<string, unknown>);
    if (error) {
      // Log so we don't silently lose data again, but still return ok so the
      // failure doesn't surface as a console error in users' browsers.
      console.error('listing_events insert failed:', error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('track POST error:', err);
    return NextResponse.json({ ok: true }); // Tracking must never break UX
  }
}
