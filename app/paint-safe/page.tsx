import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const SITE_NAME = 'Touchless Car Wash Finder';

export const metadata: Metadata = {
  title: 'The Paint-Safe Verified Badge — How We Check Car Washes for Paint Safety',
  description:
    'How the Paint-Safe Verified badge works: we analyze thousands of real Google customer reviews to identify touchless car washes that are gentle on your vehicle’s paint and finish.',
  alternates: { canonical: `${SITE_URL}/paint-safe` },
  openGraph: {
    title: `Paint-Safe Verified — How It Works | ${SITE_NAME}`,
    description:
      'We read real customer reviews to flag touchless car washes that are gentle on your paint. Here’s exactly how the Paint-Safe Verified badge is earned.',
    url: `${SITE_URL}/paint-safe`,
    type: 'website',
  },
};

const faq = [
  {
    q: 'Is a touchless car wash safe for my paint?',
    a: 'Generally yes — touchless (also called brushless or laser) washes clean with high-pressure water and detergents instead of physical brushes, so there are no spinning bristles to drag grit across your finish. Our analysis of thousands of reviews found paint-damage complaints are rare at verified touchless washes. The Paint-Safe Verified badge highlights the locations customers consistently report as gentle.',
  },
  {
    q: 'How is this different from the Google star rating?',
    a: 'A Google star rating reflects the overall experience — price, wait times, staff, cleanliness, everything. The Paint-Safe Verified badge looks at one specific thing: what customers say about the wash’s effect on their paint and finish.',
  },
  {
    q: 'Why doesn’t every wash have the badge?',
    a: 'A wash needs enough customer reviews about paint to judge fairly. Washes without enough paint feedback simply show “not enough reviews yet” rather than a badge — it’s not a negative mark, just a lack of data.',
  },
  {
    q: 'Can a wash earn the badge over time?',
    a: 'Yes. As new reviews come in, we periodically re-check every wash. A location that builds a track record of gentle, no-damage feedback can earn the badge on a future update.',
  },
];

export default function PaintSafePage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#22C55E] mb-5">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">The Paint-Safe Verified Badge</h1>
          <p className="text-blue-100 text-lg">
            How we use real customer reviews to flag touchless car washes that are gentle on your paint.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl prose prose-lg prose-gray">
          <h2>What the Paint-Safe Verified badge means</h2>
          <p>
            Choosing a car wash usually comes down to one quiet worry: <em>&ldquo;will this scratch or swirl my
            paint?&rdquo;</em> The <strong>Paint-Safe Verified</strong> badge answers it. It marks touchless car washes
            whose customers consistently report that the wash is gentle on their vehicle&rsquo;s finish &mdash; based on
            real reviews, not our opinion.
          </p>

          <h2>How a wash earns it</h2>
          <p>We read the Google reviews that mention paint, scratches, swirls, or finish, and a wash earns the badge when all of the following are true:</p>
          <ul>
            <li><strong>It&rsquo;s a verified touchless wash</strong> &mdash; brushless by design, so nothing physical touches your paint.</li>
            <li><strong>It has enough reviews</strong> to judge fairly (we don&rsquo;t rate washes with too little feedback).</li>
            <li><strong>Paint-damage complaints are rare</strong> relative to its total reviews.</li>
            <li><strong>Customers who mention paint are positive on balance</strong> &mdash; praise outweighs concerns.</li>
          </ul>
          <p>
            We only count feedback about the <strong>touchless</strong> wash itself. If a complaint is clearly about a
            brush bay or self-serve equipment at the same location, it doesn&rsquo;t count against the touchless
            paint-safety rating.
          </p>

          <h2>What you&rsquo;ll see on a listing</h2>
          <ul>
            <li><strong>Paint-Safe Verified</strong> &mdash; the wash met all the criteria above.</li>
            <li><strong>Not enough reviews yet</strong> &mdash; verified touchless, but not enough paint feedback to judge. Neutral, not negative.</li>
            <li><strong>No badge, with reviews shown</strong> &mdash; the wash has paint feedback that didn&rsquo;t meet the bar. We show the real reviews &mdash; the good and the critical &mdash; and let you decide.</li>
          </ul>

          <h2>Our principles</h2>
          <ul>
            <li><strong>Real customer voices.</strong> Every signal comes from genuine Google reviews. We never invent ratings.</li>
            <li><strong>We show the negatives too.</strong> Even badged washes display the small share of customers who raised concerns &mdash; honesty makes the badge trustworthy.</li>
            <li><strong>We never label a business &ldquo;unsafe.&rdquo;</strong> A wash either earns the badge or simply doesn&rsquo;t &mdash; we don&rsquo;t publish a negative grade.</li>
            <li><strong>Source &amp; attribution.</strong> Reviews come from Google; we show short excerpts and link back to the full reviews on Google.</li>
          </ul>

          <h2>Frequently asked questions</h2>
          {faq.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}

          <hr />
          <p className="text-base text-gray-500">
            Ready to find one near you?{' '}
            <Link href="/" className="text-[#22C55E] font-semibold no-underline hover:underline">
              Search touchless car washes →
            </Link>
          </p>
          <p className="text-sm text-gray-400">Maintained by the {SITE_NAME} editorial team. Updated as new reviews come in.</p>
        </div>
      </section>
    </main>
  );
}
