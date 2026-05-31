/**
 * Shared "best of" quality rule: a wash is excluded when its TOUCHLESS reviews
 * are predominantly negative — customers specifically dislike the touchless
 * service. Uses the touchless-evidence snippet ratio (not the overall Google
 * rating, which is confounded by store/staff/fuel, and not the blunt
 * touchless_sentiment flag, which fires even amid mostly-positive reviews).
 *
 * Both /best/[slug] (the page) and /best (the index) import this so their
 * listing counts can never drift apart.
 */
export const NEG_EXCLUDE_MIN_SNIPPETS = 3;
export const NEG_EXCLUDE_SHARE = 0.6;

export function isDislikedTouchless(positiveSnippets: number, negativeSnippets: number): boolean {
  const total = positiveSnippets + negativeSnippets;
  return total >= NEG_EXCLUDE_MIN_SNIPPETS && negativeSnippets / total >= NEG_EXCLUDE_SHARE;
}
