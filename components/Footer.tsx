'use client';

import Link from 'next/link';
import { Droplet } from 'lucide-react';

// Top 30 cities by touchless car wash listing count (data-driven, updated periodically)
const TOP_CITIES: { name: string; stateSlug: string; citySlug: string; stateCode: string }[] = [
  { name: 'Phoenix', stateSlug: 'arizona', citySlug: 'phoenix', stateCode: 'AZ' },
  { name: 'Mesa', stateSlug: 'arizona', citySlug: 'mesa', stateCode: 'AZ' },
  { name: 'Louisville', stateSlug: 'kentucky', citySlug: 'louisville', stateCode: 'KY' },
  { name: 'Tulsa', stateSlug: 'oklahoma', citySlug: 'tulsa', stateCode: 'OK' },
  { name: 'Orlando', stateSlug: 'florida', citySlug: 'orlando', stateCode: 'FL' },
  { name: 'Columbus', stateSlug: 'ohio', citySlug: 'columbus', stateCode: 'OH' },
  { name: 'Omaha', stateSlug: 'nebraska', citySlug: 'omaha', stateCode: 'NE' },
  { name: 'Chicago', stateSlug: 'illinois', citySlug: 'chicago', stateCode: 'IL' },
  { name: 'San Diego', stateSlug: 'california', citySlug: 'san-diego', stateCode: 'CA' },
  { name: 'Houston', stateSlug: 'texas', citySlug: 'houston', stateCode: 'TX' },
  { name: 'Akron', stateSlug: 'ohio', citySlug: 'akron', stateCode: 'OH' },
  { name: 'Canton', stateSlug: 'ohio', citySlug: 'canton', stateCode: 'OH' },
  { name: 'Dayton', stateSlug: 'ohio', citySlug: 'dayton', stateCode: 'OH' },
  { name: 'Syracuse', stateSlug: 'new-york', citySlug: 'syracuse', stateCode: 'NY' },
  { name: 'Evansville', stateSlug: 'indiana', citySlug: 'evansville', stateCode: 'IN' },
  { name: 'Denver', stateSlug: 'colorado', citySlug: 'denver', stateCode: 'CO' },
  { name: 'Tucson', stateSlug: 'arizona', citySlug: 'tucson', stateCode: 'AZ' },
  { name: 'Pittsburgh', stateSlug: 'pennsylvania', citySlug: 'pittsburgh', stateCode: 'PA' },
  { name: 'Wichita', stateSlug: 'kansas', citySlug: 'wichita', stateCode: 'KS' },
  { name: 'Reno', stateSlug: 'nevada', citySlug: 'reno', stateCode: 'NV' },
  { name: 'Spokane', stateSlug: 'washington', citySlug: 'spokane', stateCode: 'WA' },
  { name: 'Tacoma', stateSlug: 'washington', citySlug: 'tacoma', stateCode: 'WA' },
  { name: 'Boulder', stateSlug: 'colorado', citySlug: 'boulder', stateCode: 'CO' },
  { name: 'Huntsville', stateSlug: 'alabama', citySlug: 'huntsville', stateCode: 'AL' },
  { name: 'Virginia Beach', stateSlug: 'virginia', citySlug: 'virginia-beach', stateCode: 'VA' },
  { name: 'Greenville', stateSlug: 'south-carolina', citySlug: 'greenville', stateCode: 'SC' },
  { name: 'Aurora', stateSlug: 'colorado', citySlug: 'aurora', stateCode: 'CO' },
  { name: 'Buffalo', stateSlug: 'new-york', citySlug: 'buffalo', stateCode: 'NY' },
  { name: 'Rochester', stateSlug: 'new-york', citySlug: 'rochester', stateCode: 'NY' },
  { name: 'Muncie', stateSlug: 'indiana', citySlug: 'muncie', stateCode: 'IN' },
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
                <Link href="/features" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
                  About Us
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

          {/* Top Cities */}
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
            <Link href="mailto:hello@touchlesscarwashfinder.com" className="text-white/70 hover:text-[#22C55E] transition-colors py-1.5 inline-block">
              Contact
            </Link>
          </div>
        </div>

        <div className="text-center text-sm text-white/50 mt-4">
          <p>&copy; {currentYear} Touchless Car Wash Finder. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
