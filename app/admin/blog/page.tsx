'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase, type BlogPost } from '@/lib/supabase';

type SortField = 'updated_at' | 'published_at' | 'title';
type SortDir = 'asc' | 'desc';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('blog_posts').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    query = query.order(sortField, { ascending: sortDir === 'asc' });
    const { data } = await query;
    setPosts(data || []);
    setLoading(false);
  }, [statusFilter, sortField, sortDir]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    await supabase.from('blog_posts').delete().eq('id', id);
    setDeleting(null);
    fetchPosts();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0F2744] py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-4">
            <Link href="/admin/listings" className="hover:text-white transition-colors">Admin</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Blog</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Blog Posts</h1>
              <p className="text-white/60 text-sm mt-1">{posts.length} post{posts.length !== 1 ? 's' : ''}</p>
            </div>
            <Button asChild className="bg-[#22C55E] hover:bg-[#16A34A] text-white">
              <Link href="/admin/blog/new">
                <Plus className="w-4 h-4 mr-2" />
                New Post
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-gray-500 font-medium">Filter by status:</span>
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-[#0F2744] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">No posts found.</p>
            <Button asChild className="bg-[#22C55E] hover:bg-[#16A34A] text-white">
              <Link href="/admin/blog/new">Create your first post</Link>
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-gray-700 w-[40%]">
                    <button className="flex items-center gap-1 hover:text-[#0F2744]" onClick={() => toggleSort('title')}>
                      Title
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Tags</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">
                    <button className="flex items-center gap-1 hover:text-[#0F2744]" onClick={() => toggleSort('published_at')}>
                      Published
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">
                    <button className="flex items-center gap-1 hover:text-[#0F2744]" onClick={() => toggleSort('updated_at')}>
                      Updated
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#0F2744] line-clamp-1">{post.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">/blog/{post.slug}</div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        className={
                          post.status === 'published'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }
                        variant="outline"
                      >
                        {post.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(post.tags || []).slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-blue-50 text-blue-600 border-0">
                            {tag}
                          </Badge>
                        ))}
                        {(post.tags || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{(post.tags || []).length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 hidden lg:table-cell">{formatDate(post.published_at)}</td>
                    <td className="px-4 py-4 text-gray-500 hidden lg:table-cell">{formatDate(post.updated_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        <Button asChild variant="ghost" size="sm" className="text-gray-500 hover:text-[#0F2744]">
                          <Link href={`/admin/blog/edit/${post.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400 hover:text-red-600"
                          onClick={() => handleDelete(post.id, post.title)}
                          disabled={deleting === post.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
