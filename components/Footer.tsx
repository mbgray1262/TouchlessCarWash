'use client';

import Link from 'next/link';
import { Droplet } from 'lucide-react';

// Top 30 cities by approved touchless car wash listing count.
// Data-driven — last refreshed 2026-06-02 from the live listings table
// (scripts/top-cities-for-footer.mjs). Re-run that script and paste the
// output here whenever the directory grows substantially.
const TOP_CITIES: { name: string; stateSlug: string; citySlug: string; stateCode: string }[] = [
  { name: 'Las Vegas', stateSlug: 'nevada', citySlug: 'las-vegas', stateCode: 'NV' },
  { name: 'Sioux Falls', stateSlug: 'south-dakota', citySlug: 'sioux-falls', stateCode: 'SD' },
  { name: 'Louisville', stateSlug: 'kentucky', citySlug: 'louisville', stateCode: 'KY' },
  { name: 'Pittsburgh', stateSlug: 'pennsylvania', citySlug: 'pittsburgh', stateCode: 'PA' },
  { name: 'Austin', stateSlug: 'texas', citySlug: 'austin', stateCode: 'TX' },
  { name: 'Columbus', stateSlug: 'ohio', citySlug: 'columbus', stateCode: 'OH' },
  { name: 'Rochester', stateSlug: 'minnesota', citySlug: 'rochester', stateCode: 'MN' },
  { name: 'Miami', stateSlug: 'florida', citySlug: 'miami', stateCode: 'FL' },
  { name: 'Rochester', stateSlug: 'new-york', citySlug: 'rochester', stateCode: 'NY' },
  { name: 'San Antonio', stateSlug: 'texas', citySlug: 'san-antonio', stateCode: 'TX' },
  { name: 'San Diego', stateSlug: 'california', citySlug: 'san-diego', stateCode: 'CA' },
  { name: 'Akron', stateSlug: 'ohio', citySlug: 'akron', stateCode: 'OH' },
  { name: 'Wichita', stateSlug: 'kansas', citySlug: 'wichita', stateCode: 'KS' },
  { name: 'Reno', stateSlug: 'nevada', citySlug: 'reno', stateCode: 'NV' },
  { name: 'Anchorage', stateSlug: 'alaska', citySlug: 'anchorage', stateCode: 'AK' },
  { name: 'Minneapolis', stateSlug: 'minnesota', citySlug: 'minneapolis', stateCode: 'MN' },
  { name: 'Des Moines', stateSlug: 'iowa', citySlug: 'des-moines', stateCode: 'IA' },
  { name: 'Thornton', stateSlug: 'colorado', citySlug: 'thornton', stateCode: 'CO' },
  { name: 'Spokane', stateSlug: 'washington', citySlug: 'spokane', stateCode: 'WA' },
  { name: 'Sacramento', stateSlug: 'california', citySlug: 'sacramento', stateCode: 'CA' },
  { name: 'Omaha', stateSlug: 'nebraska', citySlug: 'omaha', stateCode: 'NE' },
  { name: 'Eau Claire', stateSlug: 'wisconsin', citySlug: 'eau-claire', stateCode: 'WI' },
  { name: 'Greensboro', stateSlug: 'north-carolina', citySlug: 'greensboro', stateCode: 'NC' },
  { name: 'Madison', stateSlug: 'wisconsin', citySlug: 'madison', stateCode: 'WI' },
  { name: 'Los Angeles', stateSlug: 'california', citySlug: 'los-angeles', stateCode: 'CA' },
  { name: 'Lincoln', stateSlug: 'nebraska', citySlug: 'lincoln', stateCode: 'NE' },
  { name: 'North Las Vegas', stateSlug: 'nevada', citySlug: 'north-las-vegas', stateCode: 'NV' },
  { name: 'Aurora', stateSlug: 'colorado', citySlug: 'aurora', stateCode: 'CO' },
  { name: 'Erie', stateSlug: 'pennsylvania', citySlug: 'erie', stateCode: 'PA' },
  { name: 'El Paso', stateSlug: 'texas', citySlug: 'el-paso', stateCode: 'TX' },
];

