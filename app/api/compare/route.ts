import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Columns needed for the comparison table — more than card columns but skip heavy blobs
const COMPARE_COLUMNS = 'id, name, slug, city, state, address, phone, website, rating, review_count, hero_image, google_photo_url, logo_photo, google_logo_url, amenities, touchless_sentiment, extracted_data, hours, is_touchless, is_featured, is_claimed, parent_chain, business_status, google_place_id';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json([]);
  }

  const ids = idsParam.split(',').filter(Boolean).slice(0, 3); // cap at 3

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from('listings')
    .select(COMPARE_COLUMNS)
    .in('id', ids);

  if (error) {
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
