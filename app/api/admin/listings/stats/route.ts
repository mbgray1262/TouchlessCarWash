import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase.rpc('admin_listing_stats');
    if (error) {
      console.error('[stats] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || typeof data !== 'object') {
      console.error('[stats] unexpected data shape:', data);
      return NextResponse.json({ error: 'unexpected response' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[stats] exception:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
