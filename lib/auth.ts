import { createClient } from '@supabase/supabase-js';

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function signInWithGoogle(supabase: ReturnType<typeof createBrowserClient>) {
  const redirectTo = typeof window !== 'undefined'
    ? `${window.location.origin}/admin/auth/callback`
    : undefined;

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
}

export async function signOut(supabase: ReturnType<typeof createBrowserClient>) {
  return supabase.auth.signOut();
}

export async function isAdminEmail(supabase: ReturnType<typeof createBrowserClient>, email: string): Promise<boolean> {
  const { data } = await supabase
    .from('admin_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  return !!data;
}
