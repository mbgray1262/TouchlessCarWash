import { supabase } from '@/lib/supabase';

export async function GET() {
  const baseUrl = 'https://touchlesscarwashfinder.com';

  const { data: listings } = await supabase
    .from('listings')
    .select('slug, city, state, created_at')
    .eq('is_approved', true);

  const { data: blogPosts } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .lte('published_at', new Date().toISOString());

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/add-listing</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  ${(listings || [])
    .map((listing) => {
      const stateSlug = listing.state.toLowerCase();
      const citySlug = listing.city.toLowerCase().replace(/\s+/g, '-');
      return `  <url>
    <loc>${baseUrl}/car-washes/${stateSlug}/${citySlug}/${listing.slug}</loc>
    <lastmod>${listing.created_at}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
    })
    .join('\n')}
  ${(blogPosts || [])
    .map((post) => {
      return `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${post.published_at}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
    })
    .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
