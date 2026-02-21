import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
  const { data, error } = await supabase.rpc('name_pre_scan');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
