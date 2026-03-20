import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CandidatePhoto {
  url: string;
  fullResUrl?: string;
  source: 'google_places' | 'google_maps' | 'google_search' | 'bing_search' | 'website' | 'street_view' | 'existing';
  label?: string;
  sourceUrl?: string;
  googlePhotoName?: string;
  streetviewPano?: string;
  width?: number;
  height?: number;
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ── Blocked domains (real estate, stock photos, irrelevant) ──────────────────
const BLOCKED_DOMAINS = [
  // Real estate
  'zillow', 'zillowstatic', 'redfin', 'rdcpix', 'trulia', 'realtor.com',
  'apartments.com', 'apartmentfinder', 'hotpads', 'rent.com', 'homesnap',
  'homes.com', 'movoto', 'estately', 'compass.com', 'coldwellbanker',
  'century21', 'keller', 'remax',
  // Commercial real estate
  'loopnet', 'crexi.com', 'commercialcafe', 'showcase', 'showcaseidx',
  'costar', 'cityfeet', 'catylist', 'buildout.com', 'officespace.com',
  // Stock photos
  'shutterstock', 'istockphoto', 'gettyimages', 'dreamstime', 'alamy',
  'depositphotos', 'stock.adobe', '123rf',
  // E-commerce
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com',
  // Social (not useful for car wash photos)
  'linkedin.com', 'twitter.com', 'tiktok.com', 'pinterest.com', 'pinimg.com',
  // App stores
  'play.google.com', 'apps.apple.com', 'play-lh.googleusercontent',
  // Maps / directories that return generic images
  'mapquest.com', 'yellowpages.com', 'whitepages.com', 'superpages.com',
  'manta.com', 'bbb.org', 'chamberofcommerce',
];

const BLOCKED_URL_PATTERNS = [
  '/logo', '_logo', '-logo', '/icon', 'favicon', '/brand',
  'badge', 'coupon', 'banner', 'graphic', 'clipart', 'vector',
];

function isBlockedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg') || lower.endsWith('.gif') || lower.endsWith('.ico')) return true;
  for (const d of BLOCKED_DOMAINS) { if (lower.includes(d)) return true; }
  for (const p of BLOCKED_URL_PATTERNS) { if (lower.includes(p)) return true; }
  return false;
}

// ── Google Places photos (paid API — only if key is set) ─────────────────────
async function fetchGooglePlacesPhotos(placeId: string, apiKey: string): Promise<CandidatePhoto[]> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const photoRefs = data.photos ?? [];

    const resolved = await Promise.all(
      photoRefs.slice(0, 10).map(async (photo: { name: string; widthPx: number; heightPx: number; authorAttributions?: Array<{ displayName: string }> }) => {
        try {
          const thumbRes = await fetch(
            `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}&skipHttpRedirect=true`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!thumbRes.ok) return null;
          const thumbData = await thumbRes.json();
          if (!thumbData.photoUri) return null;

          const fullRes = await fetch(
            `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=1600&maxWidthPx=1600&key=${apiKey}&skipHttpRedirect=true`,
            { signal: AbortSignal.timeout(5000) },
          );
          const fullResData = fullRes.ok ? await fullRes.json() : null;

          return {
            url: thumbData.photoUri,
            fullResUrl: fullResData?.photoUri ?? thumbData.photoUri,
            source: 'google_places' as const,
            label: photo.authorAttributions?.[0]?.displayName ?? 'Google Places',
            googlePhotoName: photo.name,
            width: photo.widthPx,
            height: photo.heightPx,
          };
        } catch { return null; }
      }),
    );

    return resolved.filter(Boolean) as CandidatePhoto[];
  } catch { return []; }
}

