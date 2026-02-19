import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase, type BlogPost } from '@/lib/supabase';
import type { Metadata } from 'next';

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', params.slug)
    .lte('published_at', new Date().toISOString())
    .maybeSingle();

  if (!post) {
    return { title: 'Post Not Found' };
  }

  return {
    title: `${post.title} | Touchless Car Wash Finder Blog`,
    description: post.excerpt || post.title,
  };
}

async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .lte('published_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-primary">Blog</Link>
            <span>/</span>
            <span className="text-foreground">{post.title}</span>
          </nav>

          <article>
            <header className="mb-8">
              {post.category && (
                <Badge variant="secondary" className="mb-4">
                  {post.category}
                </Badge>
              )}
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                {post.title}
              </h1>
              <p className="text-muted-foreground">
                Published on {new Date(post.published_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </header>

            <Card>
              <CardContent className="p-8 prose prose-invert max-w-none">
                <div
                  className="text-foreground leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, '<br/>') }}
                />
              </CardContent>
            </Card>
          </article>

          <div className="mt-12 text-center">
            <Link
              href="/blog"
              className="text-primary hover:underline"
            >
              ← Back to all posts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
