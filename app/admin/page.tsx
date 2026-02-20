import Link from 'next/link';
import { List, Building2, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminNav } from '@/components/AdminNav';

async function getStats() {
  const [listingsRes, vendorsRes, blogRes] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }),
    supabase.from('vendors').select('id', { count: 'exact', head: true }),
    supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
  ]);

  return {
    listings: listingsRes.count ?? 0,
    vendors: vendorsRes.count ?? 0,
    blog: blogRes.count ?? 0,
  };
}

const sections = [
  {
    href: '/admin/listings',
    label: 'Listings',
    description: 'Manage car wash listings',
    icon: List,
    countKey: 'listings' as const,
    countLabel: 'listing',
  },
  {
    href: '/admin/vendors',
    label: 'Vendors',
    description: 'Manage vendor and chain groupings',
    icon: Building2,
    countKey: 'vendors' as const,
    countLabel: 'vendor',
  },
  {
    href: '/admin/blog',
    label: 'Blog',
    description: 'Create and manage blog posts',
    icon: FileText,
    countKey: 'blog' as const,
    countLabel: 'post',
  },
];

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      <div className="container mx-auto px-4 max-w-7xl py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#0F2744]">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your car wash directory</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sections.map(({ href, label, description, icon: Icon, countKey, countLabel }) => {
            const count = stats[countKey];
            return (
              <Link
                key={href}
                href={href}
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-orange-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2.5 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
                    <Icon className="w-5 h-5 text-orange-600" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors mt-1" />
                </div>
                <h2 className="text-lg font-semibold text-[#0F2744] mb-1">{label}</h2>
                <p className="text-sm text-gray-500 mb-3">{description}</p>
                <p className="text-2xl font-bold text-[#0F2744]">
                  {count.toLocaleString()}
                  <span className="text-sm font-normal text-gray-400 ml-1.5">
                    {countLabel}{count !== 1 ? 's' : ''}
                  </span>
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
