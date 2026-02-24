'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createBrowserClient, isAdminEmail } from '@/lib/auth';
import type { User, SupabaseClient } from '@supabase/supabase-js';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'unauthorized'; email: string }
  | { status: 'authorized'; user: User };

const AuthContext = createContext<{
  state: AuthState;
  supabase: SupabaseClient;
  signOut: () => Promise<void>;
} | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createBrowserClient());
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const checkUser = useCallback(async (user: User | null) => {
    if (!user) {
      setState({ status: 'unauthenticated' });
      return;
    }
    const email = user.email ?? '';
    const allowed = await isAdminEmail(supabase, email);
    if (allowed) {
      setState({ status: 'authorized', user });
    } else {
      setState({ status: 'unauthorized', email });
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        await checkUser(session?.user ?? null);
      })();
    });

    return () => subscription.unsubscribe();
  }, [supabase, checkUser]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ state, supabase, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
