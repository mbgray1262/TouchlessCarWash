import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error, count } = await supabaseAdmin
      .from('listing_verifications')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      console.error('Error deleting verification:', error);
      return NextResponse.json({ error: `Failed to delete: ${error.message}` }, { status: 500 });
    }

    if (count === 0) {
      console.warn('Delete matched 0 rows for id:', id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('delete verification error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
