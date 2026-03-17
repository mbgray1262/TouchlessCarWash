import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getStateName } from '@/lib/constants';

export const revalidate = 3600; // 1 hour

/**
 * Public CSV download of basic touchless car wash location data.
 * Intentionally excludes competitive/proprietary data:
 * - No slugs, Google Place IDs, photo URLs, or coordinates
 * - Just name, city, state, rating, review count, and sentiment
 */
export async function GET() {
  try {
    // Fetch all touchless listings with only the fields we want to expose
    type ListingRow = {
      name: string;
      city: string;
      state: string;
      zip: string;
      rating: number | null;
      review_count: number | null;
      touchless_sentiment: string | null;
    };

    let allListings: ListingRow[] = [];

    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await supabase
        .from('listings')
        .select('name, city, state, zip, rating, review_count, touchless_sentiment')
        .eq('is_touchless', true)
        .order('state', { ascending: true })
        .order('city', { ascending: true })
        .order('name', { ascending: true })
        .range(offset, offset + 999);

      if (error || !data || data.length === 0) break;
      allListings = allListings.concat(data);
      if (data.length < 1000) break;
    }

    // Build CSV
    const headers = ['Name', 'City', 'State', 'State Abbreviation', 'ZIP', 'Rating', 'Review Count', 'Touchless Sentiment'];
    const csvRows = [headers.join(',')];

    for (const listing of allListings) {
      const stateName = getStateName(listing.state) || listing.state;
      const row = [
        csvEscape(listing.name),
        csvEscape(listing.city),
        csvEscape(stateName),
        listing.state,
        listing.zip || '',
        listing.rating && listing.rating > 0 ? listing.rating.toString() : '',
        listing.review_count && listing.review_count > 0 ? listing.review_count.toString() : '',
        listing.touchless_sentiment || '',
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="touchless-car-wash-dataset-${today}.csv"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Dataset CSV error:', error);
    return NextResponse.json({ error: 'Failed to generate dataset' }, { status: 500 });
  }
}

function csvEscape(value: string): string {
  if (!value) return '';
  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
