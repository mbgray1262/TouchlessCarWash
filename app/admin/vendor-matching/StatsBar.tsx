'use client';

import { MatchStats } from './types';

interface Props {
  stats: MatchStats;
}

export function StatsBar({ stats }: Props) {
  const cards = [
    { label: 'Unmatched Listings', value: stats.totalUnmatched, color: 'text-gray-900' },
    { label: 'Ready to Link', value: stats.readyToLink, color: 'text-emerald-700' },
    { label: 'New Domains', value: stats.newDomains, color: 'text-blue-700' },
    { label: 'Potential Chains', value: stats.newChains, color: 'text-orange-700' },
    { label: 'Standalone', value: stats.newStandalone, color: 'text-gray-600' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{c.label}</p>
          <p className={`text-3xl font-bold mt-1 ${c.color}`}>{c.value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
