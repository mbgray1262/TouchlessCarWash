'use client';

import { useState, useEffect } from 'react';
import { Star, X, ExternalLink, Quote } from 'lucide-react';
import type { ReviewSnippet } from '@/lib/supabase';

interface Props {
  reviews: ReviewSnippet[];
  businessName: string;
  rating: number;
  reviewCount: number;
  googlePlaceId: string | null;
}

/**
 * The hero rating "(N reviews)" affordance. Instead of bouncing the user to Google
 * (their prime early exit point), it opens an on-site "Review Highlights" modal built
 * from our stored review snippets — keeping the session on our page — with a secondary
 * "see all on Google" link for the full set. Session-engagement play; the reviews are
 * already server-rendered lower on the page, so this adds no SEO surface, just presentation.
 */
export function ReviewHighlights({ reviews, businessName, rating, reviewCount, googlePlaceId }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 hover:underline underline-offset-2 decoration-white/40 transition-all cursor-pointer"
        aria-label={`Read review highlights for ${businessName}`}
      >
        <span className="font-semibold text-white">{Number(rating).toFixed(1)}</span>
        {reviewCount > 0 && <span className="text-white/60">({reviewCount} reviews)</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-[#0F2744]">Review Highlights</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {businessName} · {Number(rating).toFixed(1)}★{reviewCount > 0 ? ` (${reviewCount} reviews)` : ''}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {reviews.length > 0 ? (
                reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="flex items-start gap-3">
                      <Quote className="w-5 h-5 text-[#22C55E]/40 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{r.review_text}</p>
                        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                          {r.rating != null && r.rating > 0 && (
                            <span className="flex items-center gap-0.5">
                              {Array.from({ length: r.rating }, (_, i) => (
                                <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                              ))}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-medium">{r.reviewer_name || 'Anonymous'}</span>
                          {r.review_date && <span className="text-xs text-gray-400">{r.review_date}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No review highlights yet for this location.</p>
              )}
            </div>

            {googlePlaceId && (
              <div className="px-5 py-3 border-t border-gray-100">
                <a
                  href={`https://search.google.com/local/reviews?placeid=${googlePlaceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#22C55E] hover:underline font-medium flex items-center gap-1.5"
                >
                  See all {reviewCount > 0 ? `${reviewCount} ` : ''}reviews on Google
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
