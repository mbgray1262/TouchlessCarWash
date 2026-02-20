import Link from 'next/link';
import { ChevronRight, Calendar, User, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase, type BlogPost } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Touchless Car Wash Guides & Tips | Touchless Car Wash Finder Blog',
  description: 'Expert guides, comparisons, and tips about touchless, touch-free, and laser car washes. Learn how to protect your paint and find the best no-touch wash near you.',
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

  return (
    <div className="min-h-screen">
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

      <div className="container mx-auto px-4 max-w-5xl py-12">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {posts.map((post, index) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className={`group block ${index === 0 ? 'md:col-span-2' : ''}`}
              >
                <article className="h-full bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all duration-300">
                  {post.featured_image_url ? (
                    <div className={`overflow-hidden bg-gray-100 ${index === 0 ? 'h-64 md:h-80' : 'h-48'}`}>
                      <img
                        src={post.featured_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className={`bg-gradient-to-br from-[#0F2744] to-[#1a3a6b] flex items-center justify-center ${index === 0 ? 'h-48 md:h-56' : 'h-36'}`}>
                      <span className="text-white/20 text-6xl font-bold select-none">
                        {post.title.charAt(0)}
                      </span>
                    </div>
                  )}

                  <div className="p-6">
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {post.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-100">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <h2 className={`font-bold text-[#0F2744] mb-2 group-hover:text-blue-700 transition-colors leading-snug ${index === 0 ? 'text-2xl md:text-3xl' : 'text-xl'}`}>
                      {post.title}
                    </h2>

                    {post.excerpt && (
                      <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-400">
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

                    <div className="mt-4 text-sm font-medium text-blue-600 group-hover:text-blue-800 transition-colors">
                      Read more &rarr;
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
