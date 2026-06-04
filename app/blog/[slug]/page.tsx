import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Calendar, User, ArrowLeft, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase, type BlogPost } from '@/lib/supabase';
import { US_STATES, slugify } from '@/lib/constants';
import { generateTop10ChainsContent } from '@/lib/dynamic-blog-top10';
import { generateSubscriptionsContent } from '@/lib/dynamic-blog-subscriptions';
import { getTakeaways } from '@/lib/blog-takeaways';
import { getHowTo } from '@/lib/blog-howto-steps';
import { getBlogDatasetJsonLd } from '@/lib/blog-dataset-schema';
import { getTouchlessVideoPool } from '@/lib/videos';
import { TouchlessVideoModule } from '@/components/HomeVideoSection';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic'; // see /state/.../slug for context — Netlify CDN cache (netlify.toml) handles edge perf; force-dynamic prevents the Next.js ISR etag-based 304-without-body bug that kept breaking /blog and /best on the CDN.

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

  const canonicalUrl = `https://touchlesscarwashfinder.com/blog/${params.slug}`;

  return {
    title: post.meta_title ? { absolute: post.meta_title } : post.title,
    description: post.meta_description || post.excerpt || post.title,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: post.meta_title || `${post.title} | Touchless Car Wash Finder`,
      description: post.meta_description || post.excerpt || post.title,
      url: canonicalUrl,
      siteName: 'Touchless Car Wash Finder',
      type: 'article',
      ...(post.featured_image_url ? { images: [{ url: post.featured_image_url }] } : {}),
    },
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

