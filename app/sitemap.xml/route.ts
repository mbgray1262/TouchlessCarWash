import { supabase } from '@/lib/supabase';
import { getStateSlug, slugify } from '@/lib/constants';

export async function GET() {
  const baseUrl = 'https://touchlesscarwashfinder.com';
  const now = new Date().toISOString();

  const { data: listings } = await supabase
    .from('listings')
    .select('slug, city, state, created_at')
    .eq('is_touchless', true);

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

  const stateUrls = Array.from(stateSet).map((code) => {
    return `  <url>
    <loc>${baseUrl}/state/${getStateSlug(code)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  const cityUrls = Array.from(citySet).map((key) => {
    const [stateCode, city] = key.split('||');
    return `  <url>
    <loc>${baseUrl}/state/${getStateSlug(stateCode)}/${slugify(city)}</loc>
    <lastmod>${now}</lastmod>
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