// ── Google Maps Photos scraping (FREE — no API key) ──────────────────────────
// Uses multiple approaches to extract user-uploaded photos from Google Maps
async function fetchGoogleMapsPhotos(
  placeId: string, name: string, city: string, state: string,
): Promise<CandidatePhoto[]> {
  const photoUrls = new Set<string>();
  const mapsPageUrl = `https://www.google.com/maps/place/?q=place_id:${placeId}`;

  // Approach 1: Fetch the Maps place page and extract photo URLs from inline data
  try {
    const res = await fetch(mapsPageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (res.ok) {
      const html = await res.text();

      // Google Maps includes photo data in APP_INITIALIZATION_STATE and other script blocks
      // Look for all googleusercontent photo URLs
      const patterns = [
        /https:\/\/lh[35]\.googleusercontent\.com\/p\/[A-Za-z0-9_-]+/g,
        /https:\/\/lh[35]\.googleusercontent\.com\/gps-proxy\/[A-Za-z0-9_=/-]+/g,
        /https:\/\/lh[35]\.googleusercontent\.com\/proxy\/[A-Za-z0-9_=/-]+/g,
        // Escaped URLs in JSON/JS (\\u003d = =, \\u0026 = &)
        /https:\\u002F\\u002Flh[35]\.googleusercontent\.com\\u002Fp\\u002F[A-Za-z0-9_-]+/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          let url = match[0]
            .replace(/\\u002F/g, '/')
            .replace(/\\u003D/g, '=')
            .replace(/\\u0026/g, '&');
          // Clean any trailing escape chars
          url = url.replace(/\\.*$/, '');
          photoUrls.add(url);
        }
      }
    }
  } catch (err) {
    console.error('Google Maps page fetch failed:', err);
  }

  // Approach 2: Try Google Maps search results page (sometimes returns photos in a different format)
  if (photoUrls.size === 0) {
    try {
      const searchQuery = encodeURIComponent(`${name} ${city} ${state}`);
      const searchUrl = `https://www.google.com/maps/search/${searchQuery}/`;
      const res = await fetch(searchUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (res.ok) {
        const html = await res.text();
        const pattern = /https:\/\/lh[35]\.googleusercontent\.com\/p\/[A-Za-z0-9_-]+/g;
        let match;
        while ((match = pattern.exec(html)) !== null) {
          photoUrls.add(match[0]);
        }
        // Also check for gps-proxy pattern
        const pattern2 = /https:\/\/lh[35]\.googleusercontent\.com\/gps-proxy\/[A-Za-z0-9_=/-]+/g;
        while ((match = pattern2.exec(html)) !== null) {
          photoUrls.add(match[0].replace(/\\.*$/, ''));
        }
      }
    } catch {
      // Silently fail — this is a backup approach
    }
  }

  console.log(`[Google Maps] ${name}: found ${photoUrls.size} photo URLs`);

  const photos: CandidatePhoto[] = [];
  for (const url of photoUrls) {
    if (photos.length >= 10) break;
    // Skip street view URLs
    if (url.includes('streetview') || url.includes('cbk0')) continue;
    // Create thumbnail (w400) and full-res (w1600) versions
    const baseUrl = url.replace(/=.*$/, '');
    const thumbUrl = `${baseUrl}=w400-h300`;
    const fullUrl = `${baseUrl}=w1600-h1200`;
    photos.push({
      url: thumbUrl,
      fullResUrl: fullUrl,
      source: 'google_maps' as const,
      label: 'Google Maps',
      sourceUrl: mapsPageUrl,
    });
  }

  return photos;
}

// ── Google Image Search (FREE — HTML scraping) ───────────────────────────────
async function fetchGoogleImages(
  name: string, city: string, state: string,
  address?: string,
): Promise<CandidatePhoto[]> {
  try {
    const nameHasCarWash = name.toLowerCase().includes('car wash') || name.toLowerCase().includes('carwash');
    const locationParts = [city, state];
    if (address) locationParts.unshift(address);
    const searchTerms = `"${name}" ${locationParts.join(' ')}${nameHasCarWash ? '' : ' car wash'}`;
    const query = encodeURIComponent(searchTerms);

    const res = await fetch(
      `https://www.google.com/search?q=${query}&tbm=isch&hl=en`,
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
    );
    if (!res.ok) return [];
    const html = await res.text();

    // Google Images embeds image data in script tags as JSON arrays
    // Extract image URLs from various patterns
    const imageUrls: Array<{ url: string; sourceUrl?: string }> = [];

    // Pattern 1: Direct image URLs in data attributes and scripts
    // Google uses base64 thumbnails inline but links to original images
    const imgRegex = /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)",\s*(\d+),\s*(\d+)\]/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
      const width = parseInt(match[2]);
      const height = parseInt(match[3]);
      // Skip tiny images (thumbnails, icons)
      if (width > 200 && height > 200) {
        imageUrls.push({ url });
      }
    }

    // Pattern 2: og-image style URLs embedded in the page
    const altImgRegex = /\["(https?:\/\/(?:lh[35]\.googleusercontent|encrypted-tbn0\.gstatic)\.com\/[^"]+)"/g;
    while ((match = altImgRegex.exec(html)) !== null) {
      const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
      if (!url.includes('=s') || url.includes('=s1') || url.includes('=w')) {
        imageUrls.push({ url });
      }
    }

    // Pattern 3: Source page URLs paired with images
    const sourceRegex = /\["(https?:\/\/(?!(?:www\.)?google\.com)[^"]+)",\s*\d+,\s*\d+,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*"([^"]+)"/g;
    while ((match = sourceRegex.exec(html)) !== null) {
      // match[2] is often the source page
    }

    const seen = new Set<string>();
    const cityLower = city.toLowerCase();
    const stateLower = state.toLowerCase();

    return imageUrls
      .filter((r) => {
        if (!r.url || seen.has(r.url)) return false;
        seen.add(r.url);
        if (isBlockedUrl(r.url)) return false;
        // Skip Google's own thumbnail proxy URLs (they're low res)
        if (r.url.includes('encrypted-tbn0.gstatic.com')) return false;
        return true;
      })
      .slice(0, 8)
      .map((r) => {
        let label = 'Google';
        try {
          const domain = new URL(r.url).hostname.replace('www.', '');
          label = domain.length > 20 ? domain.slice(0, 20) : domain;
          if (domain.includes('yelp')) label = 'Yelp';
          if (domain.includes('facebook') || domain.includes('fbsbx')) label = 'Facebook';
          if (domain.includes('instagram')) label = 'Instagram';
          if (domain.includes('googleusercontent')) label = 'Google';
        } catch { /* ignore */ }

        return {
          url: r.url,
          fullResUrl: r.url,
          source: 'google_search' as const,
          label,
          sourceUrl: r.sourceUrl,
        };
      });
  } catch (err) {
    console.error('Google Image Search failed:', err);
    return [];
  }
}

