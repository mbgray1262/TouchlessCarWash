/**
 * Curated set of universally-relevant blog posts surfaced on state, city,
 * and listing pages as "Related Reading." These are the posts that fit
 * literally any touchless-car-wash searcher — comparison, cost, safety,
 * tips. The point is to flow internal PageRank from the 6,500+ directory
 * pages into the blog, where every post sits orphaned at position 60+
 * for queries it directly answers.
 *
 * Anchor text matches each post's H1 so Google sees descriptive,
 * keyword-aligned internal links. Add new entries here only when the
 * post is genuinely useful to *every* visitor — niche posts (winter
 * washing, removing water spots) belong on contextual surfaces, not
 * here.
 */
export type RelatedBlog = {
  slug: string;
  title: string;
  blurb: string;
};

export const RELATED_BLOGS: RelatedBlog[] = [
  {
    slug: 'how-do-touchless-car-washes-work',
    title: 'What Is a Touchless Car Wash and How Does It Work?',
    blurb: 'How high-pressure water and chemistry replace brushes — the basics every driver should know.',
  },
  {
    slug: 'how-much-does-touchless-car-wash-cost',
    title: 'How Much Does a Touchless Car Wash Cost?',
    blurb: 'Single wash, monthly membership, premium packages — what to expect to pay in 2026.',
  },
  {
    slug: 'touchless-vs-brush-car-wash',
    title: 'Touchless vs Brush Car Wash: Which Is Better for Your Car?',
    blurb: 'Side-by-side comparison of paint safety, clean quality, and value.',
  },
  {
    slug: 'is-touchless-car-wash-safe-for-tesla',
    title: 'Is a Touchless Car Wash Safe for Tesla?',
    blurb: 'A complete guide for Tesla owners on Model 3, Y, S, and X.',
  },
  {
    slug: 'touchless-car-wash-tips',
    title: '5 Tips to Get the Most Out of Your Touchless Car Wash',
    blurb: 'Practical tips for a cleaner finish on every visit.',
  },
  {
    slug: 'best-touchless-car-wash-subscriptions-2026',
    title: 'Best Touchless Car Wash Subscriptions in 2026',
    blurb: 'Unlimited plans from major chains, ranked by value.',
  },
];
