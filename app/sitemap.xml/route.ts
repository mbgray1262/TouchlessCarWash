import { supabase } from '@/lib/supabase';
import { US_STATES, getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS, boundingBox, haversineDistance } from '@/lib/metro-areas';
import { FEATURES } from '@/lib/features';
import { EQUIPMENT_BRAND_DATA, EQUIPMENT_MODEL_DATA } from '@/lib/equipment-data';

const VALID_STATE_CODES = new Set(US_STATES.map(s => s.code));

export async function GET() {
  const baseUrl = 'https://touchlesscarwashfinder.com';
  const now = new Date().toISOString();

  // Paginate past Supabase's default 1000-row limit
  const allListings: Array<{ slug: string; city: string; state: string; created_at: string; updated_at: string | null; latitude: number | null; longitude: number | null }> = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('listings')
      .select('slug, city, state, created_at, updated_at, latitude, longitude')
      .eq('is_touchless', true)
      .range(offset, offset + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allListings.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Filter to only valid US states (prevents non-US listings from polluting sitemap)
  const listings = allListings.filter(l => VALID_STATE_CODES.has(l.state));

  const { data: blogPosts } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .lte('published_at', now);

  // Derive unique states and cities from listings, tracking listing counts per city
  const stateSet = new Set<string>();
  const citySet = new Set<string>();
  const cityCount = new Map<string, number>();
  for (const l of listings || []) {
    stateSet.add(l.state);
    const cityKey = `${l.state}||${l.city}`;
    citySet.add(cityKey);
    cityCount.set(cityKey, (cityCount.get(cityKey) ?? 0) + 1);
  }

  // Calculate most recent listing date per state and per city (prefer updated_at)
  const stateLastmod = new Map<string, string>();
  const cityLastmod = new Map<string, string>();
  for (const l of listings) {
    const ts = l.updated_at ?? l.created_at;
    const existing = stateLastmod.get(l.state);
    if (!existing || ts > existing) stateLastmod.set(l.state, ts);
    const cityKey = `${l.state}||${l.city}`;
    const existingCity = cityLastmod.get(cityKey);
    if (!existingCity || ts > existingCity) cityLastmod.set(cityKey, ts);
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

  // Include all city pages with at least 1 listing in the sitemap.
  const cityUrls = Array.from(citySet)
    .filter((key) => (cityCount.get(key) ?? 0) >= 1)
    .map((key) => {
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
    <lastmod>${listing.updated_at ?? listing.created_at}</lastmod>
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

  // Best Of metro area pages — only include metros with 5+ listings (matching the page threshold)
  const geoListings = listings.filter(l => l.latitude != null && l.longitude != null) as Array<typeof listings[number] & { latitude: number; longitude: number }>;
  const bestOfUrls: string[] = [];
  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
    let count = 0;
    for (const l of geoListings) {
      if (l.latitude >= box.minLat && l.latitude <= box.maxLat && l.longitude >= box.minLng && l.longitude <= box.maxLng) {
        if (haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles) count++;
      }
      if (count >= 5) break; // Early exit — we only need to know ≥5
    }
    if (count >= 5) {
      bestOfUrls.push(`  <url>
    <loc>${baseUrl}/best/${metro.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`);
    }
  }

  // Feature pages
  const featureIndexUrl = `  <url>
    <loc>${baseUrl}/features</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  const featureHubUrls = FEATURES.map((f) => `  <url>
    <loc>${baseUrl}/features/${f.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

  // Only include feature/state pages with 3+ listings (matching the page's notFound() threshold)
  const featureStateUrls: string[] = [];
  for (const feature of FEATURES) {
    const { data } = await supabase.rpc('feature_state_counts', { p_filter_slug: feature.slug });
    if (data) {
      for (const row of data as { state: string; count: number }[]) {
        if (row.count >= 3) {
          featureStateUrls.push(`  <url>
    <loc>${baseUrl}/features/${feature.slug}/${getStateSlug(row.state)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
        }
      }
    }
  }

  // Equipment pages — index, brand pages, and model pages
  const equipmentUrls: string[] = [];
  equipmentUrls.push(`  <url>
    <loc>${baseUrl}/equipment</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

  // Get equipment brand counts to only include brands with listings
  const { data: brandCounts } = await supabase
    .from('listings')
    .select('equipment_brand')
    .eq('is_touchless', true)
    .not('equipment_brand', 'is', null);

  const brandCountMap = new Map<string, number>();
  for (const row of brandCounts || []) {
    brandCountMap.set(row.equipment_brand, (brandCountMap.get(row.equipment_brand) ?? 0) + 1);
  }

  for (const brand of EQUIPMENT_BRAND_DATA) {
    if ((brandCountMap.get(brand.slug) ?? 0) >= 2) {
      equipmentUrls.push(`  <url>
    <loc>${baseUrl}/equipment/${brand.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }
  }

  // Get model counts
  const { data: modelCounts } = await supabase
    .from('listings')
    .select('equipment_brand, equipment_model')
    .eq('is_touchless', true)
    .not('equipment_brand', 'is', null)
    .not('equipment_model', 'is', null);

  const modelCountMap = new Map<string, number>();
  for (const row of modelCounts || []) {
    const key = `${row.equipment_brand}||${row.equipment_model}`;
    modelCountMap.set(key, (modelCountMap.get(key) ?? 0) + 1);
  }

  for (const model of EQUIPMENT_MODEL_DATA) {
    const brand = EQUIPMENT_BRAND_DATA.find(b => b.slug === model.brandSlug);
    if (!brand) continue;
    const key = `${model.brandSlug}||${model.name}`;
    if ((modelCountMap.get(key) ?? 0) >= 2) {
      equipmentUrls.push(`  <url>
    <loc>${baseUrl}/equipment/${model.brandSlug}/${model.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }
  }

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
  <url>
    <loc>${baseUrl}/dataset</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacy-policy</loc>
    <lastmod>${now}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/terms-of-service</loc>
    <lastmod>${now}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/add-listing</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
${bestOfUrls.join('\n')}
${featureIndexUrl}
${featureHubUrls.join('\n')}
${featureStateUrls.join('\n')}
${equipmentUrls.join('\n')}
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
