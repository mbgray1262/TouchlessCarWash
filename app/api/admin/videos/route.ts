import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export const dynamic = 'force-dynamic';

/**
 * Manage the equipment-video pool shown in the "See a Touchless Wash in Action"
 * section on listing pages. Backs the /admin/videos page.
 *
 *   GET    -> list all videos (ordered)
 *   POST   { url } [, title] -> validate a YouTube URL/id (real + embeddable),
 *                               then add it to the pool
 *   PATCH  { id, ...fields }  -> update title / is_active / sort_order
 *   DELETE { id }             -> remove a video
 */

// Pull the 11-char video id out of any common YouTube URL form, or accept a
// bare id that's pasted directly.
function extractYouTubeId(input: string): string | null {
  const s = (input || '').trim();
  if (!s) return null;
  // Bare 11-char id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1, 12);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      // /embed/<id> or /shorts/<id> or /live/<id>
      const m = url.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  // Last resort: find an 11-char token inside the string
  const m = s.match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : null;
}

// Confirm the video is real/public (oEmbed returns its title) AND embeddable
// (the watch page reports playableInEmbed:true). Returns the canonical title.
async function validateYouTube(
  id: string,
): Promise<{ ok: true; title: string } | { ok: false; reason: string }> {
  let title = '';
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { cache: 'no-store' },
    );
    if (r.status === 401) return { ok: false, reason: 'This video has embedding disabled by its owner.' };
    if (!r.ok) return { ok: false, reason: 'Video not found (it may be private, deleted, or the link is wrong).' };
    const d = await r.json();
    title = (d?.title as string) || '';
  } catch {
    return { ok: false, reason: 'Could not reach YouTube to verify the video.' };
  }

  // Best-effort embeddability probe. We only REJECT when YouTube explicitly
  // reports embedding is disabled ("playableInEmbed":false). We must NOT reject
  // merely because the marker is absent: from a datacenter IP, YouTube often
  // serves a cookie-consent / bot page that omits it, which previously caused
  // false "embedding disabled" errors on perfectly embeddable videos. oEmbed
  // above (200 vs 401) already covers the common embedding-disabled case.
  try {
    const html = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        cookie: 'CONSENT=YES+1',
      },
    }).then((r) => r.text());
    if (html.includes('"playableInEmbed":false')) {
      return { ok: false, reason: 'This video cannot be embedded on other sites (owner disabled embedding).' };
    }
  } catch {
    // Probe failed — fall back to the oEmbed result and allow it through.
  }
  return { ok: true, title };
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('equipment_videos')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ videos: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = extractYouTubeId(typeof body?.url === 'string' ? body.url : '');
    if (!id) {
      return NextResponse.json(
        { error: 'Please paste a valid YouTube link or video id.' },
        { status: 400 },
      );
    }

    // Already in the pool?
    const { data: existing } = await supabaseAdmin
      .from('equipment_videos')
      .select('id')
      .eq('youtube_id', id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'That video is already in the list.' }, { status: 409 });
    }

    const check = await validateYouTube(id);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 422 });

    const customTitle = typeof body?.title === 'string' ? body.title.trim() : '';
    const title = customTitle || check.title || 'Touchless car wash';

    // Place new videos at the end of the pool.
    const { data: last } = await supabaseAdmin
      .from('equipment_videos')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = (last?.sort_order ?? 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('equipment_videos')
      .insert({ youtube_id: id, title, sort_order, is_active: true })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ video: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.title === 'string') update.title = body.title.trim();
    if (typeof body.is_active === 'boolean') update.is_active = body.is_active;
    if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;

    const { data, error } = await supabaseAdmin
      .from('equipment_videos')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ video: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('equipment_videos').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
