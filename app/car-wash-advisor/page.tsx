import Link from 'next/link';
import type { Metadata } from 'next';
import { Sparkles, CheckCircle, ChevronRight } from 'lucide-react';
import WashAdvisor from '@/components/WashAdvisor';
import { ADVISOR_LIVE } from '@/lib/advisor';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/car-wash-advisor';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: 'Car Wash Advisor: Which Type of Car Wash Is Right for You?' },
  description:
    'Answer 4 quick questions and get a personalized recommendation — touchless, tunnel, self-serve, or hand wash — based on your priorities, vehicle, and how often you wash. Free car wash type finder.',
  alternates: { canonical: SITE_URL + PATH },
  robots: ADVISOR_LIVE ? undefined : { index: false, follow: false },
  openGraph: {
    title: 'Car Wash Advisor: Which Type of Car Wash Is Right for You?',
    description: 'Answer 4 quick questions and get a personalized car wash recommendation.',
    url: SITE_URL + PATH, siteName: 'Touchless Car Wash Finder', type: 'website',
  },
};

// Server-rendered so the page is genuinely indexable (and ranks) even though the quiz itself is
// interactive — the tool is a linkable asset, not a buried widget.
const TYPES = [
  { name: 'Touchless automatic', when: 'You want a fast, hands-off wash that never touches your paint — best for washing often and for delicate finishes.', href: '/best', cta: 'Best touchless washes' },
  { name: 'Tunnel / express (brush)', when: 'The most common option — fast, cheap, and everywhere, often with unlimited memberships. The trade-off is that the brushes touch your paint and can cause swirl marks over time.', href: '/blog/car-wash-types-compared', cta: 'Tunnel vs. touchless compared' },
  { name: 'Self-serve', when: 'You want the lowest cost and full control, and you don’t mind doing the work yourself in an open wand bay.', href: '/self-serve-car-wash', cta: 'Self-serve directory' },
  { name: 'Hand wash', when: 'You want the most thorough clean, done for you by hand — attendants wash, hand-dry, and often clean the interior.', href: '/hand-car-wash', cta: 'Hand car wash directory' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'How does the car wash advisor work?', a: 'You answer four quick questions — what matters most to you, who should do the washing, what you drive, and how often you wash. Based on your answers, the tool recommends the car wash type that best fits: touchless automatic, tunnel/express, self-serve, or hand wash. It then points you to verified locations of that type near you.' },
  { q: 'Which type of car wash is safest for my paint?', a: 'A touchless automatic wash is the safest automated option because no brushes or cloth ever touch your paint. A careful hand wash is the most thorough, but its safety depends on the crew’s technique. Traditional brush/tunnel washes carry the most risk of swirl marks from physical contact.' },
  { q: 'What is the cheapest type of car wash?', a: 'Self-serve is the cheapest — typically $3–$12, and you only pay for the time and settings you use. Touchless automatic washes usually run $8–$18, and hand washes $15–$45 because you’re paying for labor.' },
  { q: 'Is a hand wash better than an automatic wash?', a: 'A good hand wash is the most thorough option because people reach spots a machine skips and adjust to how dirty your car is. The trade-off is cost and that quality depends on the crew — which is why we score every location from real customer reviews.' },
];

export default function CarWashAdvisorPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {!ADVISOR_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — the car wash advisor is not live yet (hidden from Google &amp; not linked). Flip the switch to launch.
        </div>
      )}

      {/* Hero */}
      <section className="bg-[#0F2744] text-white">
        <div className="max-w-3xl mx-auto px-4 py-14 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white/90 text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Free · 4 questions · ~20 seconds
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Which type of car wash is right for you?</h1>
          <p className="mt-3 text-blue-100 text-lg">
            Touchless, tunnel, self-serve, or hand wash? Answer four quick questions and get a personalized recommendation — plus verified locations near you.
          </p>
        </div>
      </section>

      {/* The tool */}
      <section className="max-w-2xl mx-auto px-4 -mt-8 relative z-10">
        <WashAdvisor />
      </section>

      {/* Server-rendered explainer (SEO) */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-2">The four main car wash types</h2>
        <p className="text-gray-600 mb-6">
          Not ready to take the quiz? Here’s the short version of who each wash type is for. For the full breakdown, read our{' '}
          <Link href="/blog/car-wash-types-compared" className="text-[#22C55E] hover:underline font-medium">complete guide to car wash types</Link>.
        </p>
        <div className="space-y-4">
          {TYPES.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-bold text-[#0F2744] text-lg">{t.name}</h3>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t.when}</p>
              <Link href={t.href} className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-[#22C55E] hover:underline">
                {t.cta} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Car wash advisor FAQ</h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group bg-white border border-gray-200 rounded-xl overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-[#0F2744] flex items-center justify-between">
                {q}<ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-5 pb-4 text-gray-600 leading-relaxed flex items-start gap-2"><CheckCircle className="w-4 h-4 text-[#22C55E] mt-1 shrink-0" /><span>{a}</span></div>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
          }),
        }}
      />
    </main>
  );
}
