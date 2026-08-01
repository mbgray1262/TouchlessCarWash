import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Droplet, MapPin, CheckCircle, Sparkles, Shield, Users, ChevronRight } from 'lucide-react';
import { DETAILING_LIVE, DETAILING_HERO_IMAGE, publicDetailingCount, detailingStateTally } from '@/lib/detailing';
import { US_STATES, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/car-detailing';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { count } = await publicDetailingCount();
  const n = count ?? 0;
  const countStr = n > 0 ? n.toLocaleString() + '+' : '';
  const year = new Date().getFullYear();
  const title = `Auto Detailing Near Me${countStr ? ` — ${countStr} Detailers` : ''} | ${year}`;
  const description = `Find a professional auto detailer near you${countStr ? ` — ${countStr} verified detailers` : ''}: paint correction, ceramic coating, paint protection film (PPF), and full interior detailing. Scored on real customer reviews — hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: SITE_URL + PATH },
    // While the category is gated, keep the whole section out of the index.
    robots: DETAILING_LIVE ? undefined : { index: false, follow: false },
    openGraph: { title, description, url: SITE_URL + PATH, siteName: 'Touchless Car Wash Finder', type: 'website' },
  };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is auto detailing?',
    a: 'Auto detailing is deep, meticulous cleaning and reconditioning of a vehicle that goes far beyond a regular wash. A full detail typically includes a thorough hand wash, clay-bar treatment, machine polishing or paint correction to remove swirls and scratches, protection (wax, sealant, or a ceramic coating), and a complete interior detail — vacuuming, shampooing, and conditioning of every surface. The goal is to restore the car as close to showroom condition as possible.',
  },
  {
    q: 'What is the difference between detailing and a car wash?',
    a: 'A car wash cleans the surface — it gets the dirt off. Detailing restores and protects: correcting the paint, decontaminating it, sealing it, and deep-cleaning the interior. A wash takes minutes and costs a few dollars; a detail takes hours (sometimes a full day) and is skilled hand labor. Many people wash weekly and detail a few times a year.',
  },
  {
    q: 'What is paint correction and ceramic coating?',
    a: 'Paint correction is the machine-polishing process that removes swirl marks, light scratches, and oxidation to bring back a deep, clear gloss. A ceramic coating is a liquid polymer applied afterward that chemically bonds to the paint, adding a durable, hydrophobic layer that protects the finish and makes it far easier to keep clean — lasting months to years, well beyond a traditional wax.',
  },
  {
    q: 'What is paint protection film (PPF)?',
    a: 'Paint protection film (PPF), sometimes called a "clear bra," is a transparent urethane film applied over the paint to physically shield it from rock chips, road debris, and minor scratches. Unlike a coating, it is a thick physical barrier and many films are self-healing — light marks disappear with heat. Detailers often offer PPF on high-impact areas (bumper, hood, mirrors) or full-vehicle coverage.',
  },
  {
    q: 'How much does auto detailing cost?',
    a: 'Detailing is skilled hand labor, so pricing reflects the work: a basic exterior-and-interior detail commonly runs $75–$200, a full detail with paint correction $200–$600, and ceramic coating or paint protection film packages range from several hundred to a few thousand dollars depending on the vehicle and coverage. Because quality varies widely, we score each detailer from real customer reviews so you can judge who is worth it.',
  },
  {
    q: 'How do I find a good auto detailer near me?',
    a: 'Browse by state below to see verified auto detailers near you, with hours, ratings, and directions. Detailing quality varies enormously — a careless shop can leave swirls or holograms in your paint — so every listing is scored from real customer reviews about the actual detailing work, helping you find the careful, skilled professionals.',
  },
];

export default async function DetailingLanding() {
  const [{ count }, tally] = await Promise.all([publicDetailingCount(), detailingStateTally()]);
  const total = count ?? 0;
  const stateCount = tally.length;
  const byCode = Object.fromEntries(tally.map(t => [t.code, t.count]));
  // All states that have at least one public detailing listing, alphabetical.
  const statesWithDetailing = US_STATES
    .filter(s => byCode[s.code])
    .map(s => ({ ...s, count: byCode[s.code] }));

  return (
    <main className="min-h-screen bg-white">
      {!DETAILING_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — the auto detailing directory is not live yet (hidden from Google &amp; not linked). Flip the switch to launch.
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative">
        <div className="absolute inset-0">
          <Image src={DETAILING_HERO_IMAGE} alt="A detailer machine-polishing a car's paint to a deep gloss at an auto detailing shop" fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F2744]/90 via-[#0F2744]/75 to-[#0F2744]/40" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white/90 text-xs font-medium mb-5">
            <Sparkles className="w-3.5 h-3.5" /> Paint correction · ceramic · PPF · interior
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight max-w-3xl">
            Auto Detailing Near You
          </h1>
          <p className="mt-4 text-lg text-white/90 max-w-2xl">
            Find a professional auto detailer for paint correction, ceramic coating, paint protection
            film, and full interior detailing — the deep, careful work that restores and protects your
            car. {total > 0 && (
              <span>{total.toLocaleString()}+ verified detailers across {stateCount} states.</span>
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#browse-states" className="inline-flex items-center gap-2 rounded-lg bg-[#22C55E] hover:bg-[#1ba34d] text-white font-semibold px-5 py-3 transition-colors">
              <MapPin className="w-4.5 h-4.5" /> Browse by state
            </a>
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-3 transition-colors backdrop-blur">
              Looking for a car wash? →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Sparkles, title: 'Corrected & restored', body: 'Machine polishing removes swirls, scratches, and oxidation to bring back a deep, mirror-clear gloss — not just a surface clean.' },
            { icon: Shield, title: 'Protected to last', body: 'Ceramic coatings and paint protection film seal and shield the finish, keeping your car cleaner and safer from chips and the elements for far longer.' },
            { icon: Users, title: 'Scored on real reviews', body: 'Detailing quality varies enormously — a careless shop can leave swirls or holograms — so we rate each detailer from real customer reviews.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-gray-200 p-6">
              <div className="w-10 h-10 rounded-xl bg-[#22C55E]/10 text-[#22C55E] flex items-center justify-center mb-3"><Icon className="w-5 h-5" /></div>
              <h3 className="font-bold text-[#0F2744] mb-1">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Browse by state ── */}
      <section id="browse-states" className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-2xl font-bold text-[#0F2744] mb-1">Browse auto detailers by state</h2>
          <p className="text-gray-600 mb-6">{total > 0 ? `${total.toLocaleString()} verified auto detailers` : 'Coming soon'} across {stateCount} states.</p>
          {statesWithDetailing.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {statesWithDetailing.map(s => (
                <Link key={s.code} href={`${PATH}/${slugify(s.name)}`} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-[#22C55E] hover:shadow-sm transition-all">
                  <span className="font-medium text-[#0F2744]">{s.name}</span>
                  <span className="inline-flex items-center gap-1 text-sm text-gray-500">{s.count}<ChevronRight className="w-4 h-4" /></span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Listings are being finalized — check back soon.</p>
          )}
        </div>
      </section>

      {/* ── Best-Of cross-link — sends directory browsers to the ranked metro pages ── */}
      <section className="max-w-6xl mx-auto px-4 pt-2 pb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="text-5xl">🏆</div>
          <div className="flex-1">
            <h2 className="text-[#0F2744] font-bold text-2xl mb-2">Which auto detailers are the best?</h2>
            <p className="text-gray-600 leading-relaxed">
              See our metro rankings of the top-rated <strong>auto detailers</strong> — paint correction, ceramic coating, PPF, and interior detailing scored by real customer reviews.
            </p>
          </div>
          <Link href="/best-detailing" className="flex-shrink-0 bg-[#0F2744] hover:bg-[#1a3a5c] text-white font-bold px-7 py-3 rounded-xl transition-colors whitespace-nowrap">
            Best Detailers by metro →
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-6 flex items-center gap-2"><Droplet className="w-5 h-5 text-[#22C55E]" /> Auto detailing FAQ</h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border border-gray-200 rounded-xl overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-[#0F2744] flex items-center justify-between">
                {q}<ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-5 pb-4 text-gray-600 leading-relaxed flex items-start gap-2"><CheckCircle className="w-4 h-4 text-[#22C55E] mt-1 shrink-0" /><span>{a}</span></div>
            </details>
          ))}
        </div>
      </section>

      {/* FAQ structured data */}
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
