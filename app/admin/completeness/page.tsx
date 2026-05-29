'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Sparkles, RefreshCw, CheckCircle2, ExternalLink, FileText,
  MapPin, MessageSquare, Tag, Clock, Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

interface Row {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slug: string;
  no_description: boolean;
  no_image: boolean;
  no_amenities: boolean;
  no_hours: boolean;
  no_maps_url: boolean;
  no_reviews: boolean;
}

type CompKey = 'no_description' | 'no_maps_url' | 'no_reviews' | 'no_amenities' | 'no_hours' | 'no_image';

const COMPONENTS: { key: CompKey; label: string; icon: typeof FileText; autoFix: boolean }[] = [
  { key: 'no_description', label: 'Description', icon: FileText, autoFix: true },
  { key: 'no_maps_url', label: 'Maps link', icon: MapPin, autoFix: true },
  { key: 'no_reviews', label: 'Reviews', icon: MessageSquare, autoFix: true },
  { key: 'no_amenities', label: 'Amenities', icon: Tag, autoFix: true },
  { key: 'no_hours', label: 'Hours', icon: Clock, autoFix: true },
  { key: 'no_image', label: 'Image', icon: ImageIcon, autoFix: false },
];

const BATCH = 25;

export default function CompletenessPage() {
  const [before, setBefore] = useState<Row[]>([]);
  const [after, setAfter] = useState<Record<string, Row>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'fixing' | 'polling' | 'done'>('idle');
  const { toast } = useToast();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const loadBatch = useCallback(async () => {
    setStatus('loading');
    setAfter({});
    const { data, error } = await supabase.rpc('completeness_rows', { p_limit: BATCH });
    if (error) {
      toast({ title: 'Failed to load listings', description: error.message, variant: 'destructive' });
      setStatus('idle');
      return;
    }
    setBefore((data as Row[]) ?? []);
    setStatus('idle');
  }, [toast]);

  // Auto-load the first batch so the page isn't an empty screen.
  useEffect(() => { loadBatch(); }, [loadBatch]);

  const refetchAfter = useCallback(async (ids: string[]) => {
    const { data } = await supabase.rpc('completeness_rows', { p_ids: ids });
    const map: Record<string, Row> = {};
    for (const r of (data as Row[]) ?? []) map[r.id] = r;
    setAfter(map);
  }, []);

  async function handleFix() {
    const ids = before.map(r => r.id);
    if (ids.length === 0) return;
    setStatus('fixing');
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-listings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      // Google data + amenities are filled synchronously; descriptions run as a
      // background job, so poll a few times to catch them landing.
      setStatus('polling');
      await refetchAfter(ids);
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 8000));
        await refetchAfter(ids);
      }
      setStatus('done');
      toast({ title: 'Enrichment complete', description: 'Review the before / after below.' });
    } catch (err) {
      setStatus('done');
      toast({ title: 'Fix failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  }

  const busy = status === 'loading' || status === 'fixing' || status === 'polling';
  const hasAfter = Object.keys(after).length > 0;

  function publicHref(r: Row) {
    return `/state/${getStateSlug(r.state ?? '')}/${slugify(r.city ?? '')}/${r.slug}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 max-w-7xl py-4 flex items-center gap-3">
          <Link href="/admin" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-[#0F2744]">Listing Completeness</span>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-7xl py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2744] mb-1">Fix incomplete listings</h1>
            <p className="text-gray-500 text-sm max-w-2xl">
              Load the next {BATCH} incomplete touchless listings, run the free enrichment, and see exactly
              what was filled in. Green = newly added by the fix. Amber = still missing.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={loadBatch}
              disabled={busy}
              className="inline-flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
            >
              {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Load next {BATCH}
            </button>
            <button
              onClick={handleFix}
              disabled={busy || before.length === 0}
              className="inline-flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 bg-[#0F2744] hover:bg-[#1E3A8A] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'fixing' || status === 'polling'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {status === 'fixing' ? 'Enriching...' : 'Checking results...'}</>
                : <><Sparkles className="w-4 h-4" /> Fix these {before.length || BATCH} (free)</>}
            </button>
          </div>
        </div>

        {before.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            <p className="mb-4">Click <span className="font-medium">Load next {BATCH}</span> to pull the next batch of incomplete listings.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left font-medium text-gray-500 px-4 py-3">Listing</th>
                  {COMPONENTS.map(c => (
                    <th key={c.key} className="px-2 py-3 font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-1">
                        <c.icon className="w-3.5 h-3.5" />
                        <span className="text-[11px]">{c.label}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {before.map(row => {
                  const aft = after[row.id];
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#0F2744] truncate max-w-[220px]">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.city}, {row.state}</p>
                      </td>
                      {COMPONENTS.map(c => {
                        const wasMissing = row[c.key];
                        const nowMissing = aft ? aft[c.key] : wasMissing;
                        let content;
                        if (!wasMissing) {
                          content = <span className="text-gray-300" title="Already present">✓</span>;
                        } else if (hasAfter && aft && !nowMissing) {
                          content = <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 font-bold" title="Added by fix">✓</span>;
                        } else if (hasAfter && aft && nowMissing) {
                          content = <span className="text-amber-500" title={c.autoFix ? 'Still missing' : 'Use Hero Audit tool'}>—</span>;
                        } else {
                          content = <span className="text-gray-300" title="Missing">·</span>;
                        }
                        return <td key={c.key} className="px-2 py-3 text-center">{content}</td>;
                      })}
                      <td className="px-3 py-3 text-right">
                        <Link href={publicHref(row)} target="_blank" className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs">
                          View <ExternalLink className="w-3 h-3 ml-0.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {status === 'done' && (
              <div className="px-4 py-3 bg-green-50 border-t border-green-100 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Done. Green checks were added by this run. Descriptions can take an extra minute — click
                <button onClick={() => refetchAfter(before.map(r => r.id))} className="underline font-medium mx-1">refresh results</button>
                if any are still catching up.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
