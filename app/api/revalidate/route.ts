import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * On-demand revalidation endpoint for admin tools.
 * POST /api/revalidate { path: "/state/kansas/louisburg/xcel-car-wash-..." }
 *
 * Uses both Next.js revalidatePath AND Netlify's native purgeCache
 * for reliable cache busting on Netlify's CDN.
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // 1. Purge Next.js ISR cache
    revalidatePath(path);

    // 2. Purge Netlify CDN cache using their native API
    //    purgeCache is only available in Netlify's serverless environment
    let netlifyPurged = false;
    try {
      const { purgeCache } = await import('@netlify/functions');
      await purgeCache({ tags: [path] });
      netlifyPurged = true;
    } catch {
      // Not on Netlify (local dev) or purge failed — that's OK
    }

    return NextResponse.json({ revalidated: true, netlifyPurged, path });
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: String(err) },
      { status: 500 },
    );
  }
}
