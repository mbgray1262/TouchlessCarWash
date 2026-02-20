import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Calendar, User, ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type BlogPost } from '@/lib/supabase';
import type { Metadata } from 'next';

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getAdjacentPosts(publishedAt: string | null): Promise<{ prev: BlogPost | null; next: BlogPost | null }> {
  if (!publishedAt) return { prev: null, next: null };

  const [{ data: prevData }, { data: nextData }] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('id, title, slug, published_at')
      .eq('status', 'published')
      .lt('published_at', publishedAt)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('blog_posts')
      .select('id, title, slug, published_at')
      .eq('status', 'published')
      .gt('published_at', publishedAt)
      .order('published_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return { prev: prevData as BlogPost | null, next: nextData as BlogPost | null };
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await getBlogPost(params.slug);
  if (!post) return { title: 'Post Not Found' };

  return {
    title: post.meta_title || `${post.title} | Touchless Car Wash Finder Blog`,
    description: post.meta_description || post.excerpt || post.title,
    openGraph: post.featured_image_url
      ? { images: [{ url: post.featured_image_url }] }
      : undefined,
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  const closeBlockquote = () => {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (/^#{4}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h4 class="text-lg font-semibold text-[#0F2744] mt-6 mb-2">${line.replace(/^#{4}\s/, '')}</h4>`);
    } else if (/^#{3}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h3 class="text-xl font-bold text-[#0F2744] mt-8 mb-3">${line.replace(/^#{3}\s/, '')}</h3>`);
    } else if (/^#{2}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h2 class="text-2xl font-bold text-[#0F2744] mt-10 mb-4">${line.replace(/^#{2}\s/, '')}</h2>`);
    } else if (/^#{1}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h2 class="text-2xl font-bold text-[#0F2744] mt-10 mb-4">${line.replace(/^#\s/, '')}</h2>`);
    } else if (/^&gt;\s/.test(line)) {
      closeList();
      if (!inBlockquote) { out.push('<blockquote class="border-l-4 border-blue-300 pl-4 italic text-gray-600 my-4">'); inBlockquote = true; }
      out.push(`<p class="mb-1">${inlineMarkdown(line.replace(/^&gt;\s/, ''))}</p>`);
    } else if (/^[-*]\s/.test(line)) {
      closeBlockquote();
      if (!inUl) { out.push('<ul class="list-disc pl-6 my-4 space-y-1">'); inUl = true; }
      out.push(`<li class="text-gray-700">${inlineMarkdown(line.replace(/^[-*]\s/, ''))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      closeBlockquote();
      if (!inOl) { out.push('<ol class="list-decimal pl-6 my-4 space-y-1">'); inOl = true; }
      out.push(`<li class="text-gray-700">${inlineMarkdown(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (line.trim() === '') {
      closeList(); closeBlockquote();
      out.push('');
    } else {
      closeList(); closeBlockquote();
      out.push(`<p class="text-gray-700 leading-relaxed mb-4">${inlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  closeBlockquote();

  return out.join('\n');
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-[#0F2744]">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline font-medium">$1</a>');
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();

  const { prev, next } = await getAdjacentPosts(post.published_at);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description || post.excerpt || '',
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Touchless Car Wash Finder',
      url: 'https://touchlesswash.com',
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    ...(post.featured_image_url ? { image: post.featured_image_url } : {}),
    keywords: post.tags?.join(', ') ?? '',
    url: `https://touchlesswash.com/blog/${post.slug}`,
  };

  const renderedContent = renderMarkdown(post.content);

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <div className="bg-[#0F2744] py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white truncate max-w-xs">{post.title}</span>
          </nav>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <Badge key={tag} className="bg-white/10 text-white border-white/20 hover:bg-white/20 text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-5 text-white/60 text-sm">
            {post.published_at && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDate(post.published_at)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {post.author}
            </span>
          </div>
        </div>
      </div>

      {post.featured_image_url && (
        <div className="w-full max-h-96 overflow-hidden">
          <img
            src={post.featured_image_url}
            alt={post.title}
            className="w-full h-96 object-cover"
          />
        </div>
      )}

      <div className="container mx-auto px-4 max-w-3xl py-12">
        <article
          className="prose-content"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3 font-medium">Tagged:</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 p-6 bg-[#0F2744] rounded-2xl text-center">
          <p className="text-white font-semibold text-lg mb-2">Ready to find a touchless car wash near you?</p>
          <p className="text-white/70 text-sm mb-4">Browse our directory of verified no-touch and laser car wash locations across the US.</p>
          <Button asChild className="bg-[#22C55E] hover:bg-[#16A34A] text-white font-semibold">
            <Link href="/states">Browse Touchless Car Washes</Link>
          </Button>
        </div>

        {(prev || next) && (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {prev ? (
              <Link href={`/blog/${prev.slug}`} className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-all">
                <ArrowLeft className="w-4 h-4 mt-1 text-gray-400 group-hover:text-blue-600 flex-shrink-0 transition-colors" />
                <div>
                  <p className="text-xs text-gray-400 mb-1">Previous</p>
                  <p className="text-sm font-medium text-[#0F2744] group-hover:text-blue-700 transition-colors line-clamp-2">{prev.title}</p>
                </div>
              </Link>
            ) : <div />}
            {next ? (
              <Link href={`/blog/${next.slug}`} className="group flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-all sm:text-right sm:flex-row-reverse">
                <ArrowRight className="w-4 h-4 mt-1 text-gray-400 group-hover:text-blue-600 flex-shrink-0 transition-colors" />
                <div>
                  <p className="text-xs text-gray-400 mb-1">Next</p>
                  <p className="text-sm font-medium text-[#0F2744] group-hover:text-blue-700 transition-colors line-clamp-2">{next.title}</p>
                </div>
              </Link>
            ) : <div />}
          </div>
        )}
      </div>
    </div>
  );
}
