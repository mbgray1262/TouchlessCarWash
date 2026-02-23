import { createClient } from '@supabase/supabase-js';
import { AdminNav } from '@/components/AdminNav';
import SuggestedEditsClient from './SuggestedEditsClient';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

export default async function SuggestedEditsPage() {
  const { data: edits } = await supabaseAdmin
    .from('listing_edits')
    .select(`
      id,
      listing_id,
      issue_type,
      details,
      email,
      status,
      created_at,
      listings (
        id,
        name,
        city,
        state,
        slug
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="container mx-auto px-4 max-w-5xl py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0F2744]">Suggested Edits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {edits?.length ?? 0} pending suggestion{(edits?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <SuggestedEditsClient initialEdits={edits ?? []} />
      </div>
    </div>
  );
}
