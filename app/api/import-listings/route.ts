import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { listings } = await request.json();

    if (!Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json(
        { error: 'Invalid listings data' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const listing of listings) {
      const { data: existing } = await supabase
        .from('listings')
        .select('id')
        .eq('slug', listing.slug)
        .maybeSingle();

      if (existing) {
        results.failed++;
        results.errors.push(`${listing.name}: Already exists`);
        continue;
      }

      const { error } = await supabase.from('listings').insert(listing);

      if (error) {
        results.failed++;
        results.errors.push(`${listing.name}: ${error.message}`);
      } else {
        results.success++;
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
