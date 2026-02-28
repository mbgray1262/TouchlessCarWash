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
    let q = supabase.from('listings').select('*', countOnly ? { count: 'exact', head: true } : { count: 'exact' });

    if (search) {
      q = q.or(`name.ilike.%${search}%,city.ilike.%${search}%,state.ilike.%${search}%,parent_chain.ilike.%${search}%`);
    }

    if (status === 'touchless') q = q.eq('is_touchless', true);
    else if (status === 'not_touchless') q = q.eq('is_touchless', false);
    else if (status === 'unknown') q = q.is('is_touchless', null).not('website', 'is', null);
    else if (status === 'fetch_failed') q = q.eq('crawl_status', 'fetch_failed');
    else if (status === 'no_website') q = q.or('website.is.null,crawl_status.eq.no_website');

    if (featured) q = q.eq('is_featured', true);

    if (chain === 'chains_only') q = q.not('parent_chain', 'is', null);
    else if (chain === 'independent') q = q.is('parent_chain', null);
    else if (chain === 'missing_location_url') q = q.not('parent_chain', 'is', null).is('location_page_url', null);
    else if (chain !== 'all') q = q.eq('parent_chain', chain);

    const orderCol = sort === 'name' ? 'name' : sort === 'city' ? 'city' : 'last_crawled_at';
    q = q.order(orderCol, { ascending: sortDir === 'asc', nullsFirst: false });

    if (!countOnly) q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
