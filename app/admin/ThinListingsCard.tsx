'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const BATCH = 25;

export default function ThinListingsCard({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  async function handleFix() {
    setRunning(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-listings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: BATCH }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const queued = typeof data.targeted === 'number' ? data.targeted : BATCH;
      setCount(c => Math.max(0, c - queued));
      toast({
        title: `Enrichment started for ${queued} listing${queued !== 1 ? 's' : ''}`,
        description: 'Descriptions generate in the background. Refresh in a minute to see the updated count.',
      });
    } catch (err) {
      toast({
        title: 'Bulk fix failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <Toaster />
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 bg-amber-50 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-[#0F2744] mb-1">Thin Listings</h2>
      <p className="text-sm text-gray-500 mb-3">Touchless listings missing an AI description</p>
      <p className="text-2xl font-bold text-[#0F2744] mb-4">
        {count.toLocaleString()}
        <span className="text-sm font-normal text-gray-400 ml-1.5">
          listing{count !== 1 ? 's' : ''}
        </span>
      </p>
      <button
        onClick={handleFix}
        disabled={running || count === 0}
        className="inline-flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 bg-[#0F2744] hover:bg-[#1E3A8A] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Enriching...</>
        ) : count === 0 ? (
          <><CheckCircle2 className="w-4 h-4" /> All caught up</>
        ) : (
          <><Sparkles className="w-4 h-4" /> Fix next {Math.min(BATCH, count)}</>
        )}
      </button>
    </div>
  );
}
