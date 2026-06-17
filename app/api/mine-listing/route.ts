import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/mine-listing  { listingId }
 *
 * INSTANT review mining: dispatches the `mine-one-listing` GitHub Actions
 * workflow for a single listing right away (instead of waiting for the ~5-min
 * drain). The workflow runs the free Playwright miner -> label -> score, then
 * marks the listing review_mine_status='mined'.
 *
 * Requires a GitHub token with Actions:write on the repo, stored as the Netlify
 * env var GITHUB_DISPATCH_TOKEN. If it's missing/invalid, this route reports a
 * graceful fallback — the caller still set review_mine_status='pending', so the
 * scheduled 5-min drain picks the listing up regardless.
 */
const REPO = 'mbgray1262/TouchlessCarWash';
const WORKFLOW = 'mine-one-listing.yml';

export async function POST(request: NextRequest) {
  let listingId: string | undefined;
  try {
    ({ listingId } = (await request.json()) as { listingId?: string });
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    // Not yet configured — the listing is already flagged 'pending', so the
    // 5-min drain will handle it. Tell the client it fell back rather than erroring.
    return NextResponse.json(
      { dispatched: false, fallback: 'queued', detail: 'GITHUB_DISPATCH_TOKEN not set — will mine on the next 5-min drain' },
      { status: 200 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { listing_id: listingId } }),
    },
  );

  if (res.status === 204) {
    return NextResponse.json({ dispatched: true });
  }
  const detail = await res.text().catch(() => '');
  return NextResponse.json(
    { dispatched: false, fallback: 'queued', detail: `GitHub dispatch ${res.status}: ${detail.slice(0, 200)} — will mine on the next 5-min drain` },
    { status: 200 },
  );
}
