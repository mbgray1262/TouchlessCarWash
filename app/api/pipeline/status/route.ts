import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const runsPage = parseInt(req.nextUrl.searchParams.get('runs_page') ?? '0', 10);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/firecrawl-pipeline?action=status&runs_page=${runsPage}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