// ── Bing Image Search (FREE fallback) ────────────────────────────────────────
async function fetchBingImages(
  name: string, city: string, state: string,
  address?: string,
): Promise<CandidatePhoto[]> {
  try {
    const nameHasCarWash = name.toLowerCase().includes('car wash') || name.toLowerCase().includes('carwash');
    const locationParts = [city, state];
    if (address) locationParts.unshift(address);
    const query = encodeURIComponent(`"${name}" ${locationParts.join(' ')}${nameHasCarWash ? '' : ' car wash'}`);
    const res = await fetch(
      `https://www.bing.com/images/search?q=${query}&first=1`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': BROWSER_UA },
      },
    );
    if (!res.ok) return [];
    const html = await res.text();

    const mediaUrlMatches = html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g);
    const pageUrlMatches = html.matchAll(/purl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g);
    const mediaUrls: string[] = [];
    const pageUrls: string[] = [];
    for (const match of mediaUrlMatches) mediaUrls.push(decodeURIComponent(match[1]));
    for (const match of pageUrlMatches) pageUrls.push(decodeURIComponent(match[1]));

    const results: Array<{ original: string; pageUrl?: string }> = [];
    for (let i = 0; i < mediaUrls.length; i++) {
      results.push({ original: mediaUrls[i], pageUrl: pageUrls[i] });
    }

    const seen = new Set<string>();

    return results
      .filter((r) => {
        if (!r.original || seen.has(r.original)) return false;
        seen.add(r.original);
        if (isBlockedUrl(r.original)) return false;
        return true;
      })
      .slice(0, 6)
      .map((r) => {
        const domain = new URL(r.original).hostname.replace('www.', '');
        let label = domain.length > 20 ? domain.slice(0, 20) : domain;
        if (domain.includes('yelp')) label = 'Yelp';
        if (domain.includes('facebook') || domain.includes('fbsbx')) label = 'Facebook';
        if (domain.includes('instagram')) label = 'Instagram';

        return {
          url: r.original,
          fullResUrl: r.original,
          source: 'bing_search' as const,
          label,
          sourceUrl: r.pageUrl,
        };
      });
  } catch { return []; }
}

