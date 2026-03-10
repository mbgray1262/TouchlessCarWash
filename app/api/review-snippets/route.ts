import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get('listing_id');

  if (!listingId) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from('review_snippets')
    .select('id, reviewer_name, rating, review_text, review_date, touchless_keywords')
    .eq('listing_id', listingId)
    .eq('is_touchless_evidence', true)
    .order('rating', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
