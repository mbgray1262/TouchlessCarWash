import Link from 'next/link';
import { Search, Home, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h1 className="text-6xl font-bold text-gray-300 mb-2">404</h1>
      <h2 className="text-2xl font-semibold text-gray-800 mb-3">
        Page Not Found
      </h2>
      <p className="text-gray-500 max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved. Try searching for a touchless car wash near you instead.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild>
          <Link href="/">
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/search">
            <Search className="h-4 w-4 mr-2" />
            Search Locations
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/state">
            <MapPin className="h-4 w-4 mr-2" />
            Browse by State
          </Link>
        </Button>
      </div>
    </main>
  );
}
