'use client';

import Link from 'next/link';
import { Droplet, Menu, X, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useFavorites } from '@/lib/useFavorites';

/**
 * Inner component that reads searchParams (must be wrapped in Suspense
 * so that useSearchParams doesn't force the entire page to bail out of
 * static / SSR rendering in Next.js 13+).
 */
function AdminParamReader({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const isAdmin = pathname.startsWith('/admin') || searchParams.get('admin') === 'true';

  if (!isAdmin) return null;
  return (
    <Link href="/admin" className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors">
      Admin
    </Link>
  );
}

function MobileAdminParamReader({ pathname, onClick }: { pathname: string; onClick: () => void }) {
  const searchParams = useSearchParams();
  const isAdmin = pathname.startsWith('/admin') || searchParams.get('admin') === 'true';

  if (!isAdmin) return null;
  return (
    <Link
      href="/admin"
      className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
      onClick={onClick}
    >
      Admin
    </Link>
  );
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { favorites } = useFavorites();
  const favCount = favorites.length;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Droplet className="w-8 h-8 text-[#0F2744]" />
            <span className="font-bold text-xl text-[#0F2744]">
              Touchless Car Wash Finder
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#search" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Find a Wash
            </Link>
            <Link href="/#browse-states" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Browse States
            </Link>
            <Link href="/best" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Best Of
            </Link>
            <Link href="/chains" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Chains
            </Link>
            <Link href="/blog" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Blog
            </Link>
            <Link href="/about" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              About
            </Link>
            <Link href="/favorites" className="relative text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors" aria-label="My saved washes">
              <Heart className={`w-5 h-5 ${favCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
              {favCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {favCount > 9 ? '9+' : favCount}
                </span>
              )}
            </Link>
            <Suspense>
              <AdminParamReader pathname={pathname} />
            </Suspense>
            <Button asChild size="sm" className="bg-[#22C55E] hover:bg-[#16A34A] text-white">
              <Link href="/add-listing">Add Your Business</Link>
            </Button>
          </nav>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-[#0F2744]" />
            ) : (
              <Menu className="w-6 h-6 text-[#0F2744]" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-4">
              <Link
                href="/#search"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Find a Wash
              </Link>
              <Link
                href="/#browse-states"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Browse States
              </Link>
              <Link
                href="/best"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Best Of
              </Link>
              <Link
                href="/chains"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Chains
              </Link>
              <Link
                href="/blog"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Blog
              </Link>
              <Link
                href="/about"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link
                href="/favorites"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Heart className={`w-4 h-4 ${favCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                My Saved Washes{favCount > 0 && ` (${favCount})`}
              </Link>
              <Suspense>
                <MobileAdminParamReader pathname={pathname} onClick={() => setMobileMenuOpen(false)} />
              </Suspense>
              <Button asChild size="sm" className="bg-[#22C55E] hover:bg-[#16A34A] text-white w-full">
                <Link href="/add-listing" onClick={() => setMobileMenuOpen(false)}>Add Your Business</Link>
              </Button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
