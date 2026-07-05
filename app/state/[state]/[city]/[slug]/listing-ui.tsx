/**
 * Small presentational pieces shared by the listing detail page's sections:
 * star rows, sentiment badges, review-snippet and nearby-listing cards.
 * Server components — pure render, no state.
 */
import Link from 'next/link';
import { Star, Quote, ThumbsUp, ThumbsDown, Minus, ChevronRight } from 'lucide-react';
import { ListingThumb } from '@/components/ListingThumb';
import type { Listing, ReviewSnippet } from '@/lib/supabase';
import { buildListingUrl } from './listing-data';

export function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.25 && rating - full < 0.75;
  const stars = Array.from({ length: 5 }, (_, i) => {
    if (i < full) return 'full';
    if (i === full && half) return 'half';
    return 'empty';
  });
  return (
    <span className="flex items-center gap-0.5">
      {stars.map((type, i) => (
        <span key={i} className="relative inline-block w-4 h-4">
          <Star className="w-4 h-4 text-gray-300 fill-gray-300 absolute inset-0" />
          {type === 'full' && (
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 absolute inset-0" />
          )}
          {type === 'half' && (
            <span className="absolute inset-0 overflow-hidden w-[50%]">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Smart-truncate a review to ~maxLen chars, keeping the first keyword visible.
 * If the keyword is near the start the text is simply trimmed at the end.
 * If the keyword is buried deep, we trim from both sides and add ellipses.
 */
function smartTruncate(text: string, keywords: string[], maxLen = 280): string {
  if (text.length <= maxLen) return text;
  if (!keywords || keywords.length === 0) return text.slice(0, maxLen).trimEnd() + '…';

  // Find the earliest keyword match
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const match = pattern.exec(text);

  if (!match) return text.slice(0, maxLen).trimEnd() + '…';

  const kwStart = match.index;
  const kwEnd = kwStart + match[0].length;

  // If keyword is within the first maxLen chars, just truncate the end
  if (kwEnd <= maxLen - 20) {
    return text.slice(0, maxLen).trimEnd() + '…';
  }

  // Otherwise center a window around the keyword
  const padding = Math.floor((maxLen - match[0].length) / 2);
  let start = Math.max(0, kwStart - padding);
  let end = Math.min(text.length, kwEnd + padding);

  // Snap to word boundaries
  if (start > 0) {
    const spaceAfter = text.indexOf(' ', start);
    if (spaceAfter !== -1 && spaceAfter < start + 20) start = spaceAfter + 1;
  }
  if (end < text.length) {
    const spaceBefore = text.lastIndexOf(' ', end);
    if (spaceBefore > end - 20) end = spaceBefore;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

/** Highlight touchless keywords in review text with green accent. */
function HighlightedReviewText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords || keywords.length === 0) return <>{text}</>;

  // Build a regex that matches any keyword (case-insensitive)
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  if (sentiment === 'positive') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <ThumbsUp className="w-3 h-3" />
        Positive
      </span>
    );
  }
  if (sentiment === 'negative') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <ThumbsDown className="w-3 h-3" />
        Negative
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
      <Minus className="w-3 h-3" />
      Mixed
    </span>
  );
}

export function ReviewSnippetCard({ snippet }: { snippet: ReviewSnippet }) {
  const displayText = smartTruncate(snippet.review_text, snippet.touchless_keywords);
  const borderColor = snippet.sentiment === 'positive'
    ? 'border-green-200 bg-green-50/30'
    : snippet.sentiment === 'negative'
    ? 'border-red-200 bg-red-50/30'
    : 'border-gray-100 bg-gray-50';
  return (
    <div className={`p-4 rounded-xl border ${borderColor}`}>
      <div className="flex items-start gap-3">
        <Quote className="w-5 h-5 text-[#22C55E]/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 leading-relaxed">
            <HighlightedReviewText text={displayText} keywords={snippet.touchless_keywords} />
          </p>
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {snippet.sentiment && <SentimentBadge sentiment={snippet.sentiment} />}
            {snippet.rating && snippet.rating > 0 && (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: snippet.rating }, (_, i) => (
                  <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                ))}
              </span>
            )}
            <span className="text-xs text-gray-500 font-medium">
              {snippet.reviewer_name || 'Anonymous'}
            </span>
            {snippet.review_date && (
              <span className="text-xs text-gray-400">{snippet.review_date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NearbyListingCard({ nearby }: { nearby: Listing }) {
  // Always link via the nearby listing's OWN state — never the current page's.
  // A wash just across a state border surfaced as "nearby" and linked under the
  // current page's state produced wrong-state duplicate URLs. buildListingUrl()
  // mirrors the sitemap's canonical path exactly.
  return (
    <Link
      href={buildListingUrl(nearby)}
      className="group flex gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-[#22C55E] hover:shadow-sm transition-all"
    >
      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
        <ListingThumb listing={nearby} alt={nearby.name} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#0F2744] text-sm leading-tight group-hover:text-[#22C55E] transition-colors truncate">{nearby.name}</div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{nearby.city}, {nearby.state}</div>
        {nearby.rating > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-semibold text-gray-700">{Number(nearby.rating).toFixed(1)}</span>
            {nearby.review_count > 0 && <span className="text-xs text-gray-400">({nearby.review_count})</span>}
          </div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#22C55E] shrink-0 self-center transition-colors" />
    </Link>
  );
}
