'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, X } from 'lucide-react';

/**
 * Friendly banner that shows on the destination of a soft-404 redirect so
 * users understand why their URL changed. Reads `?from=` / `?orig=` query
 * params and explains what happened. Dismissible.
 *
 * The `?from=...` param variants are blocked from Google indexing by
 * robots.txt (`Disallow: /*?from=`), so this does not create duplicate
 * URL exposure in search results.
 */
function RedirectBannerInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const orig = searchParams.get('orig');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (from !== 'removed-listing' && from !== 'empty-city') return null;

  const message =
    from === 'removed-listing'
      ? orig
        ? `The listing you followed (${decodeURIComponent(orig).replace(/-/g, ' ')}) is no longer in our directory. We couldn't verify it as touchless, or the business has closed. Here's the nearest verified touchless wash.`
        : "The listing you followed is no longer in our directory — we couldn't verify it as touchless, or the business has closed. Here's the nearest verified touchless wash."
      : orig
        ? `We don't have any verified touchless washes in ${decodeURIComponent(orig).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} yet. Here's the nearest city with verified touchless options.`
        : "We don't have verified touchless washes in the city you searched yet. Here's the nearest city with verified touchless options.";

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="container mx-auto px-4 max-w-5xl py-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-blue-900 leading-relaxed">{message}</p>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-blue-600 hover:text-blue-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RedirectBanner() {
  return (
    <Suspense fallback={null}>
      <RedirectBannerInner />
    </Suspense>
  );
}
