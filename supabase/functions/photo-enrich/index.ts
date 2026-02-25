import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';
const MAX_PHOTOS = 5;
const PARALLEL_BATCH_SIZE = 1;
const NUM_PARALLEL_CHAINS = 6;
// Mark a task stuck after 4 minutes
const STUCK_TASK_TIMEOUT_MS = 4 * 60 * 1000;

const SKIP_DOMAINS = [
  'facebook.com', 'fbcdn.net', 'fbsbx.com',
  'yelp.com', 'google.com', 'yellowpages.com',
  'bbb.org', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'linkedin.com', 'pinterest.com', 'nextdoor.com',
  'foursquare.com', 'tripadvisor.com', 'angieslist.com', 'manta.com',
];

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return null;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch {
    return null;
  }
}

async function classifyPhotoWithClaude(
  imageUrl: string,
  apiKey: string,
  approvedUrls: string[] = [],
): Promise<{ verdict: 'GOOD' | 'BAD_CONTACT' | 'BAD_OTHER'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image' };

  const refImages = (await Promise.all(
    approvedUrls.slice(0, 3).map(u => fetchImageAsBase64(u))
  )).filter((x): x is { base64: string; mediaType: string } => x !== null);

  const dedupClause = refImages.length > 0
    ? '\nAlso reject this photo (as BAD_OTHER) if it shows essentially the same view as any of the already-approved photos shown above — we want visual variety, not multiple shots of the same angle.'
    : '';

  const prompt = `You are evaluating a photo for a touchless car wash directory listing. Classify this image as one of:

GOOD — the image is a real photograph that clearly represents an automated car wash:
  - Exterior of a car wash building, facility entrance, or facade
  - Interior of an automated wash tunnel showing arches, nozzles, blowers, or a car moving through
  - A car being washed by automated touchless equipment (high-pressure water jets, foam applicators, air dryers)
  - Drive-through tunnel view from the driver's perspective entering or exiting
  - Clear signage or canopy of a car wash facility with the building or wash bays visible

BAD_CONTACT — the image clearly shows physical contact wash equipment that touches the car: spinning brush rollers, cloth strips, mop curtains, or hanging fabric/foam pads making contact with a vehicle. Do NOT use BAD_CONTACT for touchless equipment like water jets, spray arches, or foam nozzles.

BAD_OTHER — reject for ANY of these reasons:
  - NOT A REAL PHOTOGRAPH: Any illustration, logo, mascot, cartoon character, brand graphic, marketing artwork, or digitally created image. This includes stylized characters, colorful brand illustrations, and any image that is clearly not a photograph of a real place. If it looks drawn, rendered, or designed rather than photographed, it is BAD_OTHER.
  - SELF-SERVE WAND BAY: A coin-operated or self-serve bay where customers wash their own car using a handheld wand, spray gun, or pressure washer hose. These are not automated touchless washes.
  - EQUIPMENT CLOSE-UP: A close-up of a single piece of equipment (soap dispenser, vacuum station, payment kiosk, vending machine, air compressor) with no broader facility context.
  - WRONG BUSINESS: Gas station forecourt/pumps with no car wash visible, EV charging station, convenience store, restaurant, or any non-car-wash business.
  - CAR INTERIOR: Dashboard, steering wheel, or seats photographed from inside a vehicle.
  - PEOPLE ONLY: Photo of people with no car wash facility visible.
  - BROKEN/UNUSABLE: Solid color, blank gradient, placeholder graphic, severely blurry, nearly black, or otherwise unusable image.
  - SIGNAGE ONLY: A photo showing only a sign, menu board, or price list with no car wash facility visible behind it.

IMPORTANT RULES:
- The image MUST be a real photograph. Illustrations and graphics are ALWAYS BAD_OTHER.
- When genuinely uncertain between GOOD and BAD_OTHER for a real photograph where some car wash facility is visible, prefer GOOD.
- When genuinely uncertain whether an image is a real photograph or a graphic/illustration, prefer BAD_OTHER.${dedupClause}

Reply with only the classification and a one-sentence reason, formatted as: VERDICT: reason`;

  const refBlocks = refImages.flatMap((r, i) => [
    { type: 'text' as const, text: `Already-approved photo ${i + 1}:` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: r.base64 } },
  ]);

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            ...refBlocks,
            { type: 'text', text: refImages.length > 0 ? 'Now evaluate this new candidate photo:' : '' },
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
            { type: 'text', text: prompt },
          ].filter(b => b.type !== 'text' || (b as {type: string; text: string}).text !== ''),
        }],
      }),
    });

    if (res.status === 529 || res.status === 503 || res.status === 429) {
      if (attempt < maxAttempts) {
        const delay = 2000 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Claude vision error ${res.status}`);
    }

    if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    const text = (data.content?.[0]?.text ?? '').trim();
    const clean = text.replace(/^VERDICT:\s*/i, '').trim();

    if (clean.startsWith('GOOD')) return { verdict: 'GOOD', reason: clean.replace(/^GOOD[:\s-]*/i, '').trim() };
    if (clean.startsWith('BAD_CONTACT')) return { verdict: 'BAD_CONTACT', reason: clean.replace(/^BAD_CONTACT[:\s-]*/i, '').trim() };
    return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
  }

  throw new Error('Claude vision max retries exceeded');
}

interface UrlTraceEntry {
  url: string;
  passed: boolean;
  reason: string | null;
}

function isTinyByDimHint(url: string): boolean {
  const s = url.toLowerCase();
  const patterns: RegExp[] = [
    /[_\-x,](\d+)[_\-x,](\d+)(?:[_\-.]|$)/,
    /w_(\d+)[,&]h_(\d+)/,
    /h_(\d+)[,&]w_(\d+)/,
    /s(\d+)x(\d+)/,
    /\/(\d+)x(\d+)\//,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (a > 0 && b > 0 && a < 100 && b < 100) return true;
    }
  }
  return false;
}

function stripThumbnailSuffix(url: string): string {
  return url
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w{2,5}$)/i, '')
    .replace(/_\d{2,4}x\d{2,4}(?=\.\w{2,5}$)/i, '');
}

function filterCandidateUrlsWithTrace(
  images: string[],
  alreadySeen: string[],
): { candidates: string[]; trace: UrlTraceEntry[] } {
  const seen = new Set(alreadySeen);
  const trace: UrlTraceEntry[] = [];

  const KEYWORD_RULES: Array<{ test: (s: string) => boolean; label: string }> = [
    { test: s => seen.has(s), label: 'already seen' },
    { test: s => s.includes('favicon'), label: "'favicon' keyword" },
    { test: s => s.includes('logo'), label: "'logo' keyword" },
    { test: s => s.includes('icon'), label: "'icon' keyword" },
    { test: s => s.includes('facebook.com') || s.includes('fbcdn.net') || s.includes('fbsbx.com') || s.includes('twitter.com') || s.includes('instagram.com'), label: 'social domain' },
    { test: s => s.includes('google-analytics') || s.includes('pixel') || s.includes('tracking'), label: 'tracking keyword' },
    { test: s => s.includes('1x1') || s.includes('spacer') || s.includes('blank'), label: 'spacer/blank keyword' },
    { test: s => s.includes('badge') || s.includes('banner') || s.includes('button'), label: "'banner'/'badge'/'button' keyword" },
    { test: s => s.includes('simoniz') || s.includes('armorall') || s.includes('turtle') || s.includes('rainx'), label: 'brand product keyword' },
    { test: s => s.includes('social') || s.includes('share') || s.includes('sprite'), label: "'social'/'share'/'sprite' keyword" },
    { test: s => /[_\-/]nav[_\-/.]/.test(s) || s.includes('/nav') || s.endsWith('nav.jpg') || s.endsWith('nav.png') || s.endsWith('nav.webp'), label: "'nav' navigation image keyword" },
    { test: s => s.includes('basemaps.cartocdn') || s.includes('maps.googleapis.com/tiles') || s.includes('tile.openstreetmap') || s.includes('tiles.mapbox') || s.includes('khms.google') || s.includes('mt0.google') || s.includes('mt1.google'), label: 'map tile URL' },
    { test: s => s.includes('app-store') || s.includes('appstore') || s.includes('google-play') || s.includes('play.google') || /badge.*(apple|google)/i.test(s) || /(apple|google).*badge/i.test(s) || /\/(ios|android|google|apple)\.png/.test(s) || s.includes('download-app'), label: 'app store badge' },
    { test: s => s.includes('placeholder') || s.includes('pixel.png') || s.includes('loading.') || s.includes('spinner') || s.includes('avatar-default') || s.includes('gravatar.com') || s.includes('wp-includes/images') || s.includes('emoji') || s.includes('smilies'), label: 'generic web graphic' },
    { test: s => s.includes('ssl-seal') || s.includes('trust-badge') || s.includes('secure-checkout') || s.includes('bbb-logo') || s.includes('yelp-logo') || s.includes('google-review') || /\/(visa|mastercard|paypal)[^/]*\.(png|jpg|webp|svg)/i.test(s), label: 'payment/trust badge' },
    { test: s => isTinyByDimHint(s), label: 'tiny image by dimension hint' },
  ];

  for (const url of images) {
    const lower = url.toLowerCase();
    let rejected = false;
    for (const rule of KEYWORD_RULES) {
      if (rule.test(lower)) {
        trace.push({ url, passed: false, reason: `rejected: ${rule.label}` });
        rejected = true;
        break;
      }
    }
    if (rejected) continue;
    const KNOWN_IMAGE_CDNS = [
      'squarespace-cdn.com',
      'images.unsplash.com',
      'cdn.wix.com',
      'cloudinary.com',
      'wp-content/uploads',
      'amazonaws.com',
      'imgix.net',
      'cloudfront.net',
    ];
    const isKnownCdn = KNOWN_IMAGE_CDNS.some(cdn => lower.includes(cdn));
    if (!isKnownCdn && !/\.(jpg|jpeg|png|webp)/i.test(lower)) {
      trace.push({ url, passed: false, reason: 'rejected: no image extension' });
      continue;
    }
    trace.push({ url, passed: true, reason: null });
  }

  const passed = trace.filter(e => e.passed).map(e => e.url);

  const seenBase = new Set<string>();
  const dedupedPassed: string[] = [];
  for (const url of passed) {
    const base = stripThumbnailSuffix(url);
    if (seenBase.has(base)) {
      const idx = trace.findIndex(e => e.url === url);
      if (idx !== -1) {
        trace[idx] = { url, passed: false, reason: 'rejected: thumbnail duplicate of larger version' };
      }
    } else {
      seenBase.add(base);
      dedupedPassed.push(url);
    }
  }

  return { candidates: dedupedPassed, trace };
}

function filterCandidateUrls(images: string[], alreadySeen: string[]): string[] {
  return filterCandidateUrlsWithTrace(images, alreadySeen).candidates;
}

async function rehostToStorage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  listingId: string,
  slot: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 1000) return null;
    const path = `listings/${listingId}/${slot}.${ext}`;
    const { error } = await supabase.storage.from('listing-photos').upload(path, buffer, {
      contentType: mediaType,
      upsert: true,
    });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('listing-photos').getPublicUrl(path);
    return publicUrl;
  } catch {
    return null;
  }
}

interface ScreenResult {
  approved: string[];
  badUrls: string[];
  crawlNotes: string;
  approvedCount: number;
}

async function screenAndRehost(
  urls: string[],
  approved: string[],
  badUrls: string[],
  listingId: string,
  supabase: ReturnType<typeof createClient>,
  anthropicKey: string,
  maxApprove: number,
  crawlNotes: string,
  genericUrls: Set<string> = new Set(),
): Promise<ScreenResult> {
  const approvedBefore = approved.length;
  for (const url of urls) {
    if (approved.length >= maxApprove) break;
    if (genericUrls.has(url)) {
      badUrls.push(url);
      continue;
    }
    try {
      const result = await classifyPhotoWithClaude(url, anthropicKey, []);
      if (result.verdict === 'GOOD') {
        const slot = `photo_${approved.length}_${Date.now()}`;
        const rehosted = await rehostToStorage(supabase, url, listingId, slot);
        approved.push(rehosted ?? url);
      } else {
        badUrls.push(url);
        if (result.verdict === 'BAD_CONTACT') {
          const note = `[Photo rejected BAD_CONTACT: ${result.reason}]`;
          crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
        }
      }
    } catch {
      badUrls.push(url);
    }
  }
  return { approved, badUrls, crawlNotes, approvedCount: approved.length - approvedBefore };
}

function extractImagesFromHtml(html: string): string[] {
  const urls: string[] = [];
  const srcRegex = /(?:src|srcset|data-src|data-lazy-src|data-original)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/gi;
  let match;
  while ((match = srcRegex.exec(html)) !== null) {
    const url = match[1].split(' ')[0].trim();
    if (url.startsWith('http')) urls.push(url);
  }
  return [...new Set(urls)];
}

async function fetchGooglePlacePhotoUrls(
  placeId: string,
  googleApiKey: string,
  heroPhotoUrl: string | null,
  maxPhotos: number,
): Promise<string[]> {
  const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${googleApiKey}`;
  const res = await fetch(detailsUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = await res.json() as {
    photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  };

  const photos = data.photos ?? [];
  if (photos.length === 0) return [];

  const urls: string[] = [];
  for (const photo of photos) {
    if (urls.length >= maxPhotos) break;
    const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=1600&maxWidthPx=1600&key=${googleApiKey}`;
    const mediaRes = await fetch(mediaUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!mediaRes.ok) continue;
    const finalUrl = mediaRes.url;
    if (!finalUrl || finalUrl === heroPhotoUrl) continue;
    urls.push(finalUrl);
  }

  return urls;
}

// Returns a Set of URLs that are already used as hero_image on >= threshold other listings.
// Used to skip generic chain images that have been reused across many locations.
async function fetchGenericUrls(
  supabase: ReturnType<typeof createClient>,
  candidateUrls: string[],
  threshold = 3,
): Promise<Set<string>> {
  if (candidateUrls.length === 0) return new Set();
  const { data } = await supabase
    .from('listings')
    .select('hero_image')
    .in('hero_image', candidateUrls)
    .not('hero_image', 'is', null);

  if (!data) return new Set();

  const counts = new Map<string, number>();
  for (const row of data) {
    if (row.hero_image) {
      counts.set(row.hero_image, (counts.get(row.hero_image) ?? 0) + 1);
    }
  }

  const generic = new Set<string>();
  for (const [url, count] of counts) {
    if (count >= threshold) generic.add(url);
  }
  return generic;
}

async function pickBestHeroFromGallery(urls: string[], apiKey: string): Promise<number> {
  if (urls.length === 1) return 0;

  const images = await Promise.all(urls.map(u => fetchImageAsBase64(u)));
  const valid = images.map((img, i) => ({ img, i })).filter(({ img }) => img !== null);
  if (valid.length === 0) return 0;
  if (valid.length === 1) return valid[0].i;

  const imageBlocks = valid.flatMap(({ img, i }) => [
    { type: 'text' as const, text: `Photo ${i + 1}:` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: img!.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: img!.base64 } },
  ]);

  const prompt = `You are selecting the single best hero image for a touchless car wash directory listing. Review the ${valid.length} photos above and pick the one that would make the best first impression: ideally a clear, well-lit exterior shot of the facility or wash tunnel entrance. Avoid interior-only shots, close-ups of equipment, or blurry images if better options exist.

Reply with only the photo number (e.g. "2") and nothing else.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json() as { content: Array<{ text: string }> };
    const text = (data.content?.[0]?.text ?? '').trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= urls.length) return num - 1;
  } catch {
    // fall through
  }
  return 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'FIRECRAWL_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    if (action === 'status') {
      const { count: total } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true);

      const { count: withHero } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('hero_image', 'is', null);

      const { count: needHero } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .is('hero_image', null);

      const { count: googleSrc } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .eq('hero_image_source', 'google');

      const { count: websiteSrc } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .eq('hero_image_source', 'website');

      const { count: streetSrc } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .eq('hero_image_source', 'street_view');

      return Response.json({
        total: total ?? 0,
        with_hero: withHero ?? 0,
        need_hero: needHero ?? 0,
        by_source: {
          google: googleSrc ?? 0,
          website: websiteSrc ?? 0,
          street_view: streetSrc ?? 0,
        },
      }, { headers: corsHeaders });
    }

    if (action === 'start') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const upgradeMode: boolean = body.upgrade_mode === true;

      let query = supabase
        .from('listings')
        .select('id, name, website, google_photo_url, google_logo_url, street_view_url, google_place_id, hero_image, hero_image_source, logo_photo, crawl_notes, photos, website_photos, blocked_photos')
        .eq('is_touchless', true)
        .order('id');

      if (upgradeMode) {
        query = query
          .not('website', 'is', null)
          .or('hero_image_source.eq.street_view,and(hero_image_source.eq.google,photos.is.null)');
      } else {
        query = query.is('hero_image', null);
      }

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ error: upgradeMode ? 'No listings eligible for upgrade (need google/street_view hero + website URL)' : 'No touchless listings found' }, { status: 404, headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('photo_enrich_jobs')
        .insert({
          total: listings.length,
          processed: 0,
          succeeded: 0,
          status: 'running',
          started_at: new Date().toISOString(),
          upgrade_mode: upgradeMode,
        })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      const tasks = (listings as Record<string, unknown>[]).map(l => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        website: l.website,
        google_photo_url: l.google_photo_url,
        google_logo_url: l.google_logo_url,
        street_view_url: l.street_view_url,
        google_place_id: l.google_place_id,
        current_hero: l.hero_image,
        current_hero_source: l.hero_image_source,
        current_logo: l.logo_photo,
        current_crawl_notes: l.crawl_notes,
        task_status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('photo_enrich_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const kickUrl = `${supabaseUrl}/functions/v1/photo-enrich`;
      const kickBody = JSON.stringify({ action: 'process_batch', job_id: job.id });
      const kickHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` };

      // Kick NUM_PARALLEL_CHAINS chains from the start, staggered to avoid thundering herd
      const startDelays = [0, 400, 800, 1400, 3000, 6000];
      EdgeRuntime.waitUntil(
        Promise.all(
          startDelays.slice(0, NUM_PARALLEL_CHAINS + 2).map(delay =>
            new Promise(r => setTimeout(r, delay)).then(() =>
              fetch(kickUrl, { method: 'POST', headers: kickHeaders, body: kickBody }).catch(() => {})
            )
          )
        )
      );

      return Response.json({ job_id: job.id, total: listings.length }, { headers: corsHeaders });
    }

    if (action === 'process_batch') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('photo_enrich_jobs')
        .select('id, status, total, processed, succeeded, upgrade_mode')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const isUpgradeMode = (job as Record<string, unknown>).upgrade_mode === true;

      // Handle stuck in_progress tasks:
      // - If attempt_count >= 3 → mark done (give up, they keep timing out)
      // - Otherwise → reset to pending so another chain can retry
      const stuckCutoff = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS).toISOString();
      await Promise.all([
        supabase
          .from('photo_enrich_tasks')
          .update({
            task_status: 'done',
            hero_image_found: false,
            finished_at: new Date().toISOString(),
            fallback_reason: 'Skipped — repeated timeouts',
          })
          .eq('job_id', jobId)
          .eq('task_status', 'in_progress')
          .is('finished_at', null)
          .lt('updated_at', stuckCutoff)
          .gte('attempt_count', 3),
        supabase
          .from('photo_enrich_tasks')
          .update({ task_status: 'pending', updated_at: new Date().toISOString() })
          .eq('job_id', jobId)
          .eq('task_status', 'in_progress')
          .is('finished_at', null)
          .lt('updated_at', stuckCutoff)
          .lt('attempt_count', 3),
      ]);

      // Re-check cancel status AFTER resetting stuck tasks but BEFORE claiming
      const { data: freshJob } = await supabase
        .from('photo_enrich_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();

      if (freshJob?.status === 'cancelled' || freshJob?.status === 'done') {
        return Response.json({ done: true, status: freshJob.status }, { headers: corsHeaders });
      }

      // Atomically claim tasks using FOR UPDATE SKIP LOCKED — prevents double-processing
      const { data: batchTasks } = await supabase.rpc('claim_photo_enrich_tasks', {
        p_job_id: jobId,
        p_limit: PARALLEL_BATCH_SIZE,
        p_max_concurrency: NUM_PARALLEL_CHAINS * PARALLEL_BATCH_SIZE * 2,
      });

      if (!batchTasks || batchTasks.length === 0) {
        const [{ count: inProgressCount }, { count: pendingCount }] = await Promise.all([
          supabase.from('photo_enrich_tasks').select('id', { count: 'exact', head: true })
            .eq('job_id', jobId).eq('task_status', 'in_progress'),
          supabase.from('photo_enrich_tasks').select('id', { count: 'exact', head: true })
            .eq('job_id', jobId).eq('task_status', 'pending'),
        ]);

        if ((inProgressCount ?? 0) > 0 || (pendingCount ?? 0) > 0) {
          return Response.json({ done: false, waiting: true, in_progress: inProgressCount, pending: pendingCount }, { headers: corsHeaders });
        }

        await supabase.from('photo_enrich_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const selfUrl = `${supabaseUrl}/functions/v1/photo-enrich`;
      const kickHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` };

      // 3 staggered kicks — redundancy ensures chain survives a dropped request.
      // Concurrency cap in claim RPC prevents fan-out; extra kicks return empty immediately.
      const nextKickBody = JSON.stringify({ action: 'process_batch', job_id: jobId });
      EdgeRuntime.waitUntil(
        Promise.all([200, 2000, 6000].map(delay =>
          new Promise(r => setTimeout(r, delay)).then(() =>
            fetch(selfUrl, { method: 'POST', headers: kickHeaders, body: nextKickBody }).catch(() => {})
          )
        ))
      );

      const processOneTask = async (task: typeof batchTasks[number]) => {
        try {
          return await Promise.race([
            processOneTaskInner(task),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Task processing timeout')), 60_000)
            ),
          ]);
        } catch (e) {
          await supabase.from('photo_enrich_tasks').update({
            task_status: 'done',
            hero_image_found: false,
            finished_at: new Date().toISOString(),
            fallback_reason: `Timeout/error: ${(e as Error).message}`,
          }).eq('id', task.id);
          await supabase.from('listings').update({
            photo_enrichment_attempted_at: new Date().toISOString(),
          }).eq('id', task.listing_id);
          return { heroPhoto: null, heroSource: null, approved: [], galleryPhotos: [] };
        }
      };

      const processOneTaskInner = async (task: typeof batchTasks[number]) => {
        // Skip listings that have timed out too many times — mark attempted and move on
        if ((task.attempt_count as number ?? 0) > 3) {
          await supabase.from('photo_enrich_tasks').update({
            task_status: 'done',
            hero_image_found: false,
            finished_at: new Date().toISOString(),
            fallback_reason: 'Skipped — repeated timeouts on this listing',
          }).eq('id', task.id);
          await supabase.from('listings').update({
            photo_enrichment_attempted_at: new Date().toISOString(),
          }).eq('id', task.listing_id);
          return { heroPhoto: null, heroSource: null, approved: [], galleryPhotos: [] };
        }

        const { data: listingData } = await supabase
          .from('listings')
          .select('photos, website_photos, blocked_photos')
          .eq('id', task.listing_id)
          .maybeSingle();

        const currentPhotos: string[] = (listingData?.photos as string[]) ?? [];
        const websitePhotos: string[] = (() => {
          const wp = listingData?.website_photos;
          if (!wp) return [];
          if (Array.isArray(wp)) return wp as string[];
          if (typeof wp === 'object') return Object.values(wp as Record<string, string>);
          return [];
        })();
        const blockedPhotos: string[] = (listingData?.blocked_photos as string[]) ?? [];

        const heroIsManual = task.current_hero_source === 'manual' || task.current_hero_source === 'manual_upload';

        let approved: string[] = [];
        let badUrls: string[] = [...blockedPhotos];
        let heroPhoto: string | null = heroIsManual ? (task.current_hero as string) : null;
        let heroSource: string | null = heroIsManual ? (task.current_hero_source as string) : null;
        let crawlNotes: string = (task.current_crawl_notes as string) ?? '';

        if (!isUpgradeMode) {
          for (const p of currentPhotos) {
            if (p && !approved.includes(p) && approved.length < MAX_PHOTOS) {
              approved.push(p);
            }
          }

          if (!heroIsManual && approved.length > 0 && !heroPhoto) {
            const bestIdx = await pickBestHeroFromGallery(approved, anthropicKey);
            heroPhoto = approved[bestIdx];
            heroSource = 'gallery';
          }
        }

        const trace: Record<string, unknown> = {
          google_photo_exists: false,
          google_verdict: 'skipped',
          google_reason: null,
          website_photos_db_count: websitePhotos.length,
          website_photos_screened: 0,
          website_photos_approved: 0,
          firecrawl_triggered: false,
          firecrawl_images_found: 0,
          firecrawl_candidates: 0,
          firecrawl_approved: 0,
          firecrawl_url_trace: null as UrlTraceEntry[] | null,
          google_place_photos_approved: 0,
          total_approved: 0,
          fallback_reason: null,
        };

        const websiteUrl = task.website as string | null;
        const canFirecrawl = !!websiteUrl && !SKIP_DOMAINS.some(d => websiteUrl.includes(d));

        trace.firecrawl_triggered = canFirecrawl;

        // Scrape first so we have the full candidate pool before doing the batch dedup check
        let firecrawlCandidates: string[] = [];

        if (canFirecrawl) {
          try {
            const fcRes = await fetch(`${FIRECRAWL_API}/scrape`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: websiteUrl,
                formats: ['html'],
                onlyMainContent: false,
                timeout: 25000,
              }),
            });

            if (fcRes.ok) {
              const fcData = await fcRes.json() as {
                success: boolean;
                data?: { html?: string; rawHtml?: string };
              };
              const html = fcData.data?.html ?? fcData.data?.rawHtml ?? '';
              const rawImages = extractImagesFromHtml(html);
              trace.firecrawl_images_found = rawImages.length;
              const { candidates, trace: urlTrace } = filterCandidateUrlsWithTrace(rawImages, badUrls);
              firecrawlCandidates = candidates.slice(0, 20);
              trace.firecrawl_url_trace = urlTrace;
              trace.firecrawl_candidates = firecrawlCandidates.length;
            } else {
              trace.fallback_reason = `Firecrawl HTTP ${fcRes.status}`;
            }
          } catch (e) {
            trace.fallback_reason = `Firecrawl error: ${(e as Error).message}`;
          }
        } else if (!websiteUrl) {
          trace.fallback_reason = 'No website URL — skipped Firecrawl';
        } else if (SKIP_DOMAINS.some(d => websiteUrl.includes(d))) {
          trace.fallback_reason = 'Skipped Firecrawl — website is a directory/social domain';
        }

        // Batch dedup check: gather all candidate URLs from every source and check
        // which ones are already used as hero_image on 3+ other listings (generic chain images).
        const dbWebsiteCandidates = websitePhotos.length > 0
          ? filterCandidateUrls(websitePhotos, badUrls).slice(0, 15)
          : [];
        const googleUrl = task.google_photo_url as string | null;
        const allCandidateUrls = [
          ...firecrawlCandidates,
          ...dbWebsiteCandidates,
          ...(googleUrl ? [googleUrl] : []),
        ];
        const genericUrls = await fetchGenericUrls(supabase, allCandidateUrls, 3);

        // ---- STEP 1: Firecrawl candidates ----
        if (firecrawlCandidates.length > 0) {
          const approvedBefore = approved.length;
          const r = await screenAndRehost(
            firecrawlCandidates, approved, badUrls, task.listing_id as string,
            supabase, anthropicKey, MAX_PHOTOS, crawlNotes, genericUrls,
          );
          approved = r.approved;
          badUrls = r.badUrls;
          crawlNotes = r.crawlNotes;
          trace.firecrawl_approved = approved.length - approvedBefore;
          if (!heroIsManual && !heroSource && approved.length > 0) {
            heroSource = 'website';
            heroPhoto = approved[0];
          }
        }

        // ---- STEP 2: DB website_photos ----
        if (dbWebsiteCandidates.length > 0 && approved.length < MAX_PHOTOS) {
          trace.website_photos_screened = dbWebsiteCandidates.length;
          const approvedBefore = approved.length;
          const r = await screenAndRehost(
            dbWebsiteCandidates, approved, badUrls, task.listing_id as string,
            supabase, anthropicKey, MAX_PHOTOS, crawlNotes, genericUrls,
          );
          approved = r.approved;
          badUrls = r.badUrls;
          crawlNotes = r.crawlNotes;
          trace.website_photos_approved = approved.length - approvedBefore;
          if (!heroIsManual && !heroSource && approved.length > 0) {
            heroSource = 'website';
            heroPhoto = approved[0];
          }
        }

        // ---- STEP 3: Google Place Photos ----
        const placeId = task.google_place_id as string | null;
        if (placeId && googleApiKey && approved.length < MAX_PHOTOS) {
          try {
            const needed = MAX_PHOTOS - approved.length;
            const placePhotoUrls = await fetchGooglePlacePhotoUrls(
              placeId,
              googleApiKey,
              heroPhoto,
              Math.min(10, needed + 2),
            );

            // Dedup check for place photo URLs (fetched dynamically, not in initial batch)
            const placeGenericUrls = await fetchGenericUrls(supabase, placePhotoUrls, 3);

            const approvedBefore = approved.length;
            for (const url of placePhotoUrls) {
              if (approved.length >= MAX_PHOTOS) break;
              if (approved.includes(url) || badUrls.includes(url)) continue;
              if (placeGenericUrls.has(url)) {
                badUrls.push(url);
                continue;
              }
              try {
                const result = await classifyPhotoWithClaude(url, anthropicKey, []);
                if (result.verdict === 'GOOD') {
                  const slot = `place_photo_${approved.length}_${Date.now()}`;
                  const rehosted = await rehostToStorage(supabase, url, task.listing_id as string, slot);
                  const finalUrl = rehosted ?? url;
                  approved.push(finalUrl);
                  if (!heroIsManual && !heroPhoto) {
                    heroPhoto = finalUrl;
                    heroSource = 'google';
                  }
                } else {
                  badUrls.push(url);
                  if (result.verdict === 'BAD_CONTACT') {
                    const note = `[Place photo rejected BAD_CONTACT: ${result.reason}]`;
                    crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
                  }
                }
              } catch {
                badUrls.push(url);
              }
            }
            trace.google_place_photos_approved = approved.length - approvedBefore;
          } catch {
            // Place Photos fetch failed silently
          }
        }

        // ---- STEP 4: google_photo_url single fallback ----
        trace.google_photo_exists = !!googleUrl;
        if (googleUrl && !badUrls.includes(googleUrl) && !genericUrls.has(googleUrl) && approved.length < MAX_PHOTOS) {
          try {
            const result = await classifyPhotoWithClaude(googleUrl, anthropicKey, []);
            trace.google_verdict = result.verdict;
            trace.google_reason = result.reason;
            if (result.verdict === 'GOOD') {
              const rehosted = await rehostToStorage(supabase, googleUrl, task.listing_id as string, 'google_photo');
              const finalUrl = rehosted ?? googleUrl;
              if (!heroIsManual && !heroPhoto) {
                heroPhoto = finalUrl;
                heroSource = 'google';
              }
              if (!approved.includes(finalUrl) && approved.length < MAX_PHOTOS) {
                approved.push(finalUrl);
              }
            } else {
              badUrls.push(googleUrl);
              if (result.verdict === 'BAD_CONTACT') {
                const note = `[Google photo rejected BAD_CONTACT: ${result.reason}]`;
                crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
              }
            }
          } catch (e) {
            trace.google_verdict = 'fetch_failed';
            trace.google_reason = (e as Error).message;
          }
        } else if (googleUrl && genericUrls.has(googleUrl)) {
          trace.google_verdict = 'generic_chain_image';
          trace.google_reason = 'URL already used as hero on 3+ other listings';
          badUrls.push(googleUrl);
        } else if (googleUrl && badUrls.includes(googleUrl)) {
          trace.google_verdict = 'previously_blocked';
          trace.google_reason = 'URL is in blocked_photos list';
        }

        trace.total_approved = approved.length;

        const streetViewUrl = task.street_view_url as string | null;
        if (!isUpgradeMode) {
          if (!heroIsManual && !heroPhoto && streetViewUrl) {
            heroPhoto = streetViewUrl;
            heroSource = 'street_view';
            trace.fallback_reason = (trace.fallback_reason as string | null)
              ? `${trace.fallback_reason}; used street view as fallback hero`
              : 'No approved photos — used street view as fallback hero';
          } else if (!heroIsManual && !heroPhoto && !streetViewUrl) {
            trace.fallback_reason = (trace.fallback_reason as string | null)
              ? `${trace.fallback_reason}; no street view available`
              : 'No approved photos and no street view URL';
          }
        } else if (!heroPhoto) {
          trace.fallback_reason = (trace.fallback_reason as string | null)
            ? `${trace.fallback_reason}; no website photos found — original hero kept`
            : 'No website photos found — original hero kept unchanged';
        }

        const galleryPhotos = heroPhoto && approved.includes(heroPhoto)
          ? approved.filter(p => p !== heroPhoto).slice(0, MAX_PHOTOS - 1)
          : approved.slice(0, MAX_PHOTOS);

        let logoPhoto: string | null = null;
        const logoUrl = task.google_logo_url as string | null;
        if (logoUrl && !(task.current_logo as string | null)) {
          const rehosted = await rehostToStorage(supabase, logoUrl, task.listing_id as string, 'logo');
          logoPhoto = rehosted ?? logoUrl;
        }

        const newBlocked = [...new Set(badUrls)];

        const update: Record<string, unknown> = {
          last_crawled_at: new Date().toISOString(),
          photo_enrichment_attempted_at: new Date().toISOString(),
          crawl_notes: crawlNotes || null,
          blocked_photos: newBlocked,
        };

        if (!heroIsManual && heroPhoto && (!isUpgradeMode || heroSource === 'website')) {
          update.hero_image = heroPhoto;
          update.hero_image_source = heroSource;
        }

        if (galleryPhotos.length > 0) {
          update.photos = galleryPhotos;
        }

        if (logoPhoto) {
          update.logo_photo = logoPhoto;
        }

        await supabase.from('listings').update(update).eq('id', task.listing_id);

        await supabase.from('photo_enrich_tasks').update({
          task_status: 'done',
          hero_image_found: !!heroPhoto,
          hero_source: heroSource,
          gallery_count: galleryPhotos.length,
          logo_found: !!logoPhoto,
          finished_at: new Date().toISOString(),
          google_photo_exists: trace.google_photo_exists as boolean,
          google_verdict: trace.google_verdict as string,
          google_reason: trace.google_reason as string | null,
          website_photos_db_count: trace.website_photos_db_count as number,
          website_photos_screened: trace.website_photos_screened as number,
          website_photos_approved: trace.website_photos_approved as number,
          firecrawl_triggered: trace.firecrawl_triggered as boolean,
          firecrawl_images_found: trace.firecrawl_images_found as number,
          firecrawl_candidates: trace.firecrawl_candidates as number,
          firecrawl_approved: trace.firecrawl_approved as number,
          firecrawl_url_trace: trace.firecrawl_url_trace as UrlTraceEntry[] | null,
          google_place_photos_approved: trace.google_place_photos_approved as number,
          total_approved: trace.total_approved as number,
          fallback_reason: trace.fallback_reason as string | null,
        }).eq('id', task.id);

        return { heroPhoto, heroSource, approved, galleryPhotos };
      };

      const results = await Promise.allSettled(batchTasks.map(task => processOneTask(task)));

      let batchSucceeded = 0;
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.heroPhoto) {
          batchSucceeded++;
        } else if (result.status === 'rejected') {
          const failedTask = batchTasks[results.indexOf(result)];
          await supabase.from('photo_enrich_tasks').update({
            task_status: 'done',
            fallback_reason: `Unhandled error: ${(result.reason as Error)?.message ?? 'unknown'}`,
            finished_at: new Date().toISOString(),
          }).eq('id', failedTask.id);
          await supabase.from('listings').update({
            photo_enrichment_attempted_at: new Date().toISOString(),
          }).eq('id', failedTask.listing_id);
        }
      }

      await supabase.rpc('increment_photo_enrich_job_counts', {
        p_job_id: jobId,
        p_processed: batchTasks.length,
        p_succeeded: batchSucceeded,
      });

      return Response.json({
        processed: batchTasks.length,
        succeeded: batchSucceeded,
      }, { headers: corsHeaders });
    }

    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('photo_enrich_jobs')
        .select('id, status, total, processed, succeeded, started_at, finished_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });

      const stuckCutoff = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS).toISOString();

      const [stuckResult, inProgressResult] = await Promise.all([
        supabase
          .from('photo_enrich_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('task_status', 'in_progress')
          .is('finished_at', null)
          .lt('updated_at', stuckCutoff),
        supabase
          .from('photo_enrich_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('task_status', 'in_progress'),
      ]);

      return Response.json({
        ...job,
        stuck_count: stuckResult.count ?? 0,
        in_progress_count: inProgressResult.count ?? 0,
      }, { headers: corsHeaders });
    }

    if (action === 'task_traces') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: tasks } = await supabase
        .from('photo_enrich_tasks')
        .select([
          'id', 'listing_id', 'listing_name', 'website',
          'google_photo_url', 'street_view_url',
          'task_status', 'hero_source', 'hero_image_found', 'gallery_count',
          'google_photo_exists', 'google_verdict', 'google_reason',
          'website_photos_db_count', 'website_photos_screened', 'website_photos_approved',
          'firecrawl_triggered', 'firecrawl_images_found', 'firecrawl_candidates', 'firecrawl_approved',
          'firecrawl_url_trace',
          'google_place_photos_approved',
          'total_approved', 'fallback_reason',
        ].join(', '))
        .eq('job_id', jobId)
        .order('id');

      return Response.json({ tasks: tasks ?? [] }, { headers: corsHeaders });
    }

    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('photo_enrich_jobs').update({ status: 'cancelled' }).eq('id', jobId);
      await supabase.from('photo_enrich_tasks')
        .update({ task_status: 'cancelled' })
        .eq('job_id', jobId)
        .in('task_status', ['pending', 'in_progress']);

      return Response.json({ cancelled: true }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}
