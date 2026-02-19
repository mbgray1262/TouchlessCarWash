'use client';

import Link from 'next/link';
import { Droplet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail('');
  };

  return (
    <footer className="bg-[#0F2744] mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-semibold text-white mb-4">About</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              The most comprehensive directory of touchless car washes across the United States.
              Find, compare, and review the best touchless locations near you.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/search" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Find a Wash
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">For Businesses</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/add-listing" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Add Your Listing
                </Link>
              </li>
              <li>
                <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Business Resources
                </Link>
              </li>
              <li>
                <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
                  Contact Sales
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-4">Stay Updated</h3>
            <p className="text-sm text-white/70 mb-4">
              Get the latest listings and car care tips delivered to your inbox.
            </p>
            <form onSubmit={handleEmailSubmit} className="flex gap-2">
              <Input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
              <Button type="submit" className="bg-[#22C55E] hover:bg-[#16A34A] text-white">
                Join
              </Button>
            </form>
          </div>
        </div>

        <div className="border-t border-white/20 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Droplet className="w-6 h-6 text-[#22C55E]" />
            <span className="font-bold text-white">
              Touchless Car Wash Finder
            </span>
          </Link>

          <div className="flex gap-6 text-sm">
            <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
              Terms of Service
            </Link>
            <Link href="#" className="text-white/70 hover:text-[#22C55E] transition-colors">
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
