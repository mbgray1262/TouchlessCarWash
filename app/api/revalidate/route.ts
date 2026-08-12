import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { listingTag } from '@/lib/revalidate-listing';

/**
 * On-demand revalidation endpoint for admin tools.
 * POST /api/revalidate { path: "/state/kansas/louisburg/xcel-car-wash-..." }
 *
 * Strategy: pages use ISR (`revalidate`, mostly 1h) cached at the Netlify edge,
 * and (since the Cloudflare migration) also at the Cloudflare edge in front of it.
 * On admin edits we purge BOTH CDNs + pre-warm the page so the next visitor gets
 * fresh content immediately, without waiting on the ISR / Edge-TTL window.
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // 1. Tell Next.js to invalidate any internal cache for this path
    revalidatePath(path);

    // 1b. If this is a listing detail path (/state/<state>/<city>/<slug>),
    // also evict the tagged getListing Data Cache entry. revalidatePath busts
    // the rendered route cache but leaves the fetch Data Cache stale on Netlify,
    // so ISR regeneration would re-read a reverted listing's old is_touchless
    // and re-serve a live 200. revalidateTag is what actually flips it to a 308.
    const segments = path.split('?')[0].split('/').filter(Boolean);
    if (segments[0] === 'state' && segments.length === 4) {
      revalidateTag(listingTag(segments[3]));
    }

    // 2. Purge Netlify CDN edge cache (all pages — site is small enough)
    let netlifyPurged = false;
    try {
      const { purgeCache } = await import('@netlify/functions');
      await purgeCache();
      netlifyPurged = true;
    } catch {
      // Not on Netlify (local dev) or purge failed
    }

    // 2b. Purge the Cloudflare edge cache. Cloudflare now edge-caches public HTML
    //     (Cache Rule), and the Netlify purgeCache() above does NOT reach it — so
    //     without this an admin edit would stay stale at the Cloudflare edge until
    //     the Edge TTL expired. We purge EVERYTHING (not purge-by-URL): Next.js App
    //     Router responses carry `Vary: RSC, Next-Router-*` headers, and Cloudflare's
    //     single-URL purge does not reliably evict those objects (verified — it
    //     returns success but leaves the page HIT). Purge-everything mirrors what the
    //     Netlify purgeCache() above already does and is well within rate limits at
    //     our (human-paced) edit volume. Best-effort + env-gated: a no-op on local
    //     dev or when the token isn't configured, and it never blocks the response.
    let cloudflarePurged = false;
    const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;
    const cfPurgeToken = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN;
    if (cfZoneId && cfPurgeToken) {
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfPurgeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ purge_everything: true }),
            signal: AbortSignal.timeout(10000),
          },
        );
        cloudflarePurged = res.ok;
      } catch {
        // Best-effort — the page refreshes on its own within the Edge TTL.
      }
    }

    // 3. Pre-warm the page so the next visitor gets a cached response instantly.
    //    This fetch goes back through Cloudflare (public DNS), so it also re-warms
    //    the Cloudflare edge cache we just purged, not only Netlify's.
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

    return NextResponse.json({
      revalidated: true,
      netlifyPurged,
      cloudflarePurged,
      prewarmed,
      path,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: String(err) },
      { status: 500 },
    );
  }
}
