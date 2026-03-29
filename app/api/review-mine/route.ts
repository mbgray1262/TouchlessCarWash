import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERPAPI_KEY = process.env.SERPAPI_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Server-side proxy for the review-mine edge function.
 * Injects API keys from environment variables so they never touch the browser.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/review-mine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      ...body,
      serpApiKey: SERPAPI_KEY,
      ...(ANTHROPIC_API_KEY ? { anthropicApiKey: ANTHROPIC_API_KEY } : {}),
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
