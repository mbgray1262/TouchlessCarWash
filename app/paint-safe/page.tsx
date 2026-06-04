import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CheckCircle } from 'lucide-react';

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

const CRITERIA = [
  { h: 'It’s a verified touchless wash', t: 'brushless by design, so nothing physical touches your paint.' },
  { h: 'It has enough reviews', t: 'to judge fairly — we don’t rate washes with too little feedback.' },
  { h: 'Paint-damage complaints are rare', t: 'relative to its total number of reviews.' },
  { h: 'Paint feedback is positive on balance', t: 'among customers who mention paint, praise outweighs concerns.' },
];

const STATES = [
  { label: 'Paint-Safe Verified', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', t: 'The wash met all the criteria above.' },
  { label: 'Not enough reviews yet', cls: 'bg-slate-100 text-slate-600 border-slate-200', t: 'Verified touchless, but not enough paint feedback to judge. Neutral — not a negative mark.' },
  { label: 'No badge (reviews shown)', cls: 'bg-amber-50 text-amber-700 border-amber-200', t: 'The wash has paint feedback that didn’t meet the bar. We show the real reviews — the good and the critical — and let you decide.' },
];

const PRINCIPLES = [
  ['Real customer voices.', 'Every signal comes from genuine Google reviews. We never invent ratings.'],
  ['We show the negatives too.', 'Even badged washes display the small share of customers who raised concerns — honesty makes the badge trustworthy.'],
  ['We never label a business “unsafe.”', 'A wash either earns the badge or simply doesn’t — we don’t publish a negative grade.'],
  ['Source & attribution.', 'Reviews come from Google; we show short excerpts and link back to the full reviews on Google.'],
];

const FAQ = [
  { q: 'Is a touchless car wash safe for my paint?', a: 'Generally yes — touchless (also called brushless or laser) washes clean with high-pressure water and detergents instead of physical brushes, so there are no spinning bristles to drag grit across your finish. Our analysis of thousands of reviews found paint-damage complaints are rare at verified touchless washes. The Paint-Safe Verified badge highlights the locations customers consistently report as gentle.' },
  { q: 'How is this different from the Google star rating?', a: 'A Google star rating reflects the overall experience — price, wait times, staff, cleanliness, everything. The Paint-Safe Verified badge looks at one specific thing: what customers say about the wash’s effect on their paint and finish.' },
  { q: 'Why doesn’t every wash have the badge?', a: 'A wash needs enough customer reviews about paint to judge fairly. Washes without enough paint feedback simply show “not enough reviews yet” rather than a badge — it’s not a negative mark, just a lack of data.' },
  { q: 'Can a wash earn the badge over time?', a: 'Yes. As new reviews come in, we periodically re-check every wash. A location that builds a track record of gentle, no-damage feedback can earn the badge on a future update.' },
];

export default function PaintSafePage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
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
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">The Paint-Safe Verified Badge</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            How we use real customer reviews to flag touchless car washes that are gentle on your paint.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-3xl text-[15px] leading-relaxed text-gray-700">

          <p className="text-lg text-gray-800 leading-relaxed">
            Choosing a car wash usually comes down to one quiet worry: <em>&ldquo;will this scratch or swirl my paint?&rdquo;</em>{' '}
            The <strong className="text-[#0F2744]">Paint-Safe Verified</strong> badge answers it — it marks touchless car washes
            whose customers consistently report the wash is gentle on their vehicle&rsquo;s finish, based on real reviews, not our opinion.
          </p>

          {/* How it's earned */}
          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-3">How a wash earns the badge</h2>
          <p className="mb-5">We read the Google reviews that mention paint, scratches, swirls, or finish. A wash earns the badge when <strong>all four</strong> are true:</p>
          <ul className="space-y-3">
            {CRITERIA.map((c) => (
              <li key={c.h} className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-[#22C55E] shrink-0 mt-0.5" />
                <span><strong className="text-[#0F2744]">{c.h}</strong> — {c.t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-gray-600 bg-slate-50 border border-gray-200 rounded-xl p-4">
            We only count feedback about the <strong>touchless</strong> wash itself — if a complaint is clearly about a brush bay or
            self-serve equipment at the same location, it doesn&rsquo;t count against the touchless paint-safety rating.
          </p>

          {/* States */}
          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">What you&rsquo;ll see on a listing</h2>
          <div className="space-y-3">
            {STATES.map((s) => (
              <div key={s.label} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-100 rounded-xl p-4">
                <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border w-fit shrink-0 ${s.cls}`}>{s.label}</span>
                <span className="text-gray-600">{s.t}</span>
              </div>
            ))}
          </div>

          {/* Principles */}
          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">Our principles</h2>
          <ul className="list-disc pl-5 space-y-2.5 marker:text-[#22C55E]">
            {PRINCIPLES.map(([b, t]) => (
              <li key={b}><strong className="text-[#0F2744]">{b}</strong> {t}</li>
            ))}
          </ul>

          {/* FAQ */}
          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">Frequently asked questions</h2>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="text-base font-semibold text-[#0F2744] mb-1.5">{f.q}</h3>
                <p className="text-gray-600">{f.a}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-10 rounded-2xl bg-[#0F2744] text-white p-6 text-center">
            <p className="text-lg font-semibold mb-3">Find a paint-safe touchless wash near you</p>
            <Link href="/" className="inline-block bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              Search touchless car washes →
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-400 text-center">Maintained by the {SITE_NAME} editorial team. Updated as new reviews come in.</p>
        </div>
      </section>
    </main>
  );
}
