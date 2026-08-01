'use client';

/**
 * Tabbed customer-review evidence for MULTI-SERVICE listings — one drawer visible at a time
 * instead of stacking a full review module per category (which, at 2-4 categories, is a wall of
 * near-identical drawers). Each tab renders the SAME SelfServeReviewsModule, per category, with
 * its in-header score hidden (the RatingsByService scorecard above already shows every score).
 * Only shown when a listing has 2+ scored categories; single-service listings keep their single
 * inline module. Fed by ListingMainColumn, which builds the tab list from the same snippet arrays.
 */
import { useState } from 'react';
import SelfServeReviewsModule from '@/components/SelfServeReviewsModule';
import type { SelfServeSnippet } from '@/app/state/[state]/[city]/[slug]/listing-data';

export interface ReviewTab {
  key: string;
  label: string;
  variant: 'touchless' | 'self-serve' | 'hand-wash' | 'detailing';
  color: string;
  snippets: SelfServeSnippet[];
}

export default function CategoryReviewTabs({
  tabs,
  reviewCount,
  googlePlaceId,
}: {
  tabs: ReviewTab[];
  reviewCount: number;
  googlePlaceId: string | null;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? '');
  if (tabs.length === 0) return null;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <section className="mb-4">
      <h2 className="text-[17px] font-extrabold text-[#0F2744] mb-3">What customers say</h2>
      <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Reviews by service">
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className="text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors"
              style={
                on
                  ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                  : { backgroundColor: 'transparent', borderColor: '#e5e7eb', color: '#475569' }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {/* key forces a fresh module (and its internal filter/expand state) per tab switch. */}
      <SelfServeReviewsModule
        key={current.key}
        variant={current.variant}
        snippets={current.snippets}
        reviewCount={reviewCount}
        googlePlaceId={googlePlaceId}
        hideScore
      />
    </section>
  );
}
