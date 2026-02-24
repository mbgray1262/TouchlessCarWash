import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  return NextResponse.redirect(`${origin}/admin`);
}
