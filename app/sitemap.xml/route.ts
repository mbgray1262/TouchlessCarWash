import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS } from '@/lib/metro-areas';

export async function GET() {
  const baseUrl = 'https://touchlesscarwashfinder.com';
  const now = new Date().toISOString();

  // Paginate past Supabase's default 1000-row limit
  const listings: Array<{ slug: string; city: string; state: string; created_at: string }> = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('listings')
      .select('slug, city, state, created_at')
      .eq('is_touchless', true)
      .range(offset, offset + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    listings.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const { data: blogPosts } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .lte('published_at', now);

  // Derive unique states and cities from listings
  const stateSet = new Set<string>();
  const citySet = new Set<string>();
  for (const l of listings || []) {
    stateSet.add(l.state);
    citySet.add(`${l.state}||${l.city}`);
  }

  // Calculate most recent listing date per state and per city
  const stateLastmod = new Map<string, string>();
  const cityLastmod = new Map<string, string>();
  for (const l of listings) {
    const existing = stateLastmod.get(l.state);
    if (!existing || l.created_at > existing) stateLastmod.set(l.state, l.created_at);
    const cityKey = `${l.state}||${l.city}`;
    const existingCity = cityLastmod.get(cityKey);
    if (!existingCity || l.created_at > existingCity) cityLastmod.set(cityKey, l.created_at);
  }

  const stateUrls = Array.from(stateSet).map((code) => {
    const lastmod = stateLastmod.get(code) ?? now;
    return `  <url>
    <loc>${baseUrl}/state/${getStateSlug(code)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  const cityUrls = Array.from(citySet).map((key) => {
    const [stateCode, city] = key.split('||');
    const lastmod = cityLastmod.get(key) ?? now;
    return `  <url>
    <loc>${baseUrl}/state/${getStateSlug(stateCode)}/${slugify(city)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  const listingUrls = (listings || []).map((listing) => {
    const stateSlug = getStateSlug(listing.state);
    const citySlug = slugify(listing.city);
    return `  <url>
    <loc>${baseUrl}/state/${stateSlug}/${citySlug}/${listing.slug}</loc>
    <lastmod>${listing.created_at}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
  });

  const blogUrls = (blogPosts || []).map((post) => {
    return `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${post.published_at}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
  });

  // Best Of metro area pages
  const bestOfUrls = METRO_AREAS.map((metro) => {
    return `  <url>
    <loc>${baseUrl}/best/${metro.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/states</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/best</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${bestOfUrls.join('\n')}
${stateUrls.join('\n')}
${cityUrls.join('\n')}
${listingUrls.join('\n')}
${blogUrls.join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
