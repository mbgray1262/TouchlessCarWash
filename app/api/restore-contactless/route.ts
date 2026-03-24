import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * One-time endpoint to restore 427 contactless false positive listings
 * back to is_touchless=true so they appear in the Touchless Cleanup review queue.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // These are the 427 listings that were incorrectly batch-removed
  // They have verification_status='rejected' and touchless_evidence containing 'contactless'
  // and the evidence also says "does not use" or "no mention of touchless"
  const { data, error } = await supabase
    .from('listings')
    .update({
      is_touchless: true,
      verification_status: null,
      touchless_verified: null,
      touchless_review_count: 0,
    })
    .eq('is_touchless', false)
    .eq('verification_status', 'rejected')
    .ilike('touchless_evidence', '%contactless%')
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restored: data?.length ?? 0,
    message: `Restored ${data?.length ?? 0} contactless false positive listings for review`,
  });
}
