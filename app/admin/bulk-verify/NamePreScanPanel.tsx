'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Scan, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './utils';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TOUCHLESS_FILTER =
  'name.ilike.%touchless%,' +
  'name.ilike.%touch free%,' +
  'name.ilike.%touchfree%,' +
  'name.ilike.%brushless%,' +
  'name.ilike.%laserwash%,' +
  'name.ilike.%no touch%,' +
  'name.ilike.%notouch%,' +
  'name.ilike.%no-touch%,' +
  'name.ilike.%friction free%,' +
  'name.ilike.%frictionfree%';

interface ScanResult {
  touchless: number;
  likelyTouchless: number;
}

interface Props {
  onComplete: () => void;
}

export function NamePreScanPanel({ onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const { count: touchlessCount, error: countErr1 } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .not('is_touchless', 'eq', true)
        .in('verification_status', ['pending', 'unverified'])
        .or(TOUCHLESS_FILTER);

      if (countErr1) throw new Error(countErr1.message);

      const { error: updateErr1 } = await supabase
        .from('listings')
        .update({
          is_touchless: true,
          verification_status: 'auto_classified',
          classification_confidence: 95,
          classification_source: 'name_match',
        } as any)
        .not('is_touchless', 'eq', true)
        .in('verification_status', ['pending', 'unverified'])
        .or(TOUCHLESS_FILTER);

      if (updateErr1) throw new Error(updateErr1.message);

      const { count: likelyCount, error: countErr2 } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .not('is_touchless', 'eq', true)
        .in('verification_status', ['pending', 'unverified'])
        .is('classification_source', null)
        .ilike('name', '%laser%');

      if (countErr2) throw new Error(countErr2.message);

      const { error: updateErr2 } = await supabase
        .from('listings')
        .update({
          verification_status: 'auto_classified',
          classification_confidence: 70,
          classification_source: 'name_match_likely',
        } as any)
        .not('is_touchless', 'eq', true)
        .in('verification_status', ['pending', 'unverified'])
        .is('classification_source', null)
        .ilike('name', '%laser%');

      if (updateErr2) throw new Error(updateErr2.message);

      setResult({
        touchless: touchlessCount ?? 0,
        likelyTouchless: likelyCount ?? 0,
      });
      onComplete();
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase tracking-wider">Step 0</span>
              <h2 className="text-base font-semibold text-gray-900">Name Pre-Scan</h2>
            </div>
            <p className="text-sm text-gray-500">
              Instantly classify listings using keywords in their business name — no API credits needed.
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={running}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-[#0F2744] text-white text-sm font-medium rounded-lg hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>
            ) : (
              <><Scan className="w-4 h-4" />Run Name Pre-Scan</>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <p className="text-xs text-gray-400">
          Matches: <span className="font-mono text-gray-500">touchless, touch free, brushless, laserwash, no touch, friction free</span> at 95% confidence, and <span className="font-mono text-gray-500">laser</span> at 70% confidence (flagged for review).
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">{result.touchless.toLocaleString()} auto-classified as touchless</p>
                <p className="text-xs text-emerald-600">95% confidence · name_match</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{result.likelyTouchless.toLocaleString()} flagged as likely touchless</p>
                <p className="text-xs text-amber-600">70% confidence · name_match_likely · needs review</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
