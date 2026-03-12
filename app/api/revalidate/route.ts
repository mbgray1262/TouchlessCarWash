import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * On-demand revalidation endpoint for admin tools.
 * POST /api/revalidate { path: "/state/kansas/louisburg/xcel-car-wash-..." }
 *
 * Three-layer cache purge strategy:
 * 1. revalidatePath()  — tells Next.js to regenerate the page on the next request
 * 2. purgeCache()      — purges Netlify's CDN edge cache (all tags for this site)
 * 3. Self-fetch        — immediately triggers the regeneration so the next visitor sees fresh content
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // 1. Tell Next.js to invalidate the ISR cache for this path
    revalidatePath(path);

    // 2. Purge the Netlify CDN edge cache
    //    Using no arguments purges ALL cached content for this site.
    //    On a site this size that's fine — pages re-cache quickly on first visit.
    let netlifyPurged = false;
    try {
      const { purgeCache } = await import('@netlify/functions');
      await purgeCache();
      netlifyPurged = true;
    } catch {
      // Not on Netlify (local dev) or purge failed — that's OK
    }

    // 3. Self-fetch the page to trigger an immediate ISR regeneration
    //    so the NEXT visitor (or hard-refresh) gets the fresh version.
    let prefetched = false;
    try {
      const origin = request.nextUrl.origin;
      const fetchUrl = `${origin}${path}`;
      // Fire-and-forget with a short timeout — don't block the response
      fetch(fetchUrl, {
        headers: { 'x-prerender': '1' },
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});
      prefetched = true;
    } catch {
      // Best-effort
    }

    return NextResponse.json({ revalidated: true, netlifyPurged, prefetched, path });
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: String(err) },
      { status: 500 },
    );
  }
}