// Densest self-serve cities (>=6 live self-serve washes, so comfortably above the 5-listing hub
// threshold and stable). Links to the self-serve city hubs. Refresh occasionally as the directory
// grows (same idea as TOP_CITIES). Every URL here must be a qualifying hub — verify:seo guards it.
const SELF_SERVE_CITIES: { name: string; stateSlug: string; citySlug: string; stateCode: string }[] = [
  { name: 'San Diego', stateSlug: 'california', citySlug: 'san-diego', stateCode: 'CA' },
  { name: 'Denver', stateSlug: 'colorado', citySlug: 'denver', stateCode: 'CO' },
  { name: 'Tucson', stateSlug: 'arizona', citySlug: 'tucson', stateCode: 'AZ' },
  { name: 'Phoenix', stateSlug: 'arizona', citySlug: 'phoenix', stateCode: 'AZ' },
  { name: 'San Antonio', stateSlug: 'texas', citySlug: 'san-antonio', stateCode: 'TX' },
  { name: 'Mesa', stateSlug: 'arizona', citySlug: 'mesa', stateCode: 'AZ' },
  { name: 'Colorado Springs', stateSlug: 'colorado', citySlug: 'colorado-springs', stateCode: 'CO' },
  { name: 'Tampa', stateSlug: 'florida', citySlug: 'tampa', stateCode: 'FL' },
  { name: 'Oakland', stateSlug: 'california', citySlug: 'oakland', stateCode: 'CA' },
  { name: 'Los Angeles', stateSlug: 'california', citySlug: 'los-angeles', stateCode: 'CA' },
  { name: 'Louisville', stateSlug: 'kentucky', citySlug: 'louisville', stateCode: 'KY' },
  { name: 'Grand Junction', stateSlug: 'colorado', citySlug: 'grand-junction', stateCode: 'CO' },
  { name: 'Oklahoma City', stateSlug: 'oklahoma', citySlug: 'oklahoma-city', stateCode: 'OK' },
  { name: 'Lakewood', stateSlug: 'colorado', citySlug: 'lakewood', stateCode: 'CO' },
];

