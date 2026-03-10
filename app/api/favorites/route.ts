import { NextResponse } from 'next/server';
import { supabase, LISTING_CARD_COLUMNS } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json([]);
  }

  const ids = idsParam.split(',').filter(Boolean).slice(0, 50); // cap at 50

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .in('id', ids)
    .eq('is_touchless', true);

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
