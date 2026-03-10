'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GitCompareArrows, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompare } from '@/lib/useCompare';

export function CompareBar() {
  const { count, clear } = useCompare();
  const pathname = usePathname();

  // Don't show on the compare page itself
  if (count === 0 || pathname === '/compare') return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#0F2744] text-white rounded-full shadow-xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
      <GitCompareArrows className="w-4 h-4 text-blue-300" />
      <span className="text-sm font-medium">
        {count} listing{count !== 1 ? 's' : ''} selected
      </span>
      <Button asChild size="sm" className="bg-[#22C55E] hover:bg-[#16A34A] text-white rounded-full h-8 px-4">
        <Link href="/compare">Compare Now</Link>
      </Button>
      <button
        onClick={clear}
        className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
        aria-label="Clear comparison"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
