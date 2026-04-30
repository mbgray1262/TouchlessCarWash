import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Temporary diagnostic — hit this once to figure out why /admin/stats
 * still shows 0 favorites after the service-role fix. Will be deleted
 * after we get a definitive answer.
 *
 * Reports:
 *   - Whether SUPABASE_SERVICE_ROLE_KEY is set on Netlify
 *   - Total listing_events count via service-role client (truth)
 *   - Total listing_events count via anon-key client (what RLS allows)
 *   - Per-event-type counts via service-role
 *   - Most recent 5 events via service-role
 *   - The deploy commit (if available)
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const usingServiceRole = !!serviceKey;
  const adminClient = createClient(url, serviceKey || anonKey);
  const anonClient = createClient(url, anonKey);

  const [adminTotal, anonTotal, byType, recent] = await Promise.all([
    adminClient.from('listing_events').select('id', { count: 'exact', head: true }),
    anonClient.from('listing_events').select('id', { count: 'exact', head: true }),
    adminClient
      .from('listing_events')
      .select('event_type')
      .limit(5000),
    adminClient
      .from('listing_events')
      .select('event_type, listing_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Tally by event type
  const typeCounts: Record<string, number> = {};
  for (const row of (byType.data ?? []) as { event_type: string }[]) {
    typeCounts[row.event_type] = (typeCounts[row.event_type] ?? 0) + 1;
  }

  return NextResponse.json({
    deploy_commit: process.env.COMMIT_REF || process.env.NETLIFY_COMMIT_REF || 'unknown',
    SUPABASE_SERVICE_ROLE_KEY_is_set: usingServiceRole,
    listing_events_total: {
      via_service_role: { count: adminTotal.count, error: adminTotal.error?.message ?? null },
      via_anon_key: { count: anonTotal.count, error: anonTotal.error?.message ?? null },
    },
    counts_by_event_type: typeCounts,
    recent_events: recent.data,
  });
}
