import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Backfill touchless_verified = 'user_review' for listings that have
 * positive review evidence but were never marked as user-verified.
 *
 * The review-mine function sets is_touchless=true and populates
 * review_snippets, but never set touchless_verified='user_review'.
 * This fixes that gap.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Step 1: Find all listing IDs with positive touchless review evidence
    const { data: snippets, error: snippetErr } = await supabase
      .from('review_snippets')
      .select('listing_id')
      .eq('is_touchless_evidence', true)
      .or('sentiment.is.null,sentiment.neq.negative');

    if (snippetErr) throw snippetErr;
    if (!snippets?.length) {
      return NextResponse.json({ updated: 0, message: 'No positive review evidence found' });
    }

    const positiveIds = Array.from(new Set(snippets.map(s => s.listing_id)));

    // Step 2: Update listings that don't already have admin verification
    // Only set user_review if touchless_verified is null (don't downgrade admin to user_review)
    let updated = 0;
    for (let i = 0; i < positiveIds.length; i += 100) {
      const batch = positiveIds.slice(i, i + 100);
      const { data, error } = await supabase
        .from('listings')
        .update({ touchless_verified: 'user_review' })
        .in('id', batch)
        .is('touchless_verified', null)
        .select('id');

      if (error) throw error;
      updated += data?.length ?? 0;
    }

    return NextResponse.json({
      updated,
      totalWithEvidence: positiveIds.length,
      message: `Set touchless_verified='user_review' on ${updated} listings (${positiveIds.length} had positive evidence, ${positiveIds.length - updated} already had verification)`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
