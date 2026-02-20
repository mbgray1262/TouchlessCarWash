'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AdminNav } from '@/components/AdminNav';
import { DashboardStatsPanel } from './DashboardStats';
import { CrawlPanel } from './CrawlPanel';
import { ClassifyPanel } from './ClassifyPanel';
import { ReviewPanel } from './ReviewPanel';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './utils';
import type { DashboardStats } from './types';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EMPTY_STATS: DashboardStats = {
  unverified: 0,
  awaiting_classification: 0,
  auto_classified: 0,
  approved: 0,
  crawl_failed: 0,
  chains: 0,
  standalone: 0,
  total: 0,
};

export default function BulkVerifyPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(false);
  const [reviewTrigger, setReviewTrigger] = useState(0);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [statusRes, chainRes] = await Promise.all([
        supabase.from('listings').select('verification_status').then(({ data }) => data ?? []),
        supabase.from('listings').select('parent_chain').not('parent_chain', 'is', null).then(({ data }) => data ?? []),
      ]);

      const counts: Record<string, number> = {};
      for (const row of statusRes) {
        const s = (row as { verification_status: string }).verification_status ?? 'unverified';
        counts[s] = (counts[s] ?? 0) + 1;
      }

      const uniqueChains = new Set(
        (chainRes as Array<{ parent_chain: string }>).map(r => r.parent_chain)
      ).size;

      const total = statusRes.length;
      setStats({
        total,
        unverified: counts['unverified'] ?? 0,
        awaiting_classification: counts['crawled'] ?? 0,
        auto_classified: counts['auto_classified'] ?? 0,
        approved: counts['approved'] ?? 0,
        crawl_failed: counts['crawl_failed'] ?? 0,
        chains: uniqueChains,
        standalone: total - (chainRes.length ?? 0),
      });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function handleStepComplete() {
    fetchStats();
    setReviewTrigger(t => t + 1);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="container mx-auto px-4 max-w-5xl py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-[#0F2744] mb-1">Bulk Verification Pipeline</h1>
          <p className="text-gray-500 text-sm">
            Process thousands of listings in three steps: crawl websites, classify with Claude AI, then review edge cases.
          </p>
        </div>

        <DashboardStatsPanel stats={stats} onRefresh={fetchStats} loading={statsLoading} />

        <CrawlPanel onComplete={handleStepComplete} />

        <ClassifyPanel onComplete={handleStepComplete} />

        <ReviewPanel refreshTrigger={reviewTrigger} />
      </div>
    </div>
  );
}
