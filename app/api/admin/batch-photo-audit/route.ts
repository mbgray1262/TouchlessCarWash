/**
 * Server-side proxy for the batch-photo-audit Supabase edge function.
 *
 * Calling the edge function directly from the browser requires a valid user JWT.
 * When the user's Supabase session has expired and can't be refreshed, the browser
 * falls back to the anon key — which some edge function configurations reject (401).
 *
 * This route runs server-side and uses the service role key (or anon key) from the
 * server environment, bypassing client-side session issues entirely.
 */

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Prefer service role key server-side (not exposed to browser); fall back to anon key.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/batch-photo-audit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Network error: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || `Edge function returned status ${res.status}` };
  }

  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
