'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, List, Building2, FileText, ArrowLeft, Upload, ShieldCheck,
  Link2, Database, Zap, Filter, Sparkles, PenLine, Eye, LogOut, LinkIcon,
  FlaskConical, Map, BarChart3, ChevronDown, Menu, X, Search, Image,
  Clock, MessageSquareText, Pickaxe, Package, Bug, FileEdit, Globe, Camera, Merge,
} from 'lucide-react';
import { useAdminAuth } from './AdminAuthProvider';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

const navigation: NavEntry[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/stats', label: 'Stats', icon: BarChart3 },
  {
    label: 'Listings',
    icon: List,
    items: [
      { href: '/admin/listings', label: 'Manage Listings', icon: List },
      { href: '/admin/hero-review', label: 'Hero Review', icon: Eye },
      { href: '/admin/ai-photo-review', label: 'AI Photo QA', icon: Camera },
      { href: '/admin/photo-audit', label: 'Photo Audit', icon: Camera },
      { href: '/admin/bulk-verify', label: 'Bulk Verify', icon: ShieldCheck },
      { href: '/admin/filters', label: 'Filters', icon: Filter },
    ],
  },
  {
    label: 'Content',
    icon: FileText,
    items: [
      { href: '/admin/blog', label: 'Blog', icon: FileText },
      { href: '/admin/suggested-edits', label: 'Suggested Edits', icon: PenLine },
    ],
  },
  {
    label: 'Vendors',
    icon: Building2,
    items: [
      { href: '/admin/vendors', label: 'Manage Vendors', icon: Building2 },
      { href: '/admin/vendor-matching', label: 'Vendor Matching', icon: Link2 },
    ],
  },
  {
    label: 'Data Pipeline',
    icon: Zap,
    items: [
      { href: '/admin/pipeline', label: 'Pipeline', icon: Zap },
      { href: '/admin/crawls', label: 'Crawls', icon: Globe },
      { href: '/admin/import', label: 'Import Hub', icon: Upload, exact: true },
      { href: '/admin/import/bulk', label: 'Bulk Import', icon: Package },
      { href: '/admin/import/enrich', label: 'Enrich (Outscraper)', icon: Database },
      { href: '/admin/import/enrich-photos', label: 'Enrich Photos', icon: Sparkles },
      { href: '/admin/import/extract-rich-data', label: 'Extract Data', icon: FlaskConical },
      { href: '/admin/import/chain-url-backfill', label: 'Chain URLs', icon: LinkIcon },
      { href: '/admin/import/discover', label: 'Discover', icon: Search },
      { href: '/admin/import/review-mine', label: 'Review Mine', icon: MessageSquareText },
      { href: '/admin/import/generate-descriptions', label: 'Generate Descriptions', icon: FileEdit },
      { href: '/admin/import/amenity-backfill', label: 'Amenity Backfill', icon: Pickaxe },
      { href: '/admin/import/gallery-backfill', label: 'Gallery Backfill', icon: Image },
      { href: '/admin/import/hero-audit', label: 'Hero Audit', icon: Bug },
      { href: '/admin/import/hours', label: 'Hours Import', icon: Clock },
      { href: '/admin/import/dedup-listings', label: 'Dedup Listings', icon: Merge },
    ],
  },
  { href: '/admin/sitemap', label: 'Sitemap', icon: Map },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

function groupContainsActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isActive(pathname, item.href, item.exact));
}

function NavLink({
  item,
  pathname,
  indented,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  indented?: boolean;
  onClick?: () => void;
}) {
  const active = isActive(pathname, item.href, item.exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
        indented ? 'ml-4' : ''
      } ${
        active
          ? 'bg-orange-50 text-orange-700 font-medium'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const containsActive = groupContainsActive(pathname, group);
  const [open, setOpen] = useState(containsActive);
  const Icon = group.icon;

  // Auto-expand when the user navigates into this group
  useEffect(() => {
    if (containsActive && !open) setOpen(true);
  }, [containsActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-colors w-full text-left ${
          containsActive
            ? 'text-orange-700 font-medium'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{group.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              indented
              onClick={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const { signOut, state } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userEmail = state.status === 'authorized' ? state.user.email : null;

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#0F2744] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Site
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navigation.map((entry) =>
          isGroup(entry) ? (
            <NavGroupSection
              key={entry.label}
              group={entry}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          ) : (
            <NavLink
              key={entry.href}
              item={entry}
              pathname={pathname}
              onClick={() => setMobileOpen(false)}
            />
          )
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2">
        {userEmail && (
          <span className="text-xs text-gray-400 block truncate">{userEmail}</span>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md px-2 py-1.5 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-white border-b border-gray-200 flex items-center px-4 z-30">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <span className="ml-3 text-sm font-semibold text-gray-700">Admin</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/30 z-30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-40">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
