import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

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

    await supabase.from('listing_events').insert({
      listing_id,
      event_type,
    } as Record<string, unknown>);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Silently succeed — tracking should never break the UX
  }
}
