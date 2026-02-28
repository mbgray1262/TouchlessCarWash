import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search')?.trim() || '';
  const status = searchParams.get('status') || 'all';
  const chain = searchParams.get('chain') || 'all';
  const featured = searchParams.get('featured') === 'true';
  const sort = searchParams.get('sort') || 'last_crawled_at';
  const sortDir = searchParams.get('sort_dir') || 'desc';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');
  const countOnly = searchParams.get('count_only') === 'true';

  try {
    if (countOnly) {
      const { data, error } = await supabase.rpc('listings_filtered_count', {
        p_search: search || null,
        p_status: status,
        p_chain: chain,
        p_featured: featured,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ count: data ?? 0 });
    }

    const { data, error } = await supabase.rpc('search_listings', {
      p_search: search || null,
      p_status: status,
      p_chain: chain,
      p_featured: featured,
      p_sort: sort,
      p_sort_dir: sortDir,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
