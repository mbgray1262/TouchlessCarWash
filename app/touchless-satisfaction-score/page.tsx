import type { Metadata } from 'next';
import Link from 'next/link';
import { Gauge, CheckCircle } from 'lucide-react';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const SITE_NAME = 'Touchless Car Wash Finder';

export const metadata: Metadata = {
  title: 'The Touchless Satisfaction Score — How We Rate the Touchless Wash',
  description:
    'How the Touchless Satisfaction Score works: we analyze real Google reviews about the touchless wash specifically — not the whole business — to rate how satisfied customers are, 0 to 100.',
  alternates: { canonical: `${SITE_URL}/touchless-satisfaction-score` },
  openGraph: {
    title: `The Touchless Satisfaction Score — How It Works | ${SITE_NAME}`,
    description:
      'A 0–100 score built from what customers say about the touchless wash specifically, isolated from the rest of the business.',
    url: `${SITE_URL}/touchless-satisfaction-score`,
    type: 'website',
  },
};

const STEPS = [
  { h: 'We read the touchless reviews', t: 'From a wash’s Google reviews, we identify the ones that actually talk about the touchless (automatic / brushless / laser) wash.' },
  { h: 'We isolate the touchless bay', t: 'At mixed locations, comments clearly about a soft-touch tunnel or self-serve bay are set aside — they don’t count toward the touchless score.' },
  { h: 'We measure satisfaction', t: 'Each touchless review is classified as positive or a concern, and we calculate the share that’s positive.' },
  { h: 'We adjust for confidence', t: 'Washes with little feedback are pulled toward the average until they earn enough reviews, so a couple of reviews can’t swing the score.' },
];

const TIERS = [
  { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', t: '84–100 · customers are consistently happy with the touchless wash.' },
  { label: 'Very Good', cls: 'bg-green-50 text-green-700 border-green-200', t: '76–83 · strongly positive feedback.' },
  { label: 'Good', cls: 'bg-lime-50 text-lime-700 border-lime-200', t: '62–75 · mostly positive, some mixed notes.' },
  { label: 'Fair', cls: 'bg-amber-50 text-amber-700 border-amber-200', t: '47–61 · a real mix of praise and complaints.' },
  { label: 'Mixed', cls: 'bg-slate-100 text-slate-600 border-slate-200', t: 'Below 47 · concerns show up often in touchless reviews.' },
];

const FAQ = [
  { q: 'How is this different from the Google star rating?', a: 'The Google star rating reflects the whole business — price, staff, the c-store, every wash bay. The Touchless Satisfaction Score looks only at what customers say about the touchless wash itself. At a location with several wash types, the two can differ a lot — which is exactly the point.' },
  { q: 'Why don’t all washes have a score?', a: 'A wash needs at least a few customer reviews that specifically discuss the touchless wash. Locations without enough touchless feedback aren’t scored yet rather than getting an unfair number.' },
  { q: 'Where do the numbers come from?', a: 'Real Google customer reviews. We never invent ratings. Every score traces back to what actual customers wrote about the touchless wash.' },
  { q: 'Can a score change over time?', a: 'Yes. As new reviews come in we periodically re-calculate, so a wash that improves (or slips) will see its score move.' },
];

export default function TouchlessSatisfactionScorePage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#22C55E] mb-5">
            <Gauge className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">The Touchless Satisfaction Score</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            A 0–100 score for how happy customers are with the touchless wash specifically — isolated from the rest of the business.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto max-w-3xl text-[15px] leading-relaxed text-gray-700">
          <p className="text-lg text-gray-800 leading-relaxed">
            A Google star rating tells you how people feel about a car wash <em>business</em>. But many car washes offer several
            wash types under one roof. The <strong className="text-[#0F2744]">Touchless Satisfaction Score</strong> answers a
            sharper question: <strong>how good is the touchless wash itself?</strong>
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-3">How the score is built</h2>
          <ul className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.h} className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-[#22C55E] shrink-0 mt-0.5" />
                <span><strong className="text-[#0F2744]">{s.h}</strong> — {s.t}</span>
              </li>
            ))}
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">What the tiers mean</h2>
          <div className="space-y-3">
            {TIERS.map((s) => (
              <div key={s.label} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-100 rounded-xl p-4">
                <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border w-fit shrink-0 ${s.cls}`}>{s.label}</span>
                <span className="text-gray-600">{s.t}</span>
              </div>
            ))}
          </div>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">Our principles</h2>
          <ul className="list-disc pl-5 space-y-2.5 marker:text-[#22C55E]">
            <li><strong className="text-[#0F2744]">Real customer voices.</strong> Every score is built from genuine Google reviews — never invented.</li>
            <li><strong className="text-[#0F2744]">We isolate the touchless wash.</strong> Feedback about other bays is set aside so the score reflects the touchless experience only.</li>
            <li><strong className="text-[#0F2744]">We show the evidence.</strong> Tap any score to read the actual positive reviews and the concerns behind it.</li>
            <li><strong className="text-[#0F2744]">Source &amp; attribution.</strong> Reviews come from Google; we show short excerpts and link back to the originals.</li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-12 mb-4">Frequently asked questions</h2>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="text-base font-semibold text-[#0F2744] mb-1.5">{f.q}</h3>
                <p className="text-gray-600">{f.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl bg-[#0F2744] text-white p-6 text-center">
            <p className="text-lg font-semibold mb-3">Find a highly-rated touchless wash near you</p>
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
