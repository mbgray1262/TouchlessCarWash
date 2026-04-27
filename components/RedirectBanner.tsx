'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Info, X } from 'lucide-react';

/**
 * Friendly banner that shows on the destination of a soft-404 redirect so
 * users understand why their URL changed. Reads `?from=` / `?orig=` query
 * params and explains what happened. Dismissible.
 *
 * The `?from=...` param variants are prevented from indexing via
 * `X-Robots-Tag: noindex` set in middleware.ts — Googlebot must be able to
 * crawl them (to follow the 308 redirect from removed listings) but the
 * clean canonical URL is the version that should enter the index.
 */
function RedirectBannerInner() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const orig = searchParams.get('orig');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  const VALID = new Set(['removed-listing', 'empty-city', 'empty-state', 'closed-permanently', 'closed-temporarily']);
  if (!from || !VALID.has(from)) return null;

  const name = orig ? decodeURIComponent(orig).replace(/-/g, ' ') : null;
  const place = orig
    ? decodeURIComponent(orig).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const message =
    from === 'closed-permanently'
      ? name
        ? `${name} is permanently closed. Here are touchless car washes nearby.`
        : 'That location is permanently closed. Here are touchless car washes nearby.'
    : from === 'closed-temporarily'
      ? name
        ? `${name} is temporarily closed. Here are other touchless car washes nearby.`
        : 'That location is temporarily closed. Here are other touchless car washes nearby.'
    : from === 'removed-listing'
      ? name
        ? `The listing you followed (${name}) is no longer in our directory. We couldn't verify it as touchless, or the business has closed. Here's the nearest verified touchless wash.`
        : "The listing you followed is no longer in our directory — we couldn't verify it as touchless, or the business has closed. Here's the nearest verified touchless wash."
    : from === 'empty-state'
      ? place
        ? `We don't have any verified touchless car washes in ${place} yet. Here's the full list of states with verified touchless options.`
        : "We don't have any verified touchless car washes in that state yet. Here's the full list of states with verified touchless options."
      : place
        ? `We don't have any verified touchless washes in ${place} yet. Here's the nearest city with verified touchless options.`
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
