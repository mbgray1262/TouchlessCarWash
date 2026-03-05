'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Metro name lookup — lightweight slug→name map for the client bundle.
 */
const METRO_NAMES: Record<string, string> = {
  'new-york-city': 'New York City',
  'los-angeles': 'Los Angeles',
  'chicago': 'Chicago',
  'houston': 'Houston',
  'phoenix': 'Phoenix',
  'philadelphia': 'Philadelphia',
  'san-antonio': 'San Antonio',
  'san-diego': 'San Diego',
  'dallas-fort-worth': 'Dallas\u2013Fort Worth',
  'miami': 'Miami',
  'atlanta': 'Atlanta',
  'boston': 'Boston',
  'seattle': 'Seattle',
  'denver': 'Denver',
  'washington-dc': 'Washington DC',
  'nashville': 'Nashville',
  'detroit': 'Detroit',
  'portland': 'Portland',
  'las-vegas': 'Las Vegas',
  'austin': 'Austin',
  'memphis': 'Memphis',
  'milwaukee': 'Milwaukee',
  'jacksonville': 'Jacksonville',
  'columbus': 'Columbus',
  'charlotte': 'Charlotte',
  'indianapolis': 'Indianapolis',
  'san-francisco-bay-area': 'San Francisco Bay Area',
  'fort-worth': 'Fort Worth',
  'louisville': 'Louisville',
  'baltimore': 'Baltimore',
  'oklahoma-city': 'Oklahoma City',
  'raleigh-durham': 'Raleigh-Durham',
  'salt-lake-city': 'Salt Lake City',
  'kansas-city': 'Kansas City',
  'minneapolis-st-paul': 'Minneapolis\u2013St. Paul',
  'tampa': 'Tampa',
  'orlando': 'Orlando',
  'cincinnati': 'Cincinnati',
  'cleveland': 'Cleveland',
  'pittsburgh': 'Pittsburgh',
  'st-louis': 'St. Louis',
  'sacramento': 'Sacramento',
  'san-jose': 'San Jose',
  'riverside-san-bernardino': 'Riverside\u2013San Bernardino',
  'new-orleans': 'New Orleans',
  'richmond': 'Richmond',
  'buffalo': 'Buffalo',
  'hartford': 'Hartford',
  'reno': 'Reno',
  'tucson': 'Tucson',
  'el-paso': 'El Paso',
  'birmingham': 'Birmingham',
  'rochester': 'Rochester',
  'grand-rapids': 'Grand Rapids',
  'albany': 'Albany',
  'knoxville': 'Knoxville',
  'tulsa': 'Tulsa',
  'dayton': 'Dayton',
  'albuquerque': 'Albuquerque',
  'omaha': 'Omaha',
  'boise': 'Boise',
  'colorado-springs': 'Colorado Springs',
  'spokane': 'Spokane',
  'tacoma': 'Tacoma',
  'des-moines': 'Des Moines',
  'charleston': 'Charleston',
  'greenville': 'Greenville',
  'akron': 'Akron',
  'toledo': 'Toledo',
  'madison': 'Madison',
  'worcester': 'Worcester',
  'providence': 'Providence',
  'columbia': 'Columbia',
  'little-rock': 'Little Rock',
  'wichita': 'Wichita',
  'fort-wayne': 'Fort Wayne',
  'sarasota': 'Sarasota',
  'fort-myers': 'Fort Myers',
  'harrisburg': 'Harrisburg',
  'syracuse': 'Syracuse',
  'lexington': 'Lexington',
  'greensboro': 'Greensboro',
  'virginia-beach': 'Virginia Beach',
  'baton-rouge': 'Baton Rouge',
  'ann-arbor': 'Ann Arbor',
};

interface ListingBreadcrumbProps {
  /** Listing name shown as the last breadcrumb item */
  listingName: string;
  /** State slug for the default breadcrumb */
  stateSlug: string;
  /** Display name of the state */
  stateName: string;
  /** City slug for the default breadcrumb */
  citySlug: string;
  /** Display name of the city */
  cityName: string;
  /** 'hero' for white text on dark bg, 'standard' for normal */
  variant?: 'hero' | 'standard';
}

function BreadcrumbInner({
  listingName,
  stateSlug,
  stateName,
  citySlug,
  cityName,
  variant = 'hero',
}: ListingBreadcrumbProps) {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');

  const isHero = variant === 'hero';
  const linkClass = isHero ? 'hover:text-white transition-colors' : 'hover:text-[#22C55E] transition-colors';
  const activeClass = isHero ? 'text-white/80 truncate' : 'text-gray-900 font-medium truncate';

  // If arriving from a best-of page, show Best Of breadcrumb
  if (fromParam && fromParam.startsWith('best-')) {
    const metroSlug = fromParam.replace('best-', '');
    const metroName =
      METRO_NAMES[metroSlug] ||
      metroSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    return (
      <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-sm ${isHero ? 'text-white/50' : 'text-gray-500'} mb-5 flex-wrap`}>
        <Link href="/" className={linkClass}>Home</Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <Link href="/best" className={linkClass}>Best Of</Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <Link href={`/best/${metroSlug}`} className={linkClass}>{metroName}</Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <span className={activeClass}>{listingName}</span>
      </nav>
    );
  }

  // Default state/city breadcrumb
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-sm ${isHero ? 'text-white/50' : 'text-gray-500'} mb-5 flex-wrap`}>
      <Link href="/" className={linkClass}>Home</Link>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      <Link href="/states" className={linkClass}>States</Link>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      <Link href={`/state/${stateSlug}`} className={linkClass}>{stateName}</Link>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      <Link href={`/state/${stateSlug}/${citySlug}`} className={linkClass}>{cityName}</Link>
      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      <span className={activeClass}>{listingName}</span>
    </nav>
  );
}

/**
 * Smart breadcrumb for listing detail pages.
 * Shows "Best Of" breadcrumb when arriving from a best-of page,
 * otherwise shows the default state/city breadcrumb.
 * Wrapped in Suspense because useSearchParams requires it.
 */
export function ListingBreadcrumb(props: ListingBreadcrumbProps) {
  const isHero = props.variant === 'hero';
  const linkClass = isHero ? 'hover:text-white transition-colors' : 'hover:text-[#22C55E] transition-colors';
  const activeClass = isHero ? 'text-white/80 truncate' : 'text-gray-900 font-medium truncate';

  return (
    <Suspense
      fallback={
        <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-sm ${isHero ? 'text-white/50' : 'text-gray-500'} mb-5 flex-wrap`}>
          <Link href="/" className={linkClass}>Home</Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <Link href="/states" className={linkClass}>States</Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <Link href={`/state/${props.stateSlug}`} className={linkClass}>{props.stateName}</Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <Link href={`/state/${props.stateSlug}/${props.citySlug}`} className={linkClass}>{props.cityName}</Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <span className={activeClass}>{props.listingName}</span>
        </nav>
      }
    >
      <BreadcrumbInner {...props} />
    </Suspense>
  );
}
