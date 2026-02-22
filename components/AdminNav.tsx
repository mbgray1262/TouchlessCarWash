'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, List, Building2, FileText, ArrowLeft, Upload, ShieldCheck, Link2, Database, Zap, Filter, Sparkles } from 'lucide-react';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/listings', label: 'Listings', icon: List, exact: false },
  { href: '/admin/vendors', label: 'Vendors', icon: Building2, exact: false },
  { href: '/admin/vendor-matching', label: 'Vendor Matching', icon: Link2, exact: false },
  { href: '/admin/blog', label: 'Blog', icon: FileText, exact: false },
  { href: '/admin/import', label: 'Import', icon: Upload, exact: true },
  { href: '/admin/import/enrich', label: 'Enrich (Outscraper)', icon: Database, exact: true },
  { href: '/admin/import/enrich-photos', label: 'Enrich Photos', icon: Sparkles, exact: true },
  { href: '/admin/bulk-verify', label: 'Bulk Verify', icon: ShieldCheck, exact: false },
  { href: '/admin/pipeline', label: 'Pipeline', icon: Zap, exact: false },
  { href: '/admin/filters', label: 'Filters', icon: Filter, exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center gap-1 h-12 overflow-x-auto">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0F2744] transition-colors pr-4 mr-2 border-r border-gray-200 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Site
          </Link>
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors shrink-0 ${
                  active
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-gray-600 hover:text-[#0F2744] hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
