'use client';

import Link from 'next/link';
import { Droplet, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <Link href="#browse-states" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Browse States
            </Link>
            <Link href="/add-listing" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Add Your Business
            </Link>
            <Link href="/blog" className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors">
              Blog
            </Link>
            <Link href="/admin" className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors">
              Admin
            </Link>
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
                href="#browse-states"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Browse States
              </Link>
              <Link
                href="/add-listing"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Add Your Business
              </Link>
              <Link
                href="/blog"
                className="text-sm font-medium text-[#0F2744] hover:text-[#22C55E] transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Blog
              </Link>
              <Link
                href="/admin"
                className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Admin
              </Link>
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
