import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Droplet, MapPin, CheckCircle, Hand, Sparkles, Users, ChevronRight } from 'lucide-react';
import { HAND_WASH_LIVE, HAND_WASH_HERO_IMAGE, publicHandWashCount, handWashStateTally } from '@/lib/hand-wash';
import { US_STATES, slugify } from '@/lib/constants';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const PATH = '/hand-car-wash';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { count } = await publicHandWashCount();
  const n = count ?? 0;
  const countStr = n > 0 ? n.toLocaleString() + '+' : '';
  const year = new Date().getFullYear();
  const title = `Hand Car Wash Near Me${countStr ? ` — ${countStr} Locations` : ''} | ${year}`;
  const description = `Find a professional hand car wash near you${countStr ? ` — ${countStr} verified locations` : ''} where attendants wash your car by hand. Full-service hand washing and detailing — thorough, careful, inside and out. Hours, ratings, and directions.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: SITE_URL + PATH },
    // While the category is gated, keep the whole section out of the index.
    robots: HAND_WASH_LIVE ? undefined : { index: false, follow: false },
    openGraph: { title, description, url: SITE_URL + PATH, siteName: 'Touchless Car Wash Finder', type: 'website' },
  };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is a hand car wash?',
    a: 'A hand car wash is a full-service wash where trained attendants clean your vehicle by hand — with wash mitts, sponges, foam, and drying towels — instead of sending it through an automatic machine or tunnel. You wait or drop the car off, and the crew washes the exterior, often dries it by hand, and typically cleans the interior too. Many hand washes also offer detailing, waxing, and interior packages.',
  },
  {
    q: 'Is a hand car wash better than an automatic or tunnel wash?',
    a: 'A good hand wash is the most thorough and personal option. Because people are doing the work, they can reach spots a machine misses — wheels, door jambs, badges, tight trim — and adjust to how dirty your car is. The trade-off is that quality depends on the crew and their technique, which is exactly why we score each location from real customer reviews so you can find the careful ones.',
  },
  {
    q: 'Do hand car washes clean the interior too?',
    a: 'Most full-service hand washes do. A typical visit includes an exterior hand wash plus interior vacuuming and a wipe-down of the dash, console, and cup holders, and many locations offer fuller interior detailing, shampoo, and protectant packages as add-ons. Check each listing for the specific services and amenities offered.',
  },
  {
    q: 'How much does a hand car wash cost?',
    a: 'Because a hand wash is labor — real people cleaning your car — it usually costs more than an automatic wash, typically around $15–$40 for a standard exterior-and-interior hand wash, with detailing packages (wax, clay bar, ceramic, full interior) priced higher. You are paying for thoroughness and human attention rather than a 3-minute machine pass.',
  },
  {
    q: 'Hand wash vs. self-service vs. touchless — what is the difference?',
    a: 'At a hand car wash, trained attendants wash your car by hand for you. At a self-service bay, YOU wash your own car with a coin-operated wand. A touchless (in-bay automatic) wash cleans the car by machine with high-pressure water and chemistry, with no one touching the paint. Each has its place — hand washing is the most hands-on and detail-oriented; the others are faster or cheaper.',
  },
  {
    q: 'How do I find a hand car wash near me?',
    a: 'Browse by state below to see verified hand car washes near you, with hours, ratings, and directions. Every location in this directory is a real attended hand-wash or hand-detailing business — we filter out self-service wand bays and automatic tunnels so you only see genuine hand washes.',
  },
];

export default async function HandWashLanding() {
  const [{ count }, tally] = await Promise.all([publicHandWashCount(), handWashStateTally()]);
  const total = count ?? 0;
  const stateCount = tally.length;
  const byCode = Object.fromEntries(tally.map(t => [t.code, t.count]));
  // All states that have at least one public hand-wash listing, alphabetical.
  const statesWithHandWash = US_STATES
    .filter(s => byCode[s.code])
    .map(s => ({ ...s, count: byCode[s.code] }));

  return (
    <main className="min-h-screen bg-white">
      {!HAND_WASH_LIVE && (
        <div className="bg-amber-500 text-white text-center text-sm font-semibold py-2 px-4">
          PREVIEW — the hand car wash directory is not live yet (hidden from Google &amp; not linked). Flip the switch to launch.
        </div>
      )}

      {/* ── Hero ── */}
      <section className="relative">
        <div className="absolute inset-0">
          <Image src={HAND_WASH_HERO_IMAGE} alt="Attendants washing a car by hand at a full-service hand car wash" fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F2744]/90 via-[#0F2744]/75 to-[#0F2744]/40" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white/90 text-xs font-medium mb-5">
            <Hand className="w-3.5 h-3.5" /> Washed by hand, panel by panel
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight max-w-3xl">
            Hand Car Wash Near You
          </h1>
          <p className="mt-4 text-lg text-white/90 max-w-2xl">
            Find a professional hand car wash where attendants clean your vehicle by hand — thorough,
            careful, inside and out. The most hands-on, detail-oriented way to wash a car. {total > 0 && (
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
            { icon: Hand, title: 'Cleaned by hand, with care', body: 'Real people wash and hand-dry your car, reaching wheels, jambs, and trim a machine skips — and adjusting to how dirty it actually is.' },
            { icon: Sparkles, title: 'Thorough, inside and out', body: 'Most locations vacuum and wipe down the interior too, with waxing and full detailing packages available for a deeper clean.' },
            { icon: Users, title: 'Scored on real reviews', body: 'A hand wash is only as good as its crew — so we rate each location from real customer reviews to help you find the careful ones.' },
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
          <h2 className="text-2xl font-bold text-[#0F2744] mb-1">Browse hand car washes by state</h2>
          <p className="text-gray-600 mb-6">{total > 0 ? `${total.toLocaleString()} verified hand car wash locations` : 'Coming soon'} across {stateCount} states.</p>
          {statesWithHandWash.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {statesWithHandWash.map(s => (
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
            <h2 className="text-[#0F2744] font-bold text-2xl mb-2">Which hand car washes are the best?</h2>
            <p className="text-gray-600 leading-relaxed">
              See our metro rankings of the top-rated <strong>hand car washes</strong> — full-service hand washing and detailing scored by real customer reviews.
            </p>
          </div>
          <Link href="/best-hand-wash" className="flex-shrink-0 bg-[#0F2744] hover:bg-[#1a3a5c] text-white font-bold px-7 py-3 rounded-xl transition-colors whitespace-nowrap">
            Best Hand Wash by metro →
          </Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-[#0F2744] mb-6 flex items-center gap-2"><Droplet className="w-5 h-5 text-[#22C55E]" /> Hand car wash FAQ</h2>
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
