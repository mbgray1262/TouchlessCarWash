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
  fullResUrl?: string;    // high-res version for saving (url is thumbnail for fast display)
  source: 'google_places' | 'google_search' | 'bing_search' | 'website' | 'street_view' | 'existing';
  label?: string;         // author, domain, etc.
  sourceUrl?: string;      // link to the page where the photo was found
  googlePhotoName?: string; // for Google Places rehosting
  streetviewPano?: string;  // pano:heading for Street View capture
  width?: number;
  height?: number;
}

// ── Google Places photos ────────────────────────────────────────
async function fetchGooglePlacesPhotos(placeId: string, apiKey: string): Promise<CandidatePhoto[]> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const photoRefs = data.photos ?? [];

    // Resolve photo URLs in parallel (w400 thumbnail for fast display, w1600 for saving)
    const resolved = await Promise.all(
      photoRefs.slice(0, 10).map(async (photo: { name: string; widthPx: number; heightPx: number; authorAttributions?: Array<{ displayName: string }> }) => {
        try {
          // Fetch thumbnail (400px) for fast grid display
          const thumbRes = await fetch(
            `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}&skipHttpRedirect=true`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!thumbRes.ok) return null;
          const thumbData = await thumbRes.json();
          if (!thumbData.photoUri) return null;

          // Build full-res URL (1600px) for saving — same pattern, just larger
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

// ── Bing Image Search (free, no API key needed) ─────────────────────────────────
async function fetchBingImages(
  name: string, city: string, state: string,
  address?: string,
): Promise<CandidatePhoto[]> {
  try {
    const nameHasCarWash = name.toLowerCase().includes('car wash') || name.toLowerCase().includes('carwash');
    const locationPart = address ? `"${address}"` : `${city} ${state}`;
    const query = encodeURIComponent(`${name} ${locationPart}${nameHasCarWash ? '' : ' car wash'}`);
    const res = await fetch(
      `https://www.bing.com/images/search?q=${query}&first=1`,
      {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      },
    );
    if (!res.ok) return [];
    const html = await res.text();

    // Extract full-res media URLs AND source page URLs from Bing's encoded data
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
        if (!r.original) return false;
        if (seen.has(r.original)) return false;
        seen.add(r.original);
        const url = r.original.toLowerCase();

        // Filter out non-photo file types
        if (url.endsWith('.svg') || url.endsWith('.gif') || url.endsWith('.ico')) return false;
        if (url.includes('/logo') || url.includes('_logo') || url.includes('-logo')) return false;
        if (url.includes('/icon') || url.includes('favicon') || url.includes('/brand')) return false;
        if (url.includes('badge') || url.includes('coupon') || url.includes('banner')) return false;
        if (url.includes('graphic') || url.includes('clipart') || url.includes('vector')) return false;
        if (url.includes('play.google.com') || url.includes('apps.apple.com')) return false;
        if (url.includes('play-lh.googleusercontent')) return false;

        return true;
      })
      .slice(0, 8)
      .map((r) => {
        // Determine source label from URL domain
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

// ── Website photos (lightweight HTML scrape) ────────────────────
async function fetchWebsitePhotos(websiteUrl: string): Promise<CandidatePhoto[]> {
  if (!websiteUrl) return [];
  try {
    const res = await fetch(websiteUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TouchlessCarWashFinder/1.0)' },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Extract image URLs from <img> tags and og:image meta tags
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const ogRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
    const urls = new Set<string>();

    let match;
    while ((match = imgRegex.exec(html)) !== null) urls.add(match[1]);
    while ((match = ogRegex.exec(html)) !== null) urls.add(match[1]);

    // Filter to likely real PHOTOS (not logos, icons, graphics)
    const skipPatterns = /favicon|logo|icon|badge|sprite|spacer|pixel|tracking|social|widget|banner|button|nav|arrow|tiny|1x1|blank|svg|emoji|smiley|star-rating|rating|checkbox|radio|toggle|spinner|loader|placeholder|avatar|profile-pic|thumbnail-placeholder|gradient|pattern|divider/i;
    const skipExtensions = /\.(svg|gif|ico|bmp|cur)(\?|$)/i;
    const imageExts = /\.(jpg|jpeg|png|webp)/i;

    // Also extract image dimensions from HTML to filter tiny images
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

      // Skip data URIs
      if (rawUrl.startsWith('data:')) continue;

      // Resolve relative URLs
      let fullUrl = rawUrl;
      if (rawUrl.startsWith('//')) fullUrl = 'https:' + rawUrl;
      else if (rawUrl.startsWith('/')) {
        try { fullUrl = new URL(rawUrl, websiteUrl).href; } catch { continue; }
      } else if (!rawUrl.startsWith('http')) continue;

      // Must have a photo extension (skip extensionless CDN URLs that are often icons)
      if (!imageExts.test(fullUrl)) continue;

      // Skip very short filenames (likely icons/logos)
      const filename = fullUrl.split('/').pop()?.split('?')[0] ?? '';
      if (filename.length < 5) continue;

      photos.push({
        url: fullUrl,
        source: 'website',
        label: hostname,
      });

      if (photos.length >= 10) break;
    }

    return photos;
  } catch { return []; }
}

// ── Street View thumbnail ───────────────────────────────────────
async function fetchStreetViewThumbnail(
  lat: number, lng: number, apiKey: string,
): Promise<CandidatePhoto | null> {
  try {
    // Check if Street View is available at this location
    const metaRes = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (meta.status !== 'OK' || !meta.pano_id) return null;

    // Return a thumbnail at heading 0 (user will navigate in the panel)
    const thumbUrl = `https://maps.googleapis.com/maps/api/streetview?size=400x300&pano=${meta.pano_id}&heading=0&pitch=0&key=${apiKey}`;

    return {
      url: thumbUrl,
      source: 'street_view',
      label: 'Street View',
      streetviewPano: `${meta.pano_id}:0`,
    };
  } catch { return null; }
}

// ── Main handler ────────────────────────────────────────────────
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

  // Fire all sources in parallel (Bing is free, Google Places only if key is set)
  const [googlePlaces, bingSearch, websitePhotos, streetView] = await Promise.allSettled([
    (listing.google_place_id && googleApiKey) ? fetchGooglePlacesPhotos(listing.google_place_id, googleApiKey) : Promise.resolve([]),
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
      // Normalize URL for dedup (strip query params for comparison)
      const key = p.url.split('?')[0];
      if (seenUrls.has(key) || blocked.has(p.url)) continue;
      seenUrls.add(key);
      allCandidates.push(p);
    }
  }

  // Add in priority order: existing first, then google places, search, website, street view
  addPhotos(existing);
  addPhotos(googlePlaces.status === 'fulfilled' ? googlePlaces.value : []);
  addPhotos(bingSearch.status === 'fulfilled' ? bingSearch.value : []);
  addPhotos(websitePhotos.status === 'fulfilled' ? websitePhotos.value : []);

  const svResult = streetView.status === 'fulfilled' ? streetView.value : null;
  if (svResult) addPhotos([svResult]);

  return json({
    candidates: allCandidates,
    total: allCandidates.length,
    sources: {
      existing: existing.length,
      google_places: googlePlaces.status === 'fulfilled' ? googlePlaces.value.length : 0,
      bing_search: bingSearch.status === 'fulfilled' ? bingSearch.value.length : 0,
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
