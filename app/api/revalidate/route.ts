import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * On-demand revalidation endpoint for admin tools.
 * POST /api/revalidate { path: "/state/kansas/louisburg/xcel-car-wash-..." }
 *
 * Strategy: listing pages use `dynamic = 'force-dynamic'` (no ISR cache) with
 * Netlify CDN caching via `Netlify-CDN-Cache-Control` headers. On admin edits
 * we purge the Netlify CDN cache so the next visitor gets fresh content.
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // 1. Tell Next.js to invalidate any internal cache for this path
    revalidatePath(path);

    // 2. Purge Netlify CDN edge cache (all pages — site is small enough)
    let netlifyPurged = false;
    try {
      const { purgeCache } = await import('@netlify/functions');
      await purgeCache();
      netlifyPurged = true;
    } catch {
      // Not on Netlify (local dev) or purge failed
    }

    // 3. Pre-warm the page so the next visitor gets a cached response instantly
    let prewarmed = false;
    try {
      const origin = request.nextUrl.origin;
      await fetch(`${origin}${path}`, {
        headers: { 'x-prewarm': '1', 'Purpose': 'prefetch' },
        signal: AbortSignal.timeout(10000),
      });
      prewarmed = true;
    } catch {
      // Best-effort — page will be generated on next real visit
    }

    return NextResponse.json({ revalidated: true, netlifyPurged, prewarmed, path });
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: String(err) },
      { status: 500 },
    );
  }
}
