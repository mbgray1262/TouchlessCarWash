import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Droplet, MapPin, CheckCircle, Hand, Clock, DollarSign, ChevronRight } from 'lucide-react';
import { SELF_SERVE_LIVE, SELF_SERVE_HERO_IMAGE, publicSelfServeCount, selfServeStateTally } from '@/lib/self-serve';
import { US_STATES, getStateName, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/self-serve-car-wash';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { count } = await publicSelfServeCount();
  const n = count ?? 0;
  const countStr = n > 0 ? n.toLocaleString() + '+' : '';
  const year = new Date().getFullYear();
  const title = `Self-Service Car Wash Near Me${countStr ? ` — ${countStr} Locations` : ''} | ${year}`;
  const description = `Find a self-service car wash near you${countStr ? ` — ${countStr} verified coin-op / wand-bay locations` : ''}. Wash your car yourself in an open bay: gentle on your paint because you control the wand. Hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: SITE_URL + PATH },
    // While the category is gated, keep the whole section out of the index.
    robots: SELF_SERVE_LIVE ? undefined : { index: false, follow: false },
    openGraph: { title, description, url: SITE_URL + PATH, siteName: 'Touchless Car Wash Finder', type: 'website' },
  };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is a self-service car wash?',
    a: 'A self-service car wash is an open, coin- or card-operated bay where you wash your own vehicle with a handheld high-pressure wand. You control every step — pre-soak, soap, foam brush (optional), rinse, and spot-free — so you decide exactly how much (or how little) touches your paint. Most are open 24 hours and also offer self-serve vacuums.',
  },
  {
    q: 'Is a self-service car wash gentle on your paint?',
    a: 'It can be the gentlest option available, because you are in control. With the wand alone you can do a fully touch-free wash — high-pressure water and foam only, no brushes on the paint at all. If you choose to use the foam brush, you control the pressure and can rinse it often. That level of control is why paint-conscious owners like self-serve bays.',
  },
  {
    q: 'How much does a self-service car wash cost?',
    a: 'Self-service washes are usually the most affordable option — typically $2–$5 for a few minutes of wand time, with more time added by coins, bills, or card. Vacuums are often $1–$2. You only pay for what you use, which makes a quick self-serve rinse one of the cheapest ways to keep your car clean.',
  },
  {
    q: 'Self-service vs. touchless vs. tunnel — what is the difference?',
    a: 'In a self-service bay YOU wash the car with a wand. A touchless (in-bay automatic) wash cleans your car by machine with high-pressure water and chemistry — no brushes, no effort from you. A tunnel wash pulls your car through on a conveyor using spinning brushes or cloth. Self-service and touchless are both brush-free on the paint if you want them to be; tunnels are not.',
  },
  {
    q: 'How do I find a self-service car wash near me?',
    a: 'Browse by state below to see verified self-service car washes near you, with hours, ratings, and directions. Every location in this directory is a real self-serve wand-bay facility — we filter out tunnels, hand washes, and detail shops so you only see genuine self-service bays.',
  },
];

export default async function SelfServeLanding() {
  const [{ count }, tally] = await Promise.all([publicSelfServeCount(), selfServeStateTally()]);
  const total = count ?? 0;
  const stateCount = tally.length;
  const byCode = Object.fromEntries(tally.map(t => [t.code, t.count]));
  // All states that have at least one public self-serve listing, alphabetical.
  const statesWithSelfServe = US_STATES
    .filter(s => byCode[s.code])
    .map(s => ({ ...s, count: byCode[s.code] }));

  return (
    <main className="min-h-screen bg-white">
      {!SELF_SERVE_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — the self-service directory is not live yet (hidden from Google &amp; not linked). Flip the switch to launch.
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative">
        <div className="absolute inset-0">
          <Image src={SELF_SERVE_HERO_IMAGE} alt="Self-service car wash bay with a high-pressure wand" fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F2744]/90 via-[#0F2744]/75 to-[#0F2744]/40" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white/90 text-xs font-medium mb-5">
            <Hand className="w-3.5 h-3.5" /> Wash it yourself — you control every spray
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight max-w-3xl">
            Self-Service Car Wash Near You
          </h1>
          <p className="mt-4 text-lg text-white/90 max-w-2xl">
            Find an open wand bay where you wash your own car, your way — the gentlest, most affordable
            option, because <strong>you</strong> control the wand. {total > 0 && (
              <span>{total.toLocaleString()}+ verified locations across {stateCount} states.</span>
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#browse-states" className="inline-flex items-center gap-2 rounded-lg bg-[#22C55E] hover:bg-[#1ba34d] text-white font-semibold px-5 py-3 transition-colors">
              <MapPin className="w-4.5 h-4.5" /> Browse by state
            </a>
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold px-5 py-3 transition-colors backdrop-blur">
              Looking for a touchless wash? →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Hand, title: 'You control the contact', body: 'Wand-only for a fully touch-free wash, or use the foam brush at your own pressure. No automated brushes on your paint.' },
            { icon: DollarSign, title: 'The most affordable wash', body: 'Typically a few dollars of wand time — you only pay for what you use. Ideal for a quick rinse between full washes.' },
            { icon: Clock, title: 'Open when you are', body: 'Most self-serve bays run 24/7 and include self-serve vacuums, so you can clean inside and out on your schedule.' },
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
          <h2 className="text-2xl font-bold text-[#0F2744] mb-1">Browse self-service car washes by state</h2>
          <p className="text-gray-600 mb-6">{total > 0 ? `${total.toLocaleString()} verified self-service locations` : 'Coming soon'} across {stateCount} states.</p>
          {statesWithSelfServe.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {statesWithSelfServe.map(s => (
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

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-6 flex items-center gap-2"><Droplet className="w-5 h-5 text-[#22C55E]" /> Self-service car wash FAQ</h2>
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
