import { NextRequest, NextResponse } from 'next/server';
import { getStateStats } from '@/lib/state-stats';

/**
 * Temporary diagnostic — surfaces the actual exception thrown by
 * getStateStats() so we can find why /state/[state]/statistics is rendering
 * Next.js's default NotFound UI in production. Will be deleted after we
 * have a definitive answer.
 *
 * GET /api/debug-state-stats?state=CA
 */
export async function GET(req: NextRequest) {
  const stateCode = req.nextUrl.searchParams.get('state') ?? 'CA';
  try {
    const stats = await getStateStats(stateCode);
    return NextResponse.json({
      ok: true,
      stateCode,
      hasStats: stats != null,
      stats,
    });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({
      ok: false,
      stateCode,
      errorName: e.name,
      errorMessage: e.message,
      stack: e.stack?.split('\n').slice(0, 8),
    }, { status: 500 });
  }
}
