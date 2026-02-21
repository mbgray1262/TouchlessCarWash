import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.rpc('get_filter_counts');
  if (error) {
    const fallback = await supabase
      .from('filters')
      .select('id, name, slug, category, icon, sort_order');
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ filters: fallback.data ?? [] });
  }
  return NextResponse.json({ filters: data ?? [] });
}
