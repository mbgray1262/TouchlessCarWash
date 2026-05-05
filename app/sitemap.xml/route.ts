import { supabase } from '@/lib/supabase';
import { US_STATES, getStateSlug, slugify } from '@/lib/constants';
import { METRO_AREAS, boundingBox, haversineDistance } from '@/lib/metro-areas';
import { FEATURES } from '@/lib/features';
import { EQUIPMENT_BRAND_DATA, EQUIPMENT_MODEL_DATA } from '@/lib/equipment-data';
import { CHAINS } from '@/lib/chains';
import { isThinListing } from '@/lib/listing-quality';
import { NEARBY_RADIUS_MILES, INDEXABLE_MIN_EFFECTIVE } from '@/lib/nearby-augment';

const VALID_STATE_CODES = new Set(US_STATES.map(s => s.code));

export async function GET() {
  const baseUrl = 'https://touchlesscarwashfinder.com';
  const now = new Date().toISOString();

  // Paginate past Supabase's default 1000-row limit. We fetch the quality-check
  // fields (rating, review_count, is_claimed, is_featured, and boolean flags for
  // crawl_snapshot/extracted_data presence) so we can filter out thin listings
  // client-side using the same isThinListing() predicate used by the listing
  // detail page. This keeps the sitemap and per-page robots tags in lockstep.
  //
  // We don't fetch crawl_snapshot / extracted_data themselves (too large) —
  // instead we check presence via the .is('field', null) negation. Supabase-js
  // doesn't support selecting "is null" computed columns, so we fetch both
  // rows with non-null values via two queries and mark the listings accordingly.
  type SitemapRow = {
    id: string;
    slug: string;
    city: string;
    state: string;
    created_at: string;
    updated_at: string | null;
    latitude: number | null;
    longitude: number | null;
    rating: number | null;
    review_count: number | null;
    is_claimed: boolean | null;
    is_featured: boolean | null;
    parent_chain: string | null;
    google_description: string | null;
    has_crawl_snapshot?: boolean;
    has_extracted_data?: boolean;
  };
  const allListings: SitemapRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('listings')
      .select('id, slug, city, state, created_at, updated_at, latitude, longitude, rating, review_count, is_claimed, is_featured, parent_chain, google_description, crawl_snapshot, extracted_data')
      .eq('is_touchless', true)
      .eq('is_approved', true)  // exclude held/pending-enrichment listings that 308 instead of 200
      .range(offset, offset + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    // Convert the heavy JSON fields to boolean flags immediately so we don't
    // keep megabytes of snapshot/extracted JSON in memory for every listing.
    for (const row of page) {
      const typed = row as SitemapRow & { crawl_snapshot: unknown; extracted_data: unknown };
      allListings.push({
        id: typed.id,
        slug: typed.slug,
        city: typed.city,
        state: typed.state,
        created_at: typed.created_at,
        updated_at: typed.updated_at,
        latitude: typed.latitude,
        longitude: typed.longitude,
        rating: typed.rating,
        review_count: typed.review_count,
        is_claimed: typed.is_claimed,
        is_featured: typed.is_featured,
        parent_chain: typed.parent_chain,
        google_description: typed.google_description,
        has_crawl_snapshot: typed.crawl_snapshot != null,
        has_extracted_data: typed.extracted_data != null,
      });
    }
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Count review_snippets per listing — only needed for CHAIN listings since
  // non-chain listings don't use the snippet-count signal for indexing. We
  // fetch just the listing_id column (~cheap) and tally in memory instead of
  // doing a per-listing count query (would be 1,000+ round trips).
  const chainListingIds = allListings.filter(l => l.parent_chain).map(l => l.id);
  const snippetCountByListing = new Map<string, number>();
  const SNIPPET_PAGE = 1000;
  let snipOffset = 0;
  while (chainListingIds.length > 0) {
    // in() can handle many IDs but we chunk to stay well under any payload limits
    const chunkStart = snipOffset;
    const chunkEnd = Math.min(snipOffset + 500, chainListingIds.length);
    const idChunk = chainListingIds.slice(chunkStart, chunkEnd);
    if (idChunk.length === 0) break;
    // Paginate rows within the chunk — some listings may have 50+ snippets.
    let rowOffset = 0;
    while (true) {
      const { data: rows } = await supabase
        .from('review_snippets')
        .select('listing_id')
        .in('listing_id', idChunk)
        .eq('is_touchless_evidence', true)
        .range(rowOffset, rowOffset + SNIPPET_PAGE - 1);
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        snippetCountByListing.set(r.listing_id, (snippetCountByListing.get(r.listing_id) ?? 0) + 1);
      }
      if (rows.length < SNIPPET_PAGE) break;
      rowOffset += SNIPPET_PAGE;
    }
    snipOffset = chunkEnd;
    if (chunkEnd >= chainListingIds.length) break;
  }

  // Filter to only valid US states (prevents non-US listings from polluting
  // sitemap) AND filter out thin listings so Google isn't advertised pages we
  // would immediately noindex when it crawled them.
  const listings = allListings.filter(l => {
    if (!VALID_STATE_CODES.has(l.state)) return false;
    if (isThinListing({
      crawl_snapshot: l.has_crawl_snapshot ? {} : null,
      extracted_data: l.has_extracted_data ? {} : null,
      rating: l.rating,
      review_count: l.review_count,
      is_claimed: l.is_claimed,
      is_featured: l.is_featured,
      parent_chain: l.parent_chain,
      google_description: l.google_description,
      review_snippet_count: snippetCountByListing.get(l.id) ?? 0,
    })) return false;
    return true;
  });

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

  // Per-state location counts — feeds both the directory page sitemap entry
  // (always included) and the per-state statistics page sitemap entry (only
  // included when the state has ≥10 approved touchless locations, matching
  // the page's redirect-to-master-stats threshold for sparse states).
  const stateLocationCount = new Map<string, number>();
  for (const l of listings) {
    stateLocationCount.set(l.state, (stateLocationCount.get(l.state) ?? 0) + 1);
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

  // /state/[state]/statistics — only for states with ≥10 approved touchless
  // listings. Sparse states (HI, DC) 308-redirect this URL to the master
  // /blog/touchless-car-wash-statistics post; advertising those redirects
  // in the sitemap would waste crawl budget.
  const STATE_STATS_MIN_LOCATIONS = 10;
  const stateStatsUrls = Array.from(stateSet)
    .filter((code) => (stateLocationCount.get(code) ?? 0) >= STATE_STATS_MIN_LOCATIONS)
    .map((code) => {
      const lastmod = stateLastmod.get(code) ?? now;
      return `  <url>
    <loc>${baseUrl}/state/${getStateSlug(code)}/statistics</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

  // Only include cities whose page will be indexable. The city page noindexes
  // when (in-city + nearby-within-radius) < INDEXABLE_MIN_EFFECTIVE, so the
  // sitemap must mirror that — otherwise we advertise URLs that immediately
  // tell Google not to index them, a contradiction that hurts crawl budget.
  // For cities with enough in-city listings on their own this is a cheap
  // length check; thinner cities require a nearby-count pass over the
  // already-loaded listings array (no extra DB calls).
  const listingsByCity = new Map<string, typeof listings>();
  for (const l of listings) {
    const k = `${l.state}||${l.city}`;
    const arr = listingsByCity.get(k) ?? [];
    arr.push(l);
    listingsByCity.set(k, arr);
  }

  function pickCityAnchor(rows: typeof listings): { lat: number; lng: number } | null {
    for (const r of rows) {
      if (r.latitude != null && r.longitude != null) {
        return { lat: Number(r.latitude), lng: Number(r.longitude) };
      }
    }
    return null;
  }

  function effectiveCityCount(stateCode: string, cityKey: string): number {
    const inCity = listingsByCity.get(cityKey) ?? [];
    if (inCity.length >= INDEXABLE_MIN_EFFECTIVE) return inCity.length;
    const anchor = pickCityAnchor(inCity);
    if (!anchor) return inCity.length;
    const cityName = inCity[0]?.city.toLowerCase().trim();
    const need = INDEXABLE_MIN_EFFECTIVE - inCity.length;
    let nearby = 0;
    for (const l of listings) {
      if (l.state !== stateCode) continue;
      if (l.latitude == null || l.longitude == null) continue;
      if (l.city.toLowerCase().trim() === cityName) continue;
      const d = haversineDistance(anchor.lat, anchor.lng, Number(l.latitude), Number(l.longitude));
      if (d <= NEARBY_RADIUS_MILES) {
        nearby++;
        if (nearby >= need) break;
      }
    }
    return inCity.length + nearby;
  }

  const cityUrls = Array.from(citySet)
    .filter((key) => {
      const [stateCode] = key.split('||');
      return effectiveCityCount(stateCode, key) >= INDEXABLE_MIN_EFFECTIVE;
    })
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

  // Best Of metro area pages — only include metros with 3+ listings (matches the page threshold)
  const geoListings = listings.filter(l => l.latitude != null && l.longitude != null) as Array<typeof listings[number] & { latitude: number; longitude: number }>;
  const bestOfUrls: string[] = [];
  for (const metro of METRO_AREAS) {
    const box = boundingBox(metro.lat, metro.lng, metro.radiusMiles);
    let count = 0;
    for (const l of geoListings) {
      if (l.latitude >= box.minLat && l.latitude <= box.maxLat && l.longitude >= box.minLng && l.longitude <= box.maxLng) {
        if (haversineDistance(metro.lat, metro.lng, l.latitude, l.longitude) <= metro.radiusMiles) count++;
      }
      if (count >= 3) break; // Early exit — we only need to know ≥3
    }
    if (count >= 3) {
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
    .eq('is_approved', true)
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
    .eq('is_approved', true)
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

  // ── Chain pages ──────────────────────────────────────────────────────────────
  const chainUrls: string[] = [];
  chainUrls.push(`  <url>
    <loc>${baseUrl}/chains</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  for (const chain of CHAINS) {
    chainUrls.push(`  <url>
    <loc>${baseUrl}/chain/${chain.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
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
    <loc>${baseUrl}/unlimited-touchless-car-wash</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
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
${chainUrls.join('\n')}
${stateUrls.join('\n')}
${stateStatsUrls.join('\n')}
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
