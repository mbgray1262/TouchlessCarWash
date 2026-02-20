'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Eye, Edit3, Bold, Italic, Heading2, Heading3, Link2, List, ListOrdered, Quote, Save, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase, type BlogPost } from '@/lib/supabase';

interface BlogEditorProps {
  post?: BlogPost;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderMarkdownPreview(md: string): string {
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

  const inline = (text: string) => text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.875em">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline">$1</a>');

  for (const line of lines) {
    if (/^#{4}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h4 style="font-size:1.1em;font-weight:600;color:#0F2744;margin:1.5rem 0 0.5rem">${line.replace(/^#{4}\s/, '')}</h4>`);
    } else if (/^#{3}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h3 style="font-size:1.25em;font-weight:700;color:#0F2744;margin:2rem 0 0.75rem">${line.replace(/^#{3}\s/, '')}</h3>`);
    } else if (/^#{2}\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h2 style="font-size:1.5em;font-weight:700;color:#0F2744;margin:2.5rem 0 1rem">${line.replace(/^#{2}\s/, '')}</h2>`);
    } else if (/^#\s/.test(line)) {
      closeList(); closeBlockquote();
      out.push(`<h2 style="font-size:1.5em;font-weight:700;color:#0F2744;margin:2.5rem 0 1rem">${line.replace(/^#\s/, '')}</h2>`);
    } else if (/^&gt;\s/.test(line)) {
      closeList();
      if (!inBlockquote) { out.push('<blockquote style="border-left:4px solid #93c5fd;padding-left:1rem;color:#4b5563;font-style:italic;margin:1rem 0">'); inBlockquote = true; }
      out.push(`<p style="margin:0.25rem 0">${inline(line.replace(/^&gt;\s/, ''))}</p>`);
    } else if (/^[-*]\s/.test(line)) {
      closeBlockquote();
      if (!inUl) { out.push('<ul style="list-style:disc;padding-left:1.5rem;margin:1rem 0">'); inUl = true; }
      out.push(`<li style="color:#374151;margin:0.25rem 0">${inline(line.replace(/^[-*]\s/, ''))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      closeBlockquote();
      if (!inOl) { out.push('<ol style="list-style:decimal;padding-left:1.5rem;margin:1rem 0">'); inOl = true; }
      out.push(`<li style="color:#374151;margin:0.25rem 0">${inline(line.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (line.trim() === '') {
      closeList(); closeBlockquote();
      out.push('');
    } else {
      closeList(); closeBlockquote();
      out.push(`<p style="color:#374151;line-height:1.75;margin-bottom:1rem">${inline(line)}</p>`);
    }
  }

  closeList();
  closeBlockquote();
  return out.join('\n');
}

export function BlogEditor({ post }: BlogEditorProps) {
  const router = useRouter();
  const isNew = !post;

  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [slugManual, setSlugManual] = useState(!!post);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [tagsInput, setTagsInput] = useState((post?.tags ?? []).join(', '));
  const [featuredImageUrl, setFeaturedImageUrl] = useState(post?.featured_image_url ?? '');
  const [metaTitle, setMetaTitle] = useState(post?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(post?.meta_description ?? '');
  const [status, setStatus] = useState<'draft' | 'published'>(post?.status ?? 'draft');
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  const insertMarkdown = useCallback((before: string, after: string = '', placeholder: string = 'text') => {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end) || placeholder;
    const newContent = content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      const newPos = start + before.length + selected.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }, [content]);

  const insertLine = useCallback((prefix: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    setContent(newContent);
    setTimeout(() => { ta.focus(); }, 0);
  }, [content]);

  async function save(publishNow: boolean = false) {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!slug.trim()) { setError('Slug is required.'); return; }
    if (!content.trim()) { setError('Content is required.'); return; }
    setError('');
    setSaving(true);

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const newStatus = publishNow ? 'published' : status;
    const now = new Date().toISOString();

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      content: content.trim(),
      excerpt: excerpt.trim() || null,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      featured_image_url: featuredImageUrl.trim() || null,
      tags,
      status: newStatus,
      updated_at: now,
      ...(newStatus === 'published' && (isNew || post?.status !== 'published')
        ? { published_at: now }
        : {}),
    };

    let saveError;
    if (isNew) {
      const { error: e } = await supabase.from('blog_posts').insert(payload);
      saveError = e;
    } else {
      const { error: e } = await supabase.from('blog_posts').update(payload).eq('id', post!.id);
      saveError = e;
    }

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    router.push('/admin/blog');
  }

  const toolbarBtn = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="p-2 rounded hover:bg-gray-200 text-gray-600 hover:text-[#0F2744] transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0F2744] py-8">
        <div className="container mx-auto px-4 max-w-5xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-4">
            <Link href="/admin/listings" className="hover:text-white transition-colors">Admin</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/admin/blog" className="hover:text-white transition-colors">Blog</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">{isNew ? 'New Post' : 'Edit Post'}</span>
          </nav>
          <h1 className="text-3xl font-bold text-white">{isNew ? 'New Blog Post' : 'Edit Blog Post'}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div>
                <Label htmlFor="title" className="text-sm font-semibold text-gray-700 mb-1.5 block">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Post title"
                  className="text-lg font-medium"
                />
              </div>

              <div>
                <Label htmlFor="slug" className="text-sm font-semibold text-gray-700 mb-1.5 block">Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 shrink-0">/blog/</span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={e => { setSlug(slugify(e.target.value)); setSlugManual(true); }}
                    placeholder="post-url-slug"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="excerpt" className="text-sm font-semibold text-gray-700">Excerpt</Label>
                  <span className={`text-xs ${excerpt.length > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                    {excerpt.length}/160
                  </span>
                </div>
                <Textarea
                  id="excerpt"
                  value={excerpt}
                  onChange={e => setExcerpt(e.target.value)}
                  placeholder="Short summary shown in blog listing cards and meta descriptions..."
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-4">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('write')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === 'write'
                        ? 'border-[#0F2744] text-[#0F2744]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Write
                  </button>
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === 'preview'
                        ? 'border-[#0F2744] text-[#0F2744]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                </div>
                {activeTab === 'write' && (
                  <div className="flex items-center gap-0.5">
                    {toolbarBtn(<Bold className="w-4 h-4" />, 'Bold', () => insertMarkdown('**', '**', 'bold text'))}
                    {toolbarBtn(<Italic className="w-4 h-4" />, 'Italic', () => insertMarkdown('*', '*', 'italic text'))}
                    <div className="w-px h-4 bg-gray-200 mx-1" />
                    {toolbarBtn(<Heading2 className="w-4 h-4" />, 'H2', () => insertLine('## '))}
                    {toolbarBtn(<Heading3 className="w-4 h-4" />, 'H3', () => insertLine('### '))}
                    <div className="w-px h-4 bg-gray-200 mx-1" />
                    {toolbarBtn(<Link2 className="w-4 h-4" />, 'Link', () => insertMarkdown('[', '](https://)', 'link text'))}
                    <div className="w-px h-4 bg-gray-200 mx-1" />
                    {toolbarBtn(<List className="w-4 h-4" />, 'Bulleted list', () => insertLine('- '))}
                    {toolbarBtn(<ListOrdered className="w-4 h-4" />, 'Numbered list', () => insertLine('1. '))}
                    {toolbarBtn(<Quote className="w-4 h-4" />, 'Blockquote', () => insertLine('> '))}
                  </div>
                )}
              </div>

              {activeTab === 'write' ? (
                <Textarea
                  ref={contentRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Write your post in Markdown..."
                  className="min-h-[480px] rounded-none border-0 focus-visible:ring-0 font-mono text-sm resize-y p-4 leading-relaxed"
                />
              ) : (
                <div
                  className="min-h-[480px] p-6 text-sm leading-relaxed overflow-auto"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) || '<p style="color:#9ca3af">Nothing to preview yet...</p>' }}
                />
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-[#0F2744] text-sm mb-4">Publish</h3>

              <div className="mb-4">
                <Label className="text-xs font-medium text-gray-500 mb-2 block">Status</Label>
                <div className="flex gap-2">
                  {(['draft', 'published'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        status === s
                          ? s === 'published'
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-[#0F2744] text-white border-[#0F2744]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
                  variant="outline"
                  onClick={() => save(false)}
                  disabled={saving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-white"
                  onClick={() => save(true)}
                  disabled={saving}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  {saving ? 'Publishing...' : 'Save & Publish'}
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-[#0F2744] text-sm">Post Details</h3>

              <div>
                <Label htmlFor="tags" className="text-xs font-medium text-gray-500 mb-1.5 block">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  placeholder="touchless, guide, tips"
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
                {tagsInput && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="featuredImage" className="text-xs font-medium text-gray-500 mb-1.5 block">Featured Image URL</Label>
                <Input
                  id="featuredImage"
                  value={featuredImageUrl}
                  onChange={e => setFeaturedImageUrl(e.target.value)}
                  placeholder="https://images.pexels.com/..."
                  className="text-sm"
                />
                {featuredImageUrl && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 h-28">
                    <img src={featuredImageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-[#0F2744] text-sm">SEO</h3>

              <div>
                <Label htmlFor="metaTitle" className="text-xs font-medium text-gray-500 mb-1.5 block">Meta Title</Label>
                <Input
                  id="metaTitle"
                  value={metaTitle}
                  onChange={e => setMetaTitle(e.target.value)}
                  placeholder="Leave blank to use post title"
                  className="text-sm"
                />
              </div>

              <div>
                <Label htmlFor="metaDescription" className="text-xs font-medium text-gray-500 mb-1.5 block">Meta Description</Label>
                <Textarea
                  id="metaDescription"
                  value={metaDescription}
                  onChange={e => setMetaDescription(e.target.value)}
                  placeholder="Leave blank to use excerpt"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            <Button
              asChild
              variant="ghost"
              className="w-full text-gray-500 hover:text-gray-700"
            >
              <Link href="/admin/blog">Cancel</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