// All 50 states + DC
const ALL_STATES: { name: string; slug: string }[] = [
  { name: 'Alabama', slug: 'alabama' },
  { name: 'Alaska', slug: 'alaska' },
  { name: 'Arizona', slug: 'arizona' },
  { name: 'Arkansas', slug: 'arkansas' },
  { name: 'California', slug: 'california' },
  { name: 'Colorado', slug: 'colorado' },
  { name: 'Connecticut', slug: 'connecticut' },
  { name: 'Delaware', slug: 'delaware' },
  { name: 'DC', slug: 'district-of-columbia' },
  { name: 'Florida', slug: 'florida' },
  { name: 'Georgia', slug: 'georgia' },
  { name: 'Hawaii', slug: 'hawaii' },
  { name: 'Idaho', slug: 'idaho' },
  { name: 'Illinois', slug: 'illinois' },
  { name: 'Indiana', slug: 'indiana' },
  { name: 'Iowa', slug: 'iowa' },
  { name: 'Kansas', slug: 'kansas' },
  { name: 'Kentucky', slug: 'kentucky' },
  { name: 'Louisiana', slug: 'louisiana' },
  { name: 'Maine', slug: 'maine' },
  { name: 'Maryland', slug: 'maryland' },
  { name: 'Massachusetts', slug: 'massachusetts' },
  { name: 'Michigan', slug: 'michigan' },
  { name: 'Minnesota', slug: 'minnesota' },
  { name: 'Mississippi', slug: 'mississippi' },
  { name: 'Missouri', slug: 'missouri' },
  { name: 'Montana', slug: 'montana' },
  { name: 'Nebraska', slug: 'nebraska' },
  { name: 'Nevada', slug: 'nevada' },
  { name: 'New Hampshire', slug: 'new-hampshire' },
  { name: 'New Jersey', slug: 'new-jersey' },
  { name: 'New Mexico', slug: 'new-mexico' },
  { name: 'New York', slug: 'new-york' },
  { name: 'North Carolina', slug: 'north-carolina' },
  { name: 'North Dakota', slug: 'north-dakota' },
  { name: 'Ohio', slug: 'ohio' },
  { name: 'Oklahoma', slug: 'oklahoma' },
  { name: 'Oregon', slug: 'oregon' },
  { name: 'Pennsylvania', slug: 'pennsylvania' },
  { name: 'Rhode Island', slug: 'rhode-island' },
  { name: 'South Carolina', slug: 'south-carolina' },
  { name: 'South Dakota', slug: 'south-dakota' },
  { name: 'Tennessee', slug: 'tennessee' },
  { name: 'Texas', slug: 'texas' },
  { name: 'Utah', slug: 'utah' },
  { name: 'Vermont', slug: 'vermont' },
  { name: 'Virginia', slug: 'virginia' },
  { name: 'Washington', slug: 'washington' },
  { name: 'West Virginia', slug: 'west-virginia' },
  { name: 'Wisconsin', slug: 'wisconsin' },
  { name: 'Wyoming', slug: 'wyoming' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0F2744] mt-auto">
      <div className="container mx-auto px-4 py-12">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About + Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-0 text-sm">
              <li>
                <Link href="/" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/search" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Find a Wash
                </Link>
              </li>
              <li>
                <Link href="/best" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Best Of
                </Link>
              </li>
              <li>
                <Link href="/chains" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Chains
                </Link>
              </li>
              <li>
                <Link href="/self-serve-car-wash" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Self-Service Car Washes
                </Link>
              </li>
              <li>
                <Link href="/24-hour-touchless-car-wash" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  24-Hour Car Washes
                </Link>
              </li>
              <li>
                <Link href="/unlimited-touchless-car-wash" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Unlimited Plans
                </Link>
              </li>
              <li>
                <Link href="/shop" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Shop Touchless Gear
                </Link>
              </li>
              <li>
                <Link href="/features" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/videos" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Videos
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/dataset" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Dataset
                </Link>
              </li>
              <li>
                <Link href="/blog/touchless-car-wash-satisfaction-by-state" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  State Rankings
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/add-listing" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Add Your Business
                </Link>
              </li>
            </ul>
          </div>

          {/* Browse by State — all 50 + DC */}
          <div>
            <h3 className="font-semibold text-white mb-4">Browse by State</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0 text-xs">
              {ALL_STATES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/state/${s.slug}`}
                  className="text-white/60 hover:text-[#22C55E] transition-colors truncate py-1.5 inline-block"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Top Cities — touchless, then a self-serve city block */}
          <div>
            <h3 className="font-semibold text-white mb-4">Top Cities</h3>
            <div className="grid grid-cols-1 gap-y-0 text-xs max-h-[400px] overflow-y-auto">
              {TOP_CITIES.map((c) => (
                <Link
                  key={`${c.stateSlug}-${c.citySlug}`}
                  href={`/state/${c.stateSlug}/${c.citySlug}`}
                  className="text-white/60 hover:text-[#22C55E] transition-colors truncate py-1.5 inline-block"
                >
                  {c.name}, {c.stateCode}
                </Link>
              ))}
              <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wide mt-4 mb-1 pt-3 border-t border-white/10">
                Self-Serve Cities
              </p>
              {SELF_SERVE_CITIES.map((c) => (
                <Link
                  key={`ss-${c.stateSlug}-${c.citySlug}`}
                  href={`/self-serve-car-wash/${c.stateSlug}/${c.citySlug}`}
                  className="text-white/60 hover:text-[#22C55E] transition-colors truncate py-1.5 inline-block"
                >
                  {c.name}, {c.stateCode}
                </Link>
              ))}
            </div>
          </div>

          {/* About */}
          <div>
            <h3 className="font-semibold text-white mb-4">About</h3>
            <p className="text-sm text-white/70">
              The only directory dedicated exclusively to touchless, touch-free, and brushless car washes across all 50 states. No brushes, no scratches — just clean.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/20 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Droplet className="w-6 h-6 text-[#22C55E]" />
            <span className="font-bold text-white">
              Touchless Car Wash Finder
            </span>
          </Link>

          <div className="flex gap-6 text-sm">
            <Link href="/privacy-policy" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
              Terms of Service
            </Link>
            <Link href="/contact" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
              Contact
            </Link>
          </div>
        </div>

        <div className="text-center text-sm text-white/50 mt-4 space-y-2">
          <p>&copy; {currentYear} Touchless Car Wash Finder. All rights reserved.</p>
          <p className="text-xs text-white/35 max-w-2xl mx-auto">
            Touchless Car Wash Finder is an independent directory. We do not own or operate any car washes listed on this site.
            For service issues, refunds, or complaints, please contact the car wash directly.
          </p>
        </div>
      </div>
    </footer>
  );
}
