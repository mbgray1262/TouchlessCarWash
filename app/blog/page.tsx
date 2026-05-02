import Link from 'next/link';
import { ChevronRight, Calendar, User } from 'lucide-react';
import { ProductsBanner } from '@/components/ProductsBanner';
import { supabase, type BlogPost } from '@/lib/supabase';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

export const metadata: Metadata = {
  title: 'Touchless Car Wash Guides & Tips',
  description: 'Expert guides and tips about touchless, touch-free, and laser car washes. Learn how to protect your paint and find the best wash near you.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/blog',
  },
  openGraph: {
    title: 'Touchless Car Wash Guides & Tips | Touchless Car Wash Finder',
    description: 'Expert guides and tips about touchless, touch-free, and laser car washes. Learn how to protect your paint and find the best wash near you.',
    url: 'https://touchlesscarwashfinder.com/blog',
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
  },
};

async function getBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }

  return data || [];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPage() {
  const posts = await getBlogPosts();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://touchlesscarwashfinder.com/blog' },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="bg-[#0F2744] py-14">
        <div className="container mx-auto px-4 max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Blog</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Touchless Car Wash Guides & Tips
          </h1>
          <p className="text-white/70 text-lg max-w-2xl">
            Expert articles on touchless, touch-free, and laser car washes — how they work, how to choose one, and how to protect your vehicle&apos;s finish.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-8">
        <ProductsBanner />
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-4">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group block h-full"
              >
                <article className="h-full bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all duration-300 flex flex-col">
                  {post.featured_image_url ? (
                    <div className="h-44 overflow-hidden bg-gray-100 shrink-0">
                      <img
                        src={post.featured_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-[#0F2744] to-[#1a3a6b] flex items-center justify-center shrink-0">
                      <span className="text-white/20 text-6xl font-bold select-none">
                        {post.title.charAt(0)}
                      </span>
                    </div>
                  )}

                  <div className="p-5 flex flex-col flex-1">
                    <h2 className="text-lg font-bold text-[#0F2744] mb-2 group-hover:text-blue-700 transition-colors leading-snug line-clamp-2">
                      {post.title}
                    </h2>

                    {post.excerpt && (
                      <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-2 flex-1">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-auto pt-3 border-t border-gray-100">
                      {post.published_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(post.published_at)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {post.author}
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
