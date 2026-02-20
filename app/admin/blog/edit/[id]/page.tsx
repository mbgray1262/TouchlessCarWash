import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BlogEditor } from '@/components/BlogEditor';

interface EditBlogPostPageProps {
  params: { id: string };
}

export default async function EditBlogPostPage({ params }: EditBlogPostPageProps) {
  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!post) notFound();

  return <BlogEditor post={post} />;
}
