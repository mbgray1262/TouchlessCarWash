import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, MapPin, Star, Clock, Shield, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About Us — Touchless Car Wash Finder',
  description:
    'Learn about Touchless Car Wash Finder — the only directory dedicated exclusively to verified touchless (brushless) car washes across all 51 states.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/about',
  },
  openGraph: {
    title: 'About Us — Touchless Car Wash Finder',
    description:
      'The only directory dedicated exclusively to verified touchless car washes. 3,465+ locations across all 51 states.',
    url: 'https://touchlesscarwashfinder.com/about',
    type: 'website',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Touchless Car Wash Finder',
  url: 'https://touchlesscarwashfinder.com',
  description:
    'The only directory dedicated exclusively to verified touchless (brushless) car washes across all 51 states.',
  foundingDate: '2024',
  areaServed: {
    '@type': 'Country',
    name: 'United States',
  },
  knowsAbout: ['touchless car wash', 'brushless car wash', 'laser car wash', 'paint protection', 'ceramic coating care'],
};

const STATS = [
  { label: 'Verified Locations', value: '3,465+', icon: MapPin },
  { label: 'States Covered', value: '51', icon: CheckCircle },
  { label: 'Google Reviews Indexed', value: '100K+', icon: Star },
  { label: 'Hours Listings Updated', value: 'Weekly', icon: Clock },
];

const DIFFERENTIATORS = [
  {
    icon: Shield,
    title: 'Every Listing is Verified Touchless',
    description:
      'We only list car washes confirmed as genuinely touchless — no brush-equipped washes sneak into our directory. If it touches your paint, it does not belong here.',
  },
  {
    icon: MapPin,
    title: 'All 51 States, 3,465+ Locations',
    description:
      'From rural towns to major metros, we have built the most comprehensive touchless-only directory in the country — and we add new locations every week.',
  },
  {
    icon: Star,
    title: 'Real Google Reviews and Ratings',
    description:
      'Every listing shows verified Google ratings and review counts so you can pick the highest-rated touchless wash near you, not just the closest one.',
  },
  {
    icon: Search,
    title: 'Photos, Hours, and Contact Info',
    description:
      'See photos of each location before you go. Get accurate hours, phone numbers, and directions — all in one place, no clicking through to other sites.',
  },
];

const VERIFICATION_STEPS = [
  {
    step: '01',
    title: 'Google Maps Cross-Reference',
    description:
      'We start with Google Maps business data, checking the listed car wash type, equipment descriptions, and business categories.',
  },
  {
    step: '02',
    title: 'Website and Business Review',
    description:
      'We visit the business website and scan for equipment descriptions, marketing language, and service menus that confirm touchless-only operation.',
  },
  {
    step: '03',
    title: 'Customer Review Analysis',
    description:
      'We analyze customer reviews for mentions of brushes, scratches, or touchless confirmation — real customers are often the best source of truth.',
  },
  {
    step: '04',
    title: 'Ongoing Monitoring',
    description:
      'Listings are re-verified regularly. If a location changes equipment or closes, we update or remove it from the directory.',
  },
];

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      <main>
        {/* Hero */}
        <section className="bg-[#0F2744] text-white py-20 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <p className="text-[#22C55E] text-sm font-semibold uppercase tracking-widest mb-4">
              About Us
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
              About Touchless Car Wash Finder
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              The only directory dedicated exclusively to touchless car washes.
            </p>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="bg-[#22C55E] py-10 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {STATS.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <Icon className="w-6 h-6 text-white mb-1" />
                  <span className="text-3xl font-bold text-white">{value}</span>
                  <span className="text-sm font-medium text-green-900">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="py-20 px-4 bg-white">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-[#0F2744] mb-6">Our Mission</h2>
            <div className="prose prose-lg text-gray-700 space-y-5">
              <p>
                Car owners who invest in ceramic coatings, paint protection film (PPF), or simply
                care about preserving their vehicle's finish face a real problem: it is surprisingly
                difficult to know whether a car wash is truly touchless — or whether brushes and
                friction equipment will make contact with their paint.
              </p>
              <p>
                Generic map searches return a mix of touchless and traditional washes with no clear
                distinction. Business websites bury the details. And discovering after the fact that
                a "touchless" wash actually used cloth or brush equipment is frustrating and
                potentially costly.
              </p>
              <p>
                We built Touchless Car Wash Finder so that you never have to wonder. Every listing
                in our directory has been verified as genuinely touchless — no brushes, no friction,
                no risk to your paint, coating, or film. Find your nearest verified location, check
                the reviews, and drive in with confidence.
              </p>
            </div>
          </div>
        </section>

        {/* What Makes Us Different */}
        <section className="py-20 px-4 bg-gray-50">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-[#0F2744] mb-4">What Makes Us Different</h2>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                We are not a general car wash directory. We are a single-purpose resource built
                around one thing: helping you find a wash that will not damage your car.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {DIFFERENTIATORS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-[#0F2744]/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-[#0F2744]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#0F2744] mb-2">{title}</h3>
                      <p className="text-gray-600 leading-relaxed">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How We Verify */}
        <section className="py-20 px-4 bg-white">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-[#0F2744] mb-4">How We Verify</h2>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                Listing a car wash as "touchless" is a serious claim. Here is how we confirm it
                before a location appears in our directory.
              </p>
            </div>
            <div className="relative">
              <div className="absolute left-8 top-0 bottom-0 w-px bg-gray-200 hidden md:block" />
              <div className="space-y-8">
                {VERIFICATION_STEPS.map(({ step, title, description }) => (
                  <div key={step} className="flex gap-6 items-start">
                    <div className="flex-shrink-0 w-16 h-16 rounded-full bg-[#0F2744] text-white flex items-center justify-center font-bold text-lg z-10">
                      {step}
                    </div>
                    <div className="pt-3">
                      <h3 className="text-lg font-semibold text-[#0F2744] mb-1">{title}</h3>
                      <p className="text-gray-600 leading-relaxed">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Add Your Business CTA */}
        <section className="py-20 px-4 bg-[#0F2744]">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Own a Touchless Car Wash?</h2>
            <p className="text-blue-200 text-lg mb-8 leading-relaxed">
              Get listed for free. Reach thousands of car owners actively searching for a verified
              touchless wash in your area.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold px-8 py-3 text-base"
            >
              <Link href="/add-listing">Get Listed for Free</Link>
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
