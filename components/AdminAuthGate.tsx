'use client';

import { useAdminAuth } from './AdminAuthProvider';
import { signInWithGoogle } from '@/lib/auth';
import { Loader2, ShieldX, LogIn } from 'lucide-react';

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const { state, supabase } = useAdminAuth();

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-7 h-7 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F2744] mb-2">Admin Access</h1>
          <p className="text-gray-500 text-sm mb-8">
            Sign in with your Google account to continue.
          </p>
          <button
            onClick={() => signInWithGoogle(supabase)}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 bg-white border-2 border-gray-200 rounded-xl text-[#0F2744] font-semibold text-sm hover:border-orange-300 hover:bg-orange-50 transition-all"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'unauthorized') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldX className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F2744] mb-2">Access Denied</h1>
          <p className="text-gray-500 text-sm mb-2">
            <span className="font-medium text-gray-700">{state.email}</span> is not authorized to access this area.
          </p>
          <p className="text-gray-400 text-xs mb-8">
            Contact the site owner if you believe this is a mistake.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full px-5 py-3 bg-gray-100 rounded-xl text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-all"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
