'use client';

import { Image, CheckCircle, Flag } from 'lucide-react';

interface Props {
  totalWithHero: number;
  replacements: number;
  flagged: number;
}

export function StatsBar({ totalWithHero, replacements, flagged }: Props) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Image className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900 leading-none">{totalWithHero.toLocaleString()}</p>
          <p className="text-xs text-gray-500 leading-tight">with heroes</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900 leading-none">{replacements}</p>
          <p className="text-xs text-gray-500 leading-tight">replaced this session</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <Flag className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900 leading-none">{flagged}</p>
          <p className="text-xs text-gray-500 leading-tight">flagged for later</p>
        </div>
      </div>
    </div>
  );
}