// Slugify heading text for anchor IDs. Lower-cased, alphanumeric+hyphen only,
// collapsed dashes. AI tools and citation tools rely on these to deep-link to
// specific statistics — without IDs, "Touchless Car Wash Finder reports X%"
// citations end up linking to the page root and lose their context.
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

    // Markdown table: header row followed by separator row (|---|---|)
    if (/^\|(.+)\|$/.test(line.trim()) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
      closeList(); closeBlockquote();
      const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i++; // skip separator row
      let tableHtml = '<div class="overflow-x-auto my-6 rounded-lg border border-gray-200"><table class="w-full text-sm border-collapse">';
      tableHtml += '<thead><tr class="bg-[#0F2744] text-white">';
      for (const cell of headerCells) {
        tableHtml += `<th class="px-5 py-3 text-left font-semibold text-sm">${inlineMarkdown(cell)}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      let rowIdx = 0;
      while (i + 1 < lines.length && /^\|(.+)\|$/.test(lines[i + 1].trim())) {
        i++;
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        tableHtml += `<tr class="${rowBg} border-b border-gray-100">`;
        for (const cell of cells) {
          tableHtml += `<td class="px-5 py-3 text-gray-700">${inlineMarkdown(cell)}</td>`;
        }
        tableHtml += '</tr>';
        rowIdx++;
      }
      tableHtml += '</tbody></table></div>';
      out.push(tableHtml);
      continue;
    }

    if (/^!\[/.test(line.trim()) && /\]\(/.test(line)) {
      closeList(); closeBlockquote();
      const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (imgMatch) {
        out.push(`<figure class="my-6"><img src="${imgMatch[2]}" alt="${imgMatch[1]}" class="rounded-xl w-full object-cover shadow-sm" /></figure>`);
        continue;
      }
    }

    if (/^#{4}\s/.test(line)) {
      closeList(); closeBlockquote();
      const text = line.replace(/^#{4}\s/, '');
      out.push(`<h4 id="${slugifyHeading(text)}" class="text-lg font-semibold text-[#0F2744] mt-6 mb-2 scroll-mt-20">${text}</h4>`);
    } else if (/^#{3}\s/.test(line)) {
      closeList(); closeBlockquote();
      const text = line.replace(/^#{3}\s/, '');
      out.push(`<h3 id="${slugifyHeading(text)}" class="text-xl font-bold text-[#0F2744] mt-8 mb-3 scroll-mt-20">${text}</h3>`);
    } else if (/^#{2}\s/.test(line)) {
      closeList(); closeBlockquote();
      const text = line.replace(/^#{2}\s/, '');
      out.push(`<h2 id="${slugifyHeading(text)}" class="text-2xl font-bold text-[#0F2744] mt-10 mb-4 scroll-mt-20">${text}</h2>`);
    } else if (/^#{1}\s/.test(line)) {
      closeList(); closeBlockquote();
      const text = line.replace(/^#\s/, '');
      out.push(`<h2 id="${slugifyHeading(text)}" class="text-2xl font-bold text-[#0F2744] mt-10 mb-4 scroll-mt-20">${text}</h2>`);
    } else if (/^&gt;\s/.test(line)) {
      closeList();
      if (!inBlockquote) { out.push('<blockquote class="border-l-4 border-blue-300 pl-4 italic text-gray-600 my-4">'); inBlockquote = true; }
      out.push(`<p class="mb-1">${inlineMarkdown(line.replace(/^&gt;\s/, ''))}</p>`);
    } else if (/^---$/.test(line.trim())) {
      closeList(); closeBlockquote();
      out.push('<hr class="my-8 border-gray-200" />');
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

// Build lookup maps for auto-linking locations in blog content
const STATE_BY_CODE = new Map(US_STATES.map(s => [s.code, s]));
const STATE_BY_NAME = new Map(US_STATES.map(s => [s.name.toLowerCase(), s]));

// Match "City, ST" (2-letter code) or "City, State Name" patterns
// City = 1+ capitalized words; State = known code or full name
const CITY_STATE_CODE_RE = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*),\s*([A-Z]{2})\b/g;
const CITY_STATE_NAME_RE = new RegExp(
  `\\b([A-Z][a-zA-Z]+(?:\\s[A-Z][a-zA-Z]+)*),\\s*(${US_STATES.map(s => s.name).join('|')})\\b`,
  'g',
);

function autoLinkLocations(text: string): string {
  // Skip if the text already contains an <a> tag (already linked)
  if (text.includes('<a ')) return text;

  // First pass: "City, ST" (e.g., "Houston, TX")
  let result = text.replace(CITY_STATE_CODE_RE, (match, city, code) => {
    const state = STATE_BY_CODE.get(code);
    if (!state) return match;
    const stateSlug = slugify(state.name);
    const citySlug = slugify(city);
    return `<a href="/state/${stateSlug}/${citySlug}" class="text-blue-600 hover:underline font-medium">${match}</a>`;
  });

  // Second pass: "City, State Name" (e.g., "Houston, Texas")
  result = result.replace(CITY_STATE_NAME_RE, (match, city, stateName) => {
    // Don't double-link
    if (result.includes(`>${match}</a>`)) return match;
    const state = STATE_BY_NAME.get(stateName.toLowerCase());
    if (!state) return match;
    const stateSlug = slugify(state.name);
    const citySlug = slugify(city);
    return `<a href="/state/${stateSlug}/${citySlug}" class="text-blue-600 hover:underline font-medium">${match}</a>`;
  });

  return result;
}

function inlineMarkdown(text: string): string {
  return autoLinkLocations(
    text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="rounded-xl w-full object-cover shadow-sm my-4" />')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-[#0F2744]">$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline font-medium">$1</a>')
  );
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getBlogPost(params.slug);
  if (!post) notFound();

  const { prev, next } = await getAdjacentPosts(post.published_at);

  const takeaways = getTakeaways(post.slug);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description || post.excerpt || '',
    ...(takeaways && takeaways.length > 0 ? { abstract: takeaways.join(' ') } : {}),
    author: {
      '@type': 'Organization',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Touchless Car Wash Finder',
      url: 'https://touchlesscarwashfinder.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://touchlesscarwashfinder.com/logo.png',
      },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    ...(post.featured_image_url ? { image: post.featured_image_url } : {}),
    keywords: post.tags?.join(', ') ?? '',
    url: `https://touchlesscarwashfinder.com/blog/${post.slug}`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://touchlesscarwashfinder.com/blog/${post.slug}`,
    },
  };

  // Dynamic content for the top-10 chains post — regenerated on each revalidate
  // so location counts and chain rankings always reflect live DB state.
  let content: string;
  if (post.slug === 'top-10-touchless-car-wash-chains') {
    content = await generateTop10ChainsContent();
  } else if (post.slug === 'best-touchless-car-wash-subscriptions-2026') {
    content = await generateSubscriptionsContent();
  } else {
    content = post.content;
  }
  const renderedContent = renderMarkdown(content);
  const blogVideos = await getTouchlessVideoPool();

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://touchlesscarwashfinder.com/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `https://touchlesscarwashfinder.com/blog/${post.slug}` },
    ],
  };

  const howTo = getHowTo(post.slug);
  const howToJsonLd = howTo
    ? {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: howTo.name,
        description: howTo.description,
        step: howTo.steps.map((s, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          name: s.name,
          text: s.text,
        })),
      }
    : null;

  // Dataset JSON-LD — only present on posts that publish original statistical
  // research (currently just the touchless statistics post). Tells Google
  // Dataset Search and AI scrapers that the page is a citable source of
  // structured data, so they link to specific anchored stats instead of
  // pattern-matching to unrelated city pages.
  const datasetJsonLd = getBlogDatasetJsonLd({
    slug: post.slug,
    title: post.title,
    description: post.meta_description || post.excerpt || '',
    datePublished: post.published_at ?? new Date().toISOString(),
    dateModified: post.updated_at ?? post.published_at ?? new Date().toISOString(),
  });

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {howToJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
        />
      )}
      {datasetJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }}
        />
      )}

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
        {takeaways && takeaways.length > 0 && (
          <aside
            aria-labelledby="key-takeaways-heading"
            className="mb-10 rounded-2xl border border-[#22C55E]/20 bg-gradient-to-br from-[#F0F9FF] to-[#ECFDF5] p-6 md:p-7"
          >
            <h2
              id="key-takeaways-heading"
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-[#0F2744] mb-4"
            >
              <Sparkles className="w-4 h-4 text-[#22C55E]" />
              Key Takeaways
            </h2>
            <ul className="space-y-3">
              {takeaways.map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-gray-800">
                  <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <article
          className="prose-content"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {blogVideos.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <TouchlessVideoModule
              videos={blogVideos}
              location="blog"
              heading="Watch a Touchless Wash in Action"
              subheading="No brushes, no contact — just high-pressure water and detergents doing the work."
            />
          </div>
        )}

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
