'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Eye, Edit3, Bold, Italic, Heading2, Heading3, Link2, List, ListOrdered, Quote, Save, Rocket, Sparkles, ChevronDown, ChevronUp, Loader2, Clipboard, Download, ImagePlus, X } from 'lucide-react';
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
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:0.5rem 0">')
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
  const [copied, setCopied] = useState(false);

  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgAlt, setImgAlt] = useState('');
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgCursorPos, setImgCursorPos] = useState(0);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiKeywords, setAiKeywords] = useState('');
  const [aiTone, setAiTone] = useState('Informative');
  const [aiLength, setAiLength] = useState('medium');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuccess, setAiSuccess] = useState(false);
  const [aiError, setAiError] = useState('');

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

  async function generateDraft() {
    if (!aiTopic.trim()) { setAiError('Please enter a topic or title.'); return; }
    setAiError('');
    setAiSuccess(false);
    setAiGenerating(true);

    try {
      const res = await fetch('/api/generate-blog-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          keywords: aiKeywords,
          tone: aiTone,
          length: aiLength,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAiError(data.error || 'Failed to generate draft. Please try again.');
        setAiGenerating(false);
        return;
      }

      const text: string = data.text ?? '';
      const lines = text.split('\n');
      const titleLine = lines.find(l => /^#\s/.test(l));
      const generatedTitle = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '';
      const bodyLines = lines.filter(l => l !== titleLine);
      const generatedBody = bodyLines.join('\n').replace(/^\n+/, '');

      const firstPara = generatedBody
        .split('\n')
        .find(l => l.trim() && !/^#+\s/.test(l) && !/^[-*]/.test(l) && !/^\d+\./.test(l));
      const generatedExcerpt = firstPara ? firstPara.replace(/\*\*/g, '').substring(0, 150) : '';

      if (!title && generatedTitle) {
        setTitle(generatedTitle);
        if (!slugManual) setSlug(slugify(generatedTitle));
      }
      if (!content && generatedBody) setContent(generatedBody);
      if (!excerpt && generatedExcerpt) setExcerpt(generatedExcerpt);
      if (!tagsInput && aiKeywords) setTagsInput(aiKeywords);

      setAiSuccess(true);
    } catch (e) {
      setAiError('Network error. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  }

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

  function openImgModal() {
    const ta = contentRef.current;
    setImgCursorPos(ta ? ta.selectionStart : content.length);
    setImgFile(null);
    setImgAlt('');
    setImgError('');
    setImgModalOpen(true);
  }

  async function handleImageUpload() {
    if (!imgFile) { setImgError('Please select an image file.'); return; }
    setImgError('');
    setImgUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', imgFile);

      const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) {
        setImgError(data.error || 'Upload failed. Please try again.');
        setImgUploading(false);
        return;
      }

      const altText = imgAlt.trim() || imgFile.name.replace(/\.[^.]+$/, '');
      const markdown = `![${altText}](${data.url})`;
      const newContent = content.substring(0, imgCursorPos) + markdown + content.substring(imgCursorPos);
      setContent(newContent);
      setImgModalOpen(false);

      setTimeout(() => {
        const ta = contentRef.current;
        if (ta) {
          ta.focus();
          const pos = imgCursorPos + markdown.length;
          ta.setSelectionRange(pos, pos);
        }
      }, 0);
    } catch {
      setImgError('Network error. Please try again.');
    } finally {
      setImgUploading(false);
    }
  }

  function buildJsonPayload() {
    return {
      title,
      slug,
      excerpt,
      content,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      status,
      featured_image_url: featuredImageUrl,
      meta_title: metaTitle,
      meta_description: metaDescription,
      author: (post as any)?.author ?? '',
    };
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(buildJsonPayload(), null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadJson() {
    const filename = slug.trim() ? `${slug.trim()}.json` : 'blog-post-draft.json';
    const blob = new Blob([JSON.stringify(buildJsonPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

            <div className="bg-white rounded-xl border border-blue-100 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => { setAiOpen(o => !o); setAiSuccess(false); setAiError(''); }}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-blue-50 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-sm font-semibold text-[#0F2744]">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Generate Draft with AI
                </span>
                {aiOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {aiOpen && (
                <div className="px-5 pb-5 border-t border-blue-100 pt-4 space-y-4">
                  {aiSuccess && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                      <span className="font-medium">Draft generated!</span> Review and edit before publishing.
                    </div>
                  )}
                  {aiError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-2">
                      <span>{aiError}</span>
                      <button
                        type="button"
                        onClick={() => setAiError('')}
                        className="text-xs underline shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="aiTopic" className="text-xs font-medium text-gray-600 mb-1.5 block">Topic or Title</Label>
                    <Input
                      id="aiTopic"
                      value={aiTopic}
                      onChange={e => setAiTopic(e.target.value)}
                      placeholder="e.g. Touchless vs brush car wash comparison"
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="aiKeywords" className="text-xs font-medium text-gray-600 mb-1.5 block">Target Keywords</Label>
                    <Input
                      id="aiKeywords"
                      value={aiKeywords}
                      onChange={e => setAiKeywords(e.target.value)}
                      placeholder="e.g. touchless, brushless, touch-free, laser car wash"
                      className="text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="aiTone" className="text-xs font-medium text-gray-600 mb-1.5 block">Tone</Label>
                      <select
                        id="aiTone"
                        value={aiTone}
                        onChange={e => setAiTone(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="Informative">Informative</option>
                        <option value="Casual">Casual</option>
                        <option value="Professional">Professional</option>
                        <option value="Friendly">Friendly</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="aiLength" className="text-xs font-medium text-gray-600 mb-1.5 block">Length</Label>
                      <select
                        id="aiLength"
                        value={aiLength}
                        onChange={e => setAiLength(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="short">Short (~500 words)</option>
                        <option value="medium">Medium (~1000 words)</option>
                        <option value="long">Long (~1500 words)</option>
                      </select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={generateDraft}
                    disabled={aiGenerating}
                    className="bg-[#0F2744] hover:bg-[#1a3a6b] text-white w-full"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating draft...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Draft
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

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
                    {toolbarBtn(<ImagePlus className="w-4 h-4" />, 'Insert Image', openImgModal)}
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
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyJson}
                    className="flex-1 text-xs text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                  >
                    <Clipboard className="w-3.5 h-3.5 mr-1.5" />
                    {copied ? 'Copied!' : 'Copy JSON'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadJson}
                    className="flex-1 text-xs text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download JSON
                  </Button>
                </div>
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

      {imgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !imgUploading && setImgModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#0F2744] flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-blue-500" />
                Insert Image
              </h2>
              <button
                type="button"
                onClick={() => !imgUploading && setImgModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {imgError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {imgError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="imgFile" className="text-xs font-medium text-gray-600 mb-1.5 block">Image File</Label>
                <input
                  id="imgFile"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={imgUploading}
                  onChange={e => {
                    const f = e.target.files?.[0] ?? null;
                    setImgFile(f);
                    if (f && !imgAlt) {
                      setImgAlt(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
                    }
                  }}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-200 file:text-sm file:font-medium file:text-gray-700 file:bg-gray-50 hover:file:bg-gray-100 cursor-pointer"
                />
              </div>

              {imgFile && (
                <div className="rounded-lg overflow-hidden border border-gray-200 h-36 bg-gray-50">
                  <img
                    src={URL.createObjectURL(imgFile)}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="imgAlt" className="text-xs font-medium text-gray-600 mb-1.5 block">Alt Text</Label>
                <Input
                  id="imgAlt"
                  value={imgAlt}
                  onChange={e => setImgAlt(e.target.value)}
                  placeholder="Descriptive text for the image"
                  disabled={imgUploading}
                  className="text-sm"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImgModalOpen(false)}
                  disabled={imgUploading}
                  className="flex-1 border-gray-200 text-gray-600"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImageUpload}
                  disabled={imgUploading || !imgFile}
                  className="flex-1 bg-[#0F2744] hover:bg-[#1a3a6b] text-white"
                >
                  {imgUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4 mr-2" />
                      Upload & Insert
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