// ── Website photos (lightweight HTML scrape) ─────────────────────────────────
async function fetchWebsitePhotos(websiteUrl: string): Promise<CandidatePhoto[]> {
  if (!websiteUrl) return [];
  try {
    const res = await fetch(websiteUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TouchlessCarWashFinder/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const ogRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
    const urls = new Set<string>();

    let match;
    while ((match = imgRegex.exec(html)) !== null) urls.add(match[1]);
    while ((match = ogRegex.exec(html)) !== null) urls.add(match[1]);

    const skipPatterns = /favicon|logo|icon|badge|sprite|spacer|pixel|tracking|social|widget|banner|button|nav|arrow|tiny|1x1|blank|svg|emoji|smiley|star-rating|rating|checkbox|radio|toggle|spinner|loader|placeholder|avatar|profile-pic|thumbnail-placeholder|gradient|pattern|divider/i;
    const skipExtensions = /\.(svg|gif|ico|bmp|cur)(\?|$)/i;
    const imageExts = /\.(jpg|jpeg|png|webp)/i;

    const imgWithSizeRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(width|height)=["']?(\d+)/gi;
    const smallImages = new Set<string>();
    let sizeMatch;
    while ((sizeMatch = imgWithSizeRegex.exec(html)) !== null) {
      const dim = parseInt(sizeMatch[3]);
      if (dim > 0 && dim < 150) smallImages.add(sizeMatch[1]);
    }

    const hostname = new URL(websiteUrl).hostname.replace('www.', '');
    const photos: CandidatePhoto[] = [];
    for (const rawUrl of urls) {
      if (skipPatterns.test(rawUrl)) continue;
      if (skipExtensions.test(rawUrl)) continue;
      if (smallImages.has(rawUrl)) continue;
      if (rawUrl.startsWith('data:')) continue;

      let fullUrl = rawUrl;
      if (rawUrl.startsWith('//')) fullUrl = 'https:' + rawUrl;
      else if (rawUrl.startsWith('/')) {
        try { fullUrl = new URL(rawUrl, websiteUrl).href; } catch { continue; }
      } else if (!rawUrl.startsWith('http')) continue;

      if (!imageExts.test(fullUrl)) continue;

      const filename = fullUrl.split('/').pop()?.split('?')[0] ?? '';
      if (filename.length < 5) continue;

      photos.push({
        url: fullUrl,
        source: 'website',
        label: hostname,
        sourceUrl: websiteUrl,
      });

      if (photos.length >= 10) break;
    }

    return photos;
  } catch { return []; }
}

// ── Street View thumbnail ────────────────────────────────────────────────────
async function fetchStreetViewThumbnail(
  lat: number, lng: number, apiKey: string,
): Promise<CandidatePhoto | null> {
  try {
    const metaRes = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (meta.status !== 'OK' || !meta.pano_id) return null;

    const thumbUrl = `https://maps.googleapis.com/maps/api/streetview?size=400x300&pano=${meta.pano_id}&heading=0&pitch=0&key=${apiKey}`;

    return {
      url: thumbUrl,
      source: 'street_view',
      label: 'Street View',
      streetviewPano: `${meta.pano_id}:0`,
    };
  } catch { return null; }
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'POST required' }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const { listing_id } = body;
  if (!listing_id) return json({ error: 'listing_id required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

  // Fetch listing data
  const { data: listing } = await supabase
    .from('listings')
    .select('id, name, address, city, state, google_place_id, website, latitude, longitude, hero_image, hero_image_source, photos, street_view_url, blocked_photos')
    .eq('id', listing_id)
    .maybeSingle();

  if (!listing) return json({ error: 'Listing not found' }, 404);

  const blocked = new Set(listing.blocked_photos ?? []);

  // Fire all sources in parallel
  // Priority: Google Maps scraping (free) > Google Places API (paid, only if key set) > Google Image Search > Bing > Website
  const [googleMaps, googlePlaces, googleSearch, bingSearch, websitePhotos, streetView] = await Promise.allSettled([
    listing.google_place_id ? fetchGoogleMapsPhotos(listing.google_place_id, listing.name, listing.city, listing.state) : Promise.resolve([]),
    (listing.google_place_id && googleApiKey) ? fetchGooglePlacesPhotos(listing.google_place_id, googleApiKey) : Promise.resolve([]),
    fetchGoogleImages(listing.name, listing.city, listing.state, listing.address),
    fetchBingImages(listing.name, listing.city, listing.state, listing.address),
    listing.website ? fetchWebsitePhotos(listing.website) : Promise.resolve([]),
    (listing.latitude && listing.longitude && googleApiKey) ? fetchStreetViewThumbnail(listing.latitude, listing.longitude, googleApiKey) : Promise.resolve(null),
  ]);

  // Collect existing photos
  const existing: CandidatePhoto[] = [];
  if (listing.hero_image) {
    existing.push({
      url: listing.hero_image,
      source: 'existing',
      label: `Hero (${listing.hero_image_source ?? 'unknown'})`,
    });
  }
  for (const url of (listing.photos ?? [])) {
    if (url !== listing.hero_image) {
      existing.push({ url, source: 'existing', label: 'Gallery' });
    }
  }

  // Combine all candidates, dedup by URL, remove blocked
  const allCandidates: CandidatePhoto[] = [];
  const seenUrls = new Set<string>();

  function addPhotos(photos: CandidatePhoto[]) {
    for (const p of photos) {
      const key = p.url.split('?')[0];
      if (seenUrls.has(key) || blocked.has(p.url)) continue;
      seenUrls.add(key);
      allCandidates.push(p);
    }
  }

  // Add in priority order: existing > Google Maps (free) > Google Places (paid) > Google Search > Bing > Website > Street View
  addPhotos(existing);
  addPhotos(googleMaps.status === 'fulfilled' ? googleMaps.value : []);
  addPhotos(googlePlaces.status === 'fulfilled' ? googlePlaces.value : []);
  addPhotos(googleSearch.status === 'fulfilled' ? googleSearch.value : []);
  addPhotos(bingSearch.status === 'fulfilled' ? bingSearch.value : []);
  addPhotos(websitePhotos.status === 'fulfilled' ? websitePhotos.value : []);

  const svResult = streetView.status === 'fulfilled' ? streetView.value : null;
  if (svResult) addPhotos([svResult]);

  // Log source counts for debugging
  const gMapsCount = googleMaps.status === 'fulfilled' ? googleMaps.value.length : 0;
  const gSearchCount = googleSearch.status === 'fulfilled' ? googleSearch.value.length : 0;
  const bingCount = bingSearch.status === 'fulfilled' ? bingSearch.value.length : 0;
  console.log(`[photo-discover] ${listing.name}: maps=${gMapsCount} search=${gSearchCount} bing=${bingCount} website=${websitePhotos.status === 'fulfilled' ? websitePhotos.value.length : 0}`);

  return json({
    candidates: allCandidates,
    total: allCandidates.length,
    sources: {
      existing: existing.length,
      google_maps: gMapsCount,
      google_places: googlePlaces.status === 'fulfilled' ? googlePlaces.value.length : 0,
      google_search: gSearchCount,
      bing_search: bingCount,
      website: websitePhotos.status === 'fulfilled' ? websitePhotos.value.length : 0,
      street_view: svResult ? 1 : 0,
    },
    listing: {
      name: listing.name,
      city: listing.city,
      state: listing.state,
      latitude: listing.latitude,
      longitude: listing.longitude,
      google_place_id: listing.google_place_id,
    },
  });
});
