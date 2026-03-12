import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

/**
 * On-demand revalidation endpoint for admin tools.
 * POST /api/revalidate { path: "/state/kansas/louisburg/xcel-car-wash-..." }
 *
 * Purges the ISR cache for the given path so the next visitor sees fresh data.
 */
export async function POST(request: NextRequest) {
  try {
    const { path } = (await request.json()) as { path?: string };

    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    revalidatePath(path);

    return NextResponse.json({ revalidated: true, path });
  } catch (err) {
    return NextResponse.json(
      { error: 'Revalidation failed', detail: String(err) },
      { status: 500 },
    );
  }
}
