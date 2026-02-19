import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase, type BlogPost } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Car Wash Tips & Guides | Touchless Car Wash Blog',
  description: 'Expert tips, guides, and articles about touchless car washes, car care, and maintaining your vehicle. Learn from the pros.',
};

async function getBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }

  return data || [];
}

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Blog & Resources
            </h1>
            <p className="text-lg text-muted-foreground">
              Expert tips and guides for maintaining your vehicle
            </p>
          </div>

          {posts.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">No blog posts yet. Check back soon!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                    <CardHeader>
                      {post.category && (
                        <Badge variant="secondary" className="w-fit mb-2">
                          {post.category}
                        </Badge>
                      )}
                      <CardTitle className="text-2xl">{post.title}</CardTitle>
                      <CardDescription className="text-base">
                        {new Date(post.published_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </CardDescription>
                    </CardHeader>
                    {post.excerpt && (
                      <CardContent>
                        <p className="text-muted-foreground">{post.excerpt}</p>
                      </CardContent>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
