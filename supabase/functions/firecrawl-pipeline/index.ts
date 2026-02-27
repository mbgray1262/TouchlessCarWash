import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';
const CHUNK_SIZE = 2000;
const SKIP_DOMAINS = [
  'facebook.com', 'yelp.com', 'google.com', 'yellowpages.com',
  'bbb.org', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'maps.apple.com', 'map.bp.com', 'mapquest.com',
  'maps.google.com', 'goo.gl/maps', 'maps.app.goo.gl',
  'linkedin.com', 'pinterest.com', 'nextdoor.com', 'foursquare.com',
  'tripadvisor.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com',
  'citysearch.com', 'superpages.com', 'whitepages.com', 'manta.com',
  'waze.com', 'rocketstores.com',
];

const AMENITY_TO_FILTER_SLUG: Record<string, string> = {
  'Free Vacuum': 'free-vacuum',
  'Free Vacuums': 'free-vacuum',
  'Vacuum': 'free-vacuum',
  'Unlimited Wash Club': 'unlimited-wash-club',
  'Membership': 'unlimited-wash-club',
  'Monthly Plan': 'unlimited-wash-club',
  'Unlimited': 'unlimited-wash-club',
  'Self-Serve Bays': 'self-serve-bays',
  'Self Service': 'self-serve-bays',
  'Wand Wash': 'self-serve-bays',
  'Self Serve': 'self-serve-bays',
  'RV Wash': 'rv-oversized',
  'Truck Wash': 'rv-oversized',
  'Oversized Vehicle': 'rv-oversized',
  'RV/Truck Wash': 'rv-oversized',
};

type FilterMap = Record<string, number>;

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '') || '';
    return `${host}${path}`;
  } catch {
    return raw.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  }
}

function filterImages(images: string[]): string[] {
  return images.filter(url => {
    const lower = url.toLowerCase();
    if (lower.includes('favicon')) return false;
    if (lower.includes('facebook.com') || lower.includes('twitter.com')) return false;
    if (lower.includes('google-analytics') || lower.includes('pixel')) return false;
    if (lower.includes('1x1') || lower.includes('spacer')) return false;
    return /\.(jpg|jpeg|png|webp|svg)/i.test(lower);
  }).slice(0, 20);
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch {
    return null;
  }
}

async function selectPhotosWithClaude(
  allImages: string[],
  knownLogoUrl: string | null,
  listingName: string,
  isTouchless: boolean | null,
  apiKey: string,
): Promise<{ hero_index: number; logo_index: number; gallery_indices: number[]; no_good_photos: boolean }> {
  const MAX = 15;
  const candidates = allImages.slice(0, MAX);
  const imageResults = await Promise.allSettled(candidates.map(url => fetchImageAsBase64(url)));
  const valid: Array<{ index: number; base64: string; mediaType: string }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const r = imageResults[i];
    if (r.status === 'fulfilled' && r.value) valid.push({ index: i, base64: r.value.base64, mediaType: r.value.mediaType });
  }
  if (valid.length === 0) return { hero_index: -1, logo_index: -1, gallery_indices: [], no_good_photos: true };

  const knownLogoIndex = knownLogoUrl ? allImages.indexOf(knownLogoUrl) : -1;

  const imageBlocks = valid.flatMap(({ index, base64, mediaType }) => [
    { type: 'text', text: `Image ${index}:` },
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
  ]);

  const touchlessHint = isTouchless === true
    ? 'This IS a touchless car wash — strongly prefer photos of the automated wash tunnel, equipment arms/nozzles, or cars moving through the wash.'
    : '';

  const logoHint = knownLogoIndex >= 0
    ? `Image ${knownLogoIndex} is already known to be the business logo — treat it as the logo unless a clearly better logo exists at another index.`
    : '';

  const prompt = `You are a strict photo curator for TouchlessCarWash.com, a car wash business directory.

Business: "${listingName}"
${touchlessHint}
${logoHint}

Images provided (0-based indices: ${valid.map(v => v.index).join(', ')}):

## Tasks

### HERO
Pick the single best REAL PHOTOGRAPH for the hero banner. Must show the exterior of the car wash building/property, or a car inside the wash tunnel. Landscape orientation preferred.
REJECT as hero: logos, icons, illustrations, clip art, pricing signs, social media screenshots, maps, badges, product labels, testimonial graphics, coupons, or any non-photographic image.

### LOGO
Pick the PRIMARY BUSINESS LOGO — the wordmark, shield, badge, or brand graphic of THIS business.
Use the known logo hint if provided.
Set logo_index = -1 if no clear business logo exists.
NEVER pick: Facebook logo, Google icon, payment badge, product manufacturer logo, or any generic icon.

### GALLERY
Pick up to 5 REAL PHOTOGRAPHS of the facility, equipment, cars in the wash, or property exterior.
STRICT EXCLUSIONS — exclude any image that is:
- A logo, icon, or brand graphic of ANY kind (including this business's own logo)
- A Facebook / Instagram / Twitter / social media icon or screenshot
- A payment processor badge (Visa, Mastercard, etc.)
- A product manufacturer logo (Armor All, Rain-X, etc.)
- Clip art, illustration, or computer-generated graphic
- A pricing board, coupon, or text-heavy promotional graphic
- Blurry, very small, or clearly low quality
- A generic stock image not of THIS specific location

Respond ONLY with compact JSON (no markdown, no explanation):
{"hero_index":2,"logo_index":0,"gallery_indices":[1,3,4],"no_good_photos":false,"reason":"one sentence"}

- hero_index: integer index of best hero photo, -1 if none qualifies
- logo_index: integer index of business logo, -1 if none
- gallery_indices: array of up to 5 quality facility photo indices (may include hero; NEVER include logo index)
- no_good_photos: true ONLY if zero real facility photographs exist`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { hero_index: 0, logo_index: knownLogoIndex, gallery_indices: valid.map(v => v.index).slice(0, 5), no_good_photos: false };
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    hero_index: typeof parsed.hero_index === 'number' ? parsed.hero_index : -1,
    logo_index: typeof parsed.logo_index === 'number' ? parsed.logo_index : (knownLogoIndex >= 0 ? knownLogoIndex : -1),
    gallery_indices: Array.isArray(parsed.gallery_indices) ? parsed.gallery_indices : [],
    no_good_photos: parsed.no_good_photos === true,
  };
}

async function classifyWithClaude(markdown: string, apiKey: string): Promise<{
  is_touchless: boolean | null;
  touchless_evidence: string;
  amenities: string[];
  description: string | null;
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Analyze this car wash website content and return a JSON object.

WEBSITE CONTENT:
${markdown.slice(0, 8000)}

Return ONLY a valid JSON object with these fields:
{
  "is_touchless": true/false/null,
  "touchless_evidence": "brief explanation",
  "amenities": ["list", "of", "amenities"],
  "description": "1-2 sentence business description or null"
}

CLASSIFICATION RULES:
- is_touchless = true if the site mentions: touchless, touch free, laser wash, no touch, friction free, self serve, wand wash, coin operated, bay wash
- is_touchless = false if it ONLY mentions: soft touch, soft cloth, foam brush, brush wash, friction wash, hand wash, full service hand dry
- is_touchless = true if it offers BOTH touchless AND brush options (they have a touchless option)
- is_touchless = null if there's no clear evidence either way
- For amenities, look for: vacuum, air freshener, towels, tire shine, wax, ceramic, membership/unlimited club, detailing, pet wash, RV/truck wash, self-serve bays, interior cleaning, underbody wash
- Description should be a brief factual summary, not marketing copy`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]);
}

// deno-lint-ignore no-explicit-any
async function syncFilters(supabase: any, listingId: string, isTouchless: boolean | null, amenities: string[], filterMap: FilterMap) {
  const inserts: { listing_id: string; filter_id: number }[] = [];

  if (isTouchless === true && filterMap['touchless']) {
    inserts.push({ listing_id: listingId, filter_id: filterMap['touchless'] });
  }

  for (const amenity of amenities) {
    const slug = AMENITY_TO_FILTER_SLUG[amenity];
    if (slug && filterMap[slug]) {
      inserts.push({ listing_id: listingId, filter_id: filterMap[slug] });
    }
  }

  if (inserts.length > 0) {
    await supabase.from('listing_filters').upsert(inserts, { onConflict: 'listing_id,filter_id' });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    const url = new URL(req.url);
    const bodyText = req.method === 'POST' ? await req.text() : '';
    const body = bodyText ? JSON.parse(bodyText) : {};
    const action = url.searchParams.get('action') ?? body.action ?? 'status';

    // --- GET STATUS ---
    if (action === 'status') {
      const runsPage = parseInt(url.searchParams.get('runs_page') ?? body.runs_page ?? '0', 10);
      const PAGE_SIZE = 50;

      const [totalRes, scrapedRes, classifiedRes, touchlessRes, notTouchlessRes, failedRes, redirectRes, totalWithWebsitesRes, totalRunsRes] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .is('is_touchless', null).not('website', 'is', null).neq('website', ''),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .not('last_crawled_at', 'is', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .not('is_touchless', 'is', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', false),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('crawl_status', 'failed'),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('crawl_status', 'redirect'),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .not('website', 'is', null).neq('website', ''),
        supabase.from('pipeline_runs').select('id', { count: 'exact', head: true }),
      ]);

      const batchesRes = await supabase.from('pipeline_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      const recentRunsRes = await supabase.from('pipeline_runs')
        .select(`
          id, crawl_status, is_touchless, touchless_evidence, images_found, processed_at,
          listing:listing_id (name, website)
        `)
        .order('processed_at', { ascending: false })
        .range(runsPage * PAGE_SIZE, (runsPage + 1) * PAGE_SIZE - 1);

      return Response.json({
        stats: {
          queue: totalRes.count ?? 0,
          scraped: scrapedRes.count ?? 0,
          classified: classifiedRes.count ?? 0,
          touchless: touchlessRes.count ?? 0,
          not_touchless: notTouchlessRes.count ?? 0,
          failed: failedRes.count ?? 0,
          redirects: redirectRes.count ?? 0,
          total_with_websites: totalWithWebsitesRes.count ?? 0,
        },
        batches: batchesRes.data ?? [],
        recent_runs: recentRunsRes.data ?? [],
        total_runs: totalRunsRes.count ?? 0,
      }, { headers: corsHeaders });
    }

    // --- FIRECRAWL JOB STATUS (real-time progress from Firecrawl API) ---
    if (action === 'firecrawl_status') {
      if (!firecrawlKey) return Response.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      const jobId: string = body.job_id ?? url.searchParams.get('job_id');
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const fcRes = await fetch(`${FIRECRAWL_API}/batch/scrape/${jobId}?limit=1`, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        return Response.json({ error: `Firecrawl ${fcRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const fcData = await fcRes.json() as { status: string; total: number; completed: number; creditsUsed: number };
      return Response.json({
        status: fcData.status,
        total: fcData.total ?? 0,
        completed: fcData.completed ?? 0,
        credits_used: fcData.creditsUsed ?? 0,
      }, { headers: corsHeaders });
    }

    // --- SUBMIT BATCH ---
    if (action === 'submit_batch') {
      if (!firecrawlKey) return Response.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500, headers: corsHeaders });

      const retryFailed = body.retry_failed === true;
      const chunkIndex = body.chunk_index ?? 0;
      const appUrl = body.app_url ?? Deno.env.get('APP_URL') ?? '';

      let query = supabase.from('listings')
        .select('id, website, name, google_subtypes')
        .is('is_touchless', null)
        .not('website', 'is', null)
        .neq('website', '')
        .order('id');

      if (retryFailed) {
        query = supabase.from('listings')
          .select('id, website, name, google_subtypes')
          .in('crawl_status', ['failed', 'timeout', 'no_content'])
          .not('website', 'is', null)
          .neq('website', '')
          .order('id');
      }

      const offset = chunkIndex * CHUNK_SIZE;
      const { data: listings, error: listErr } = await query.range(offset, offset + CHUNK_SIZE - 1);

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) return Response.json({ message: 'No listings to process', done: true }, { headers: corsHeaders });

      const allListings = listings as Array<{ id: string; website: string }>;

      // Pre-filter listings whose websites are directory/social sites — mark them immediately and skip
      const skippedListings = allListings.filter(l =>
        SKIP_DOMAINS.some(d => l.website.toLowerCase().includes(d))
      );
      const goodListings = allListings.filter(l =>
        !SKIP_DOMAINS.some(d => l.website.toLowerCase().includes(d))
      );

      if (skippedListings.length > 0) {
        await Promise.all(skippedListings.map(l =>
          supabase.from('listings').update({
            crawl_status: 'no_website',
            last_crawled_at: new Date().toISOString(),
          }).eq('id', l.id)
        ));
      }

      // Build url_to_ids: map each unique URL to ALL listing IDs that share it
      // This handles chains where many locations share the same homepage URL
      const urlToIds: Record<string, string[]> = {};
      for (const l of goodListings) {
        if (!urlToIds[l.website]) urlToIds[l.website] = [];
        urlToIds[l.website].push(l.id);
      }
      // Submit only unique URLs to Firecrawl (deduped) — results apply to all matching listings
      const urls = Object.keys(urlToIds);

      if (urls.length === 0) {
        return Response.json({ message: 'All listings in this chunk were skipped (directory/social URLs)', done: true, skipped: skippedListings.length }, { headers: corsHeaders });
      }

      const batchBody: Record<string, unknown> = {
        urls,
        formats: ['markdown', 'images'],
        onlyMainContent: true,
        ignoreInvalidURLs: true,
        maxConcurrency: 50,
        timeout: 30000,
        blockAds: true,
        skipTlsVerification: true,
        removeBase64Images: true,
        location: { country: 'US', languages: ['en-US'] },
        proxy: 'auto',
        storeInCache: true,
      };

      if (appUrl) {
        batchBody.webhook = {
          url: `${appUrl}/api/firecrawl-webhook`,
          events: ['page', 'completed'],
        };
      }

      const fcRes = await fetch(`${FIRECRAWL_API}/batch/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchBody),
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        return Response.json({ error: `Firecrawl error ${fcRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const fcData = await fcRes.json() as { success: boolean; id: string };
      if (!fcData.success || !fcData.id) return Response.json({ error: 'Firecrawl did not return a job ID' }, { status: 502, headers: corsHeaders });

      const { data: batch, error: batchErr } = await supabase.from('pipeline_batches').insert({
        firecrawl_job_id: fcData.id,
        status: 'running',
        total_urls: urls.length,
        chunk_index: chunkIndex,
        url_to_id: urlToIds,
      }).select().single();

      if (batchErr) return Response.json({ error: batchErr.message }, { status: 500, headers: corsHeaders });

      return Response.json({ batch, job_id: fcData.id, urls_submitted: urls.length }, { headers: corsHeaders });
    }

    // --- POLL BATCH ---
    // Processes one page of Firecrawl results per call to avoid timeouts.
    // The UI should call this repeatedly (passing next_cursor) until done=true.
    if (action === 'poll_batch') {
      if (!firecrawlKey || !anthropicKey) return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });

      const jobId: string = body.job_id ?? url.searchParams.get('job_id');
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      // next_cursor is the full Firecrawl pagination URL for the next page, or null to start from beginning
      const nextCursor: string | null = body.next_cursor ?? null;
      // Limit items per page to avoid edge function timeouts (each item requires a Claude API call)
      const pageLimit: number = body.page_limit ?? 20;

      const { data: batch } = await supabase.from('pipeline_batches')
        .select('*').eq('firecrawl_job_id', jobId).maybeSingle();

      // Mark classification as started (or restarted after a stall) on the first poll call
      if (batch && !nextCursor && batch.classify_status !== 'completed') {
        await supabase.from('pipeline_batches').update({
          classify_status: 'running',
          classify_started_at: new Date().toISOString(),
        }).eq('id', batch.id);
      }

      const { data: filterRows } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

      // url_to_id stores either Record<string, string[]> (new) or Record<string, string> (legacy)
      // Keys are original submitted URLs; values are listing ID(s)
      const rawUrlMap = (batch as unknown as { url_to_id?: Record<string, unknown> })?.url_to_id ?? {};
      // Normalize to always be Record<string, string[]>
      const urlToIds: Record<string, string[]> = {};
      for (const [url, val] of Object.entries(rawUrlMap)) {
        if (Array.isArray(val)) urlToIds[url] = val as string[];
        else if (typeof val === 'string' && val) urlToIds[url] = [val];
      }
      const hasUrlMap = Object.keys(urlToIds).length > 0;

      const baseUrl = nextCursor ?? `${FIRECRAWL_API}/batch/scrape/${jobId}`;
      const pageUrl = nextCursor
        ? (nextCursor.includes('limit=') ? nextCursor : `${nextCursor}${nextCursor.includes('?') ? '&' : '?'}limit=${pageLimit}`)
        : `${FIRECRAWL_API}/batch/scrape/${jobId}?limit=${pageLimit}`;
      const pollRes = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });
      void baseUrl;

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return Response.json({ error: `Firecrawl ${pollRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const pollData = await pollRes.json() as {
        status: string;
        total: number;
        completed: number;
        creditsUsed: number;
        data: Array<{
          markdown?: string;
          images?: string[];
          metadata?: { title?: string; sourceURL?: string; url?: string; statusCode?: number };
        }>;
        next?: string;
      };

      const batchStatus = pollData.status;
      const creditsUsed = pollData.creditsUsed ?? 0;
      const items = pollData.data ?? [];

      // Build a normalized lookup: submittedUrlNorm -> listing IDs[]
      // This is the source of truth — keys are exactly what was submitted to Firecrawl
      type ListingRow = { id: string; name: string; is_touchless: boolean | null; hero_image: string | null; logo_photo: string | null; google_logo_url: string | null; google_photo_url: string | null; street_view_url: string | null; website: string; amenities: string[] | null };
      const normToIds = new Map<string, string[]>();
      for (const [url, ids] of Object.entries(urlToIds)) {
        normToIds.set(normalizeUrl(url), ids);
      }

      // Collect all listing IDs referenced by items on this page.
      // Try both sourceURL (original submitted URL) and metadata.url (final URL after redirects).
      // Firecrawl usually preserves sourceURL as the submitted URL, but some redirects may change it.
      const pageAllNorms = items.flatMap(i => [
        normalizeUrl(i.metadata?.sourceURL ?? ''),
        normalizeUrl(i.metadata?.url ?? ''),
      ]);
      const pageIds = pageAllNorms.flatMap(n => normToIds.get(n) ?? []);

      // Fetch listing rows for all IDs on this page
      const listingById = new Map<string, ListingRow>();
      let dbError: string | null = null;
      if (pageIds.length > 0) {
        const uniquePageIds = [...new Set(pageIds)];
        const { data: rows, error: rowsErr } = await supabase.from('listings')
          .select('id, name, is_touchless, hero_image, logo_photo, google_logo_url, google_photo_url, street_view_url, website, amenities')
          .in('id', uniquePageIds);
        if (rowsErr) dbError = rowsErr.message;
        for (const l of (rows ?? [])) listingById.set(l.id, l);
      }
      // URL-based fallback: runs when ID lookup found nothing (covers normalization mismatches,
      // legacy batches without url_to_id, and any DB query issues)
      if (listingById.size === 0 && pageAllNorms.filter(n => n).length > 0) {
        const uniqueNorms = [...new Set(pageAllNorms.filter(n => n))];
        const urlVariants = uniqueNorms.flatMap(norm => [
          `https://${norm}`, `https://${norm}/`,
          `http://${norm}`, `http://${norm}/`,
          `https://www.${norm}`, `https://www.${norm}/`,
        ]);
        if (urlVariants.length > 0) {
          const { data: rows } = await supabase.from('listings')
            .select('id, name, is_touchless, hero_image, logo_photo, google_logo_url, google_photo_url, street_view_url, website, amenities')
            .in('website', urlVariants);
          for (const l of (rows ?? [])) listingById.set(l.id, l);
          for (const l of (rows ?? [])) {
            const n = normalizeUrl(l.website);
            if (!normToIds.has(n)) normToIds.set(n, []);
            normToIds.get(n)!.push(l.id);
          }
        }
      }

      // Helper: given sourceURL and optional final URL, return all matching listing rows.
      // Checks both URLs to handle redirect cases.
      const resolveListings = (sourceURL: string, finalURL?: string): ListingRow[] => {
        const ids = [
          ...(normToIds.get(normalizeUrl(sourceURL)) ?? []),
          ...(finalURL ? (normToIds.get(normalizeUrl(finalURL)) ?? []) : []),
        ];
        const seen = new Set<string>();
        return ids
          .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; })
          .map(id => listingById.get(id))
          .filter(Boolean) as ListingRow[];
      };

      // Process all items on this page in parallel for maximum speed
      type ClassifiedResult = {
        listings: ListingRow[];
        crawl_status: string;
        is_touchless: boolean | null;
        touchless_evidence: string;
        amenities: string[];
        images: string[];
      };

      const results = await Promise.all(items.map(async (item): Promise<ClassifiedResult | null> => {
        const sourceURL = item.metadata?.sourceURL ?? '';
        const finalURL = item.metadata?.url ?? '';
        const statusCode = item.metadata?.statusCode ?? 0;
        const markdown = item.markdown ?? '';
        const images = item.images ?? [];

        const allListings = resolveListings(sourceURL, finalURL);
        if (allListings.length === 0) return null;

        // Process unclassified listings, plus already-confirmed touchless ones (for enrichment)
        const listings = allListings.filter(l => l.is_touchless === null || l.is_touchless === true);
        if (listings.length === 0) return null;

        let crawl_status = 'success';
        let is_touchless: boolean | null = null;
        let touchless_evidence = '';
        let amenities: string[] = [];

        if (statusCode >= 400 || !markdown || markdown.trim().length < 50) {
          crawl_status = statusCode >= 400 ? 'fetch_failed' : 'no_content';
        } else if (SKIP_DOMAINS.some(d => sourceURL.includes(d))) {
          crawl_status = 'redirect';
        } else {
          try {
            const classification = await classifyWithClaude(markdown, anthropicKey);
            is_touchless = classification.is_touchless ?? null;
            touchless_evidence = classification.touchless_evidence ?? '';
            amenities = classification.amenities ?? [];
            crawl_status = 'classified';
          } catch {
            crawl_status = 'no_content';
          }
        }

        return { listings, crawl_status, is_touchless, touchless_evidence, amenities, images };
      }));

      // Write all results to DB — apply each classification to ALL listings sharing that URL
      const processedItems = results.filter(Boolean) as ClassifiedResult[];
      let totalProcessed = 0;

      await Promise.all(processedItems.map(async ({ listings, crawl_status, is_touchless, touchless_evidence, amenities, images }) => {
        const filteredImages = filterImages(images);
        totalProcessed += listings.length;

        await Promise.all(listings.map(async (listing) => {
          const effectiveTouchless = listing.is_touchless === true ? true : is_touchless;

          const updatePayload: Record<string, unknown> = {
            last_crawled_at: new Date().toISOString(),
            crawl_status,
            touchless_evidence,
          };

          if (listing.is_touchless === null && is_touchless !== null) {
            updatePayload.is_touchless = is_touchless;
          }

          if (effectiveTouchless === true) {
            const knownLogoUrl = listing.google_logo_url ?? listing.logo_photo ?? null;
            const extraPhotos = [listing.google_photo_url, listing.street_view_url].filter(Boolean) as string[];
            const allImages = [
              ...(knownLogoUrl ? [knownLogoUrl] : []),
              ...extraPhotos,
              ...filteredImages,
            ].filter((u, i, arr) => arr.indexOf(u) === i);

            if (allImages.length > 0 && anthropicKey) {
              try {
                const sel = await selectPhotosWithClaude(allImages, knownLogoUrl, listing.name ?? '', effectiveTouchless, anthropicKey);
                if (!sel.no_good_photos) {
                  const galleryUrls = sel.gallery_indices.filter(i => i >= 0 && i < allImages.length).map(i => allImages[i]);
                  if (galleryUrls.length > 0) updatePayload.website_photos = galleryUrls;
                  if (sel.hero_index >= 0 && sel.hero_index < allImages.length) updatePayload.hero_image = allImages[sel.hero_index];
                  if (sel.logo_index >= 0 && sel.logo_index < allImages.length && !listing.logo_photo) updatePayload.logo_photo = allImages[sel.logo_index];
                } else if (filteredImages.length > 0) {
                  updatePayload.website_photos = filteredImages;
                  if (!listing.hero_image) updatePayload.hero_image = filteredImages[0];
                }
              } catch {
                if (filteredImages.length > 0) {
                  updatePayload.website_photos = filteredImages;
                  if (!listing.hero_image) updatePayload.hero_image = filteredImages[0];
                }
              }
            } else if (filteredImages.length > 0) {
              updatePayload.website_photos = filteredImages;
              if (!listing.hero_image) updatePayload.hero_image = filteredImages[0];
            }

            if (amenities.length > 0) {
              const existing = listing.amenities ?? [];
              const merged = [...existing, ...amenities.filter(a => !existing.includes(a))];
              if (merged.length > existing.length) updatePayload.amenities = merged;
            }
          }

          await Promise.all([
            supabase.from('listings').update(updatePayload).eq('id', listing.id),
            supabase.from('pipeline_runs').insert({
              listing_id: listing.id,
              batch_id: batch?.id ?? null,
              crawl_status,
              is_touchless,
              touchless_evidence,
              raw_markdown: markdown.slice(0, 50000),
              images_found: images.length,
            }),
            syncFilters(supabase, listing.id, is_touchless, amenities, filterMap),
          ]);
        }));
      }));

      // Use Firecrawl's actual completed count as the source of truth, not the accumulated DB value.
      // This prevents stale DB values from causing incorrect counts on resume/restart.
      const fcCompleted = pollData.completed ?? 0;
      const newClassified = (batch?.classified_count ?? 0) + totalProcessed;

      const hasNextPage = !!pollData.next;
      const hasData = items.length > 0;
      // Only mark done if: no next page, had data to process, AND we actually matched+wrote at least some records.
      // If 0 records matched (URL mismatch), do NOT mark complete — something went wrong.
      const isDone = !hasNextPage && hasData && totalProcessed > 0;
      const isExpired = !hasNextPage && !hasData && fcCompleted === 0;

      if (isExpired) {
        if (batch) {
          await supabase.from('pipeline_batches').update({
            status: 'failed',
            classify_status: 'expired',
            updated_at: new Date().toISOString(),
          }).eq('id', batch.id);
        }
        return Response.json({
          error: 'Firecrawl job data has expired. Please start a new batch.',
          expired: true,
          done: true,
        }, { status: 410, headers: corsHeaders });
      }

      if (batch) {
        await supabase.from('pipeline_batches').update({
          status: isDone && batchStatus === 'completed' ? 'completed' : 'running',
          completed_count: fcCompleted,
          classified_count: newClassified,
          classify_status: isDone ? 'completed' : 'running',
          classify_completed_at: isDone ? new Date().toISOString() : null,
          credits_used: creditsUsed,
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
      }

      return Response.json({
        processed: totalProcessed,
        credits_used: creditsUsed,
        batch_status: batchStatus,
        next_cursor: pollData.next ?? null,
        done: isDone,
        page_size: items.length,
        total_completed: fcCompleted,
        total_urls: batch?.total_urls ?? 0,
        _debug: items.length > 0 ? {
          sample_sourceURL: items[0].metadata?.sourceURL,
          page_norms: pageAllNorms.slice(0, 4),
          map_size: normToIds.size,
          page_ids_found: pageIds.length,
          sample_ids: [...new Set(pageIds)].slice(0, 3),
          listing_by_id_size: listingById.size,
          db_error: dbError,
        } : null,
      }, { headers: corsHeaders });
    }

    // --- RECLASSIFY SAVED ---
    // Re-runs Claude classification on pipeline_runs rows that have raw_markdown
    // but no is_touchless value yet. Processes one page of 10 at a time.
    // No Firecrawl credits used — purely Claude AI from stored data.
    if (action === 'reclassify_saved') {
      if (!anthropicKey) return Response.json({ error: 'Anthropic API key not configured' }, { status: 500, headers: corsHeaders });

      const offset: number = body.offset ?? 0;
      const pageSize = 10;

      const { data: runs, error: runsErr } = await supabase
        .from('pipeline_runs')
        .select('id, listing_id, raw_markdown')
        .is('is_touchless', null)
        .not('raw_markdown', 'is', null)
        .gt('raw_markdown', '')
        .order('processed_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (runsErr) return Response.json({ error: runsErr.message }, { status: 500, headers: corsHeaders });

      const { data: totalRow } = await supabase
        .from('pipeline_runs')
        .select('id', { count: 'exact', head: true })
        .is('is_touchless', null)
        .not('raw_markdown', 'is', null)
        .gt('raw_markdown', '');

      const remaining = (totalRow as unknown as { count: number } | null)?.count ?? 0;

      const { data: filterRows } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

      const pageRuns = runs ?? [];
      let processed = 0;

      await Promise.all(pageRuns.map(async (run) => {
        const markdown = run.raw_markdown ?? '';
        if (markdown.trim().length < 50) return;

        try {
          const classification = await classifyWithClaude(markdown, anthropicKey);
          const { is_touchless, touchless_evidence, amenities } = classification;

          await Promise.all([
            supabase.from('pipeline_runs').update({
              is_touchless: is_touchless ?? null,
              touchless_evidence: touchless_evidence ?? '',
              crawl_status: 'success',
            }).eq('id', run.id),

            supabase.from('listings').update({
              is_touchless: is_touchless ?? null,
              touchless_evidence: touchless_evidence ?? '',
              ...(amenities?.length ? { amenities } : {}),
              last_crawled_at: new Date().toISOString(),
            }).eq('id', run.listing_id).is('is_touchless', null),

            syncFilters(supabase, run.listing_id, is_touchless ?? null, amenities ?? [], filterMap),
          ]);

          processed++;
        } catch {
          // skip failed classifications silently
        }
      }));

      const nextOffset = offset + pageSize;
      const isDone = pageRuns.length < pageSize;

      return Response.json({
        processed,
        offset: nextOffset,
        done: isDone,
        remaining_before: remaining,
      }, { headers: corsHeaders });
    }

    // --- RETRY CLASSIFY FAILURES WITH FIRECRAWL ---
    // Fetches ALL eligible listings and submits them in a single Firecrawl batch.
    // Firecrawl's batch/scrape endpoint has no documented URL limit.
    // Supabase returns max 1000 rows per query, so we paginate the fetch then
    // submit all URLs in one shot.
    if (action === 'retry_classify_failures' || action === 'retry_all_chunks') {
      if (!firecrawlKey) return Response.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500, headers: corsHeaders });

      // DEDUPLICATION GUARD: reject if any batch is already running to prevent double-billing
      const { data: existingRunning } = await supabase
        .from('pipeline_batches')
        .select('id, firecrawl_job_id, total_urls, created_at')
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRunning && !body.force) {
        return Response.json({
          error: `A Firecrawl batch is already running (job ${existingRunning.firecrawl_job_id}, ${existingRunning.total_urls} URLs). Cancel it before starting a new one, or pass force:true to override.`,
          existing_job_id: existingRunning.firecrawl_job_id,
          already_running: true,
        }, { status: 409, headers: corsHeaders });
      }

      const appUrl = body.app_url ?? Deno.env.get('APP_URL') ?? '';
      const targetStatuses: string[] = body.statuses ?? ['fetch_failed', 'unknown', 'classify_failed'];

      // Paginate Supabase to collect all matching listings (max 1000/page)
      const PAGE = 1000;
      let allListings: Array<{ id: string; website: string }> = [];
      let offset = 0;
      while (true) {
        const { data, error: fetchErr } = await supabase
          .from('listings')
          .select('id, website')
          .in('crawl_status', targetStatuses)
          .not('website', 'is', null)
          .neq('website', '')
          .order('id')
          .range(offset, offset + PAGE - 1);
        if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500, headers: corsHeaders });
        const rows = (data ?? []) as Array<{ id: string; website: string }>;
        allListings = allListings.concat(rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
      }

      if (allListings.length === 0) {
        return Response.json({ message: 'No listings to retry', done: true, batches: [] }, { headers: corsHeaders });
      }

      // Mark directory/social URLs as no_website and skip them
      const skipped = allListings.filter(l => SKIP_DOMAINS.some(d => l.website.toLowerCase().includes(d)));
      const good = allListings.filter(l => !SKIP_DOMAINS.some(d => l.website.toLowerCase().includes(d)));

      if (skipped.length > 0) {
        await Promise.all(skipped.map(l =>
          supabase.from('listings').update({ crawl_status: 'no_website', last_crawled_at: new Date().toISOString() }).eq('id', l.id)
        ));
      }

      if (good.length === 0) {
        return Response.json({ message: 'All listings were skipped (directory/social URLs)', done: true, skipped: skipped.length, batches: [] }, { headers: corsHeaders });
      }

      const urlToIds: Record<string, string[]> = {};
      for (const l of good) {
        if (!urlToIds[l.website]) urlToIds[l.website] = [];
        urlToIds[l.website].push(l.id);
      }
      const urls = Object.keys(urlToIds);

      const batchBody: Record<string, unknown> = {
        urls,
        formats: ['markdown', 'images'],
        onlyMainContent: true,
        ignoreInvalidURLs: true,
        maxConcurrency: 50,
        timeout: 30000,
        blockAds: true,
        skipTlsVerification: true,
        removeBase64Images: true,
        location: { country: 'US', languages: ['en-US'] },
        proxy: 'auto',
        storeInCache: false,
      };

      if (appUrl) {
        batchBody.webhook = { url: `${appUrl}/api/firecrawl-webhook`, events: ['page', 'completed'] };
      }

      const fcRes = await fetch(`${FIRECRAWL_API}/batch/scrape`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batchBody),
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        return Response.json({ error: `Firecrawl error ${fcRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const fcData = await fcRes.json() as { success: boolean; id: string };
      if (!fcData.success || !fcData.id) return Response.json({ error: 'Firecrawl did not return a job ID' }, { status: 502, headers: corsHeaders });

      const { data: batch, error: batchErr } = await supabase.from('pipeline_batches').insert({
        firecrawl_job_id: fcData.id,
        status: 'running',
        total_urls: urls.length,
        chunk_index: 0,
        url_to_id: urlToIds,
      }).select().single();

      if (batchErr) return Response.json({ error: batchErr.message }, { status: 500, headers: corsHeaders });

      return Response.json({
        batches: [{ chunk_index: 0, job_id: fcData.id, urls_submitted: urls.length, batch_id: batch?.id ?? null }],
        job_id: fcData.id,
        urls_submitted: urls.length,
        skipped: skipped.length,
        total_submitted: urls.length,
        total_chunks: 1,
      }, { headers: corsHeaders });
    }

    // --- AUTO POLL (server-driven, tab-independent) ---
    if (action === 'auto_poll') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId: string = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

      const { data: batch } = await supabase
        .from('pipeline_batches')
        .select('id, status, classify_status, classified_count, total_urls, url_to_id')
        .eq('firecrawl_job_id', jobId)
        .maybeSingle();

      if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404, headers: corsHeaders });

      if (batch.classify_status === 'completed' || batch.classify_status === 'expired') {
        return Response.json({ done: true, classify_status: batch.classify_status }, { headers: corsHeaders });
      }

      const nextCursor: string | null = body.next_cursor ?? null;
      const pageLimit = 20;

      const pageUrl = nextCursor
        ? (nextCursor.includes('limit=') ? nextCursor : `${nextCursor}${nextCursor.includes('?') ? '&' : '?'}limit=${pageLimit}`)
        : `${FIRECRAWL_API}/batch/scrape/${jobId}?limit=${pageLimit}`;

      const pollRes = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        await supabase.from('pipeline_batches').update({
          classify_status: 'failed',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
        return Response.json({ error: `Firecrawl ${pollRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const pollData = await pollRes.json() as {
        status: string;
        total: number;
        completed: number;
        creditsUsed: number;
        data: Array<{
          markdown?: string;
          images?: string[];
          metadata?: { title?: string; sourceURL?: string; statusCode?: number };
        }>;
        next?: string;
      };

      const batchStatus = pollData.status;
      const creditsUsed = pollData.creditsUsed ?? 0;
      const items = pollData.data ?? [];

      const isExpired = !pollData.next && items.length === 0 && (pollData.completed ?? 0) === 0;
      if (isExpired) {
        await supabase.from('pipeline_batches').update({
          status: 'failed',
          classify_status: 'expired',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
        return Response.json({ done: true, expired: true }, { headers: corsHeaders });
      }

      if (items.length === 0 && batchStatus !== 'completed') {
        await supabase.from('pipeline_batches').update({
          classify_status: 'waiting',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);

        EdgeRuntime.waitUntil(
          new Promise<void>(resolve => setTimeout(resolve, 8000)).then(() =>
            fetch(`${supabaseUrl}/functions/v1/firecrawl-pipeline`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
              body: JSON.stringify({ action: 'auto_poll', job_id: jobId, next_cursor: nextCursor }),
            }).catch(() => {})
          )
        );

        return Response.json({ waiting: true, done: false }, { headers: corsHeaders });
      }

      const { data: filterRows } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

      // Normalize url_to_id to always be Record<string, string[]> (handles both legacy string and new array format)
      const rawUrlToId = (batch as unknown as { url_to_id?: Record<string, unknown> })?.url_to_id ?? {};
      const urlToIds: Record<string, string[]> = {};
      for (const [url, val] of Object.entries(rawUrlToId)) {
        if (Array.isArray(val)) urlToIds[url] = val as string[];
        else if (typeof val === 'string' && val) urlToIds[url] = [val];
      }
      const hasUrlMap = Object.keys(urlToIds).length > 0;

      // Build normalized lookup: normalizedUrl -> listing IDs[]
      const normToIds = new Map<string, string[]>();
      for (const [url, ids] of Object.entries(urlToIds)) {
        normToIds.set(normalizeUrl(url), ids);
      }

      type ListingRowAP = { id: string; is_touchless: boolean | null; hero_image: string | null; website: string };
      const listingById = new Map<string, ListingRowAP>();

      if (hasUrlMap) {
        const sourceURLs = items.map(i => i.metadata?.sourceURL ?? '').filter(Boolean);
        const pageNorms = sourceURLs.map(u => normalizeUrl(u));
        const allIds = pageNorms.flatMap(n => normToIds.get(n) ?? []);
        const uniqueIds = [...new Set(allIds)];
        if (uniqueIds.length > 0) {
          const { data: matchedListings } = await supabase.from('listings')
            .select('id, is_touchless, hero_image, website')
            .in('id', uniqueIds);
          for (const l of (matchedListings ?? [])) listingById.set(l.id, l);
        }
      } else {
        const sourceURLs = items.map(i => i.metadata?.sourceURL ?? '').filter(Boolean);
        const urlVariants = sourceURLs.flatMap(u => {
          const norm = normalizeUrl(u);
          return [`https://${norm}`, `https://${norm}/`, `http://${norm}`, `http://${norm}/`, `https://www.${norm}`, `https://www.${norm}/`];
        });
        const { data: matchedListings } = await supabase.from('listings')
          .select('id, is_touchless, hero_image, website')
          .in('website', urlVariants);
        for (const l of (matchedListings ?? [])) {
          listingById.set(l.id, l);
          const n = normalizeUrl(l.website);
          if (!normToIds.has(n)) normToIds.set(n, []);
          normToIds.get(n)!.push(l.id);
        }
      }

      const resolveListingsAP = (sourceURL: string): ListingRowAP[] => {
        const ids = normToIds.get(normalizeUrl(sourceURL)) ?? [];
        const seen = new Set<string>();
        return ids
          .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; })
          .map(id => listingById.get(id))
          .filter(Boolean) as ListingRowAP[];
      };

      const results = await Promise.all(items.map(async (item) => {
        const sourceURL = item.metadata?.sourceURL ?? '';
        const statusCode = item.metadata?.statusCode ?? 0;
        const allListings = resolveListingsAP(sourceURL);
        if (allListings.length === 0) return null;
        const listings = allListings.filter(l => l.is_touchless === null);
        if (listings.length === 0) return null;

        let crawl_status = 'success';
        let is_touchless: boolean | null = null;
        let touchless_evidence = '';
        let amenities: string[] = [];
        const markdown = item.markdown ?? '';
        const images = item.images ?? [];

        if (statusCode >= 400 || !markdown || markdown.trim().length < 50) {
          crawl_status = statusCode >= 400 ? 'fetch_failed' : 'no_content';
        } else if (SKIP_DOMAINS.some(d => sourceURL.includes(d))) {
          crawl_status = 'redirect';
        } else {
          try {
            const classification = await classifyWithClaude(markdown, anthropicKey);
            is_touchless = classification.is_touchless ?? null;
            touchless_evidence = classification.touchless_evidence ?? '';
            amenities = classification.amenities ?? [];
            crawl_status = 'classified';
          } catch {
            crawl_status = 'no_content';
          }
        }

        return { listings, crawl_status, is_touchless, touchless_evidence, amenities, images };
      }));

      type APResult = { listings: ListingRowAP[]; crawl_status: string; is_touchless: boolean | null; touchless_evidence: string; amenities: string[]; images: string[] };
      const processed = results.filter(Boolean) as APResult[];
      let totalProcessedAP = 0;

      await Promise.all(processed.map(async ({ listings: rowListings, crawl_status, is_touchless, touchless_evidence, amenities, images }) => {
        const filteredImages = filterImages(images);
        totalProcessedAP += rowListings.length;

        await Promise.all(rowListings.map(async (listing) => {
          const updatePayload: Record<string, unknown> = {
            last_crawled_at: new Date().toISOString(),
            crawl_status,
            touchless_evidence,
            website_photos: filteredImages.length > 0 ? filteredImages : null,
          };
          if (listing.is_touchless === null && is_touchless !== null) updatePayload.is_touchless = is_touchless;
          if (!listing.hero_image && filteredImages.length > 0) updatePayload.hero_image = filteredImages[0];
          if (amenities.length > 0) updatePayload.amenities = amenities;

          await Promise.all([
            supabase.from('listings').update(updatePayload).eq('id', listing.id),
            supabase.from('pipeline_runs').insert({
              listing_id: listing.id,
              batch_id: batch.id,
              crawl_status,
              is_touchless,
              touchless_evidence,
              images_found: images.length,
            }),
            syncFilters(supabase, listing.id, is_touchless, amenities, filterMap),
          ]);
        }));
      }));

      const fcCompleted = pollData.completed ?? 0;
      const newClassified = (batch.classified_count ?? 0) + totalProcessedAP;
      const hasNextPage = !!pollData.next;
      const isDone = !hasNextPage && items.length > 0;

      await supabase.from('pipeline_batches').update({
        status: isDone && batchStatus === 'completed' ? 'completed' : 'running',
        completed_count: fcCompleted,
        classified_count: newClassified,
        classify_status: isDone ? 'completed' : 'running',
        classify_completed_at: isDone ? new Date().toISOString() : null,
        credits_used: creditsUsed,
        updated_at: new Date().toISOString(),
      }).eq('id', batch.id);

      if (!isDone) {
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/firecrawl-pipeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
            body: JSON.stringify({ action: 'auto_poll', job_id: jobId, next_cursor: pollData.next ?? null }),
          }).catch(() => {})
        );
      }

      return Response.json({
        processed: totalProcessedAP,
        classified: newClassified,
        done: isDone,
        next_cursor: pollData.next ?? null,
      }, { headers: corsHeaders });
    }

    // --- ENRICH TOUCHLESS (submit batch) ---
    // Crawls touchless listings to backfill photos and amenities.
    // Never modifies is_touchless — purely additive enrichment.
    if (action === 'enrich_touchless') {
      if (!firecrawlKey) return Response.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500, headers: corsHeaders });

      const limit: number = body.limit ?? 0;
      const appUrl = body.app_url ?? Deno.env.get('APP_URL') ?? '';

      // DEDUPLICATION GUARD — only block if another enrich_touchless batch is actively running
      const { data: existingRunning } = await supabase
        .from('pipeline_batches')
        .select('id, firecrawl_job_id, total_urls, created_at')
        .eq('status', 'running')
        .eq('batch_type', 'enrich_touchless')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRunning && !body.force) {
        return Response.json({
          error: `A Firecrawl batch is already running (job ${existingRunning.firecrawl_job_id}, ${existingRunning.total_urls} URLs). Pass force:true to override.`,
          existing_job_id: existingRunning.firecrawl_job_id,
          already_running: true,
        }, { status: 409, headers: corsHeaders });
      }

      const PAGE = 1000;
      let allListings: Array<{ id: string; website: string }> = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('listings')
          .select('id, website')
          .eq('is_touchless', true)
          .not('website', 'is', null)
          .neq('website', '')
          .order('id')
          .range(offset, offset + PAGE - 1);

        const { data, error: fetchErr } = await query;
        if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500, headers: corsHeaders });
        const rows = (data ?? []) as Array<{ id: string; website: string }>;
        allListings = allListings.concat(rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
        if (limit > 0 && allListings.length >= limit) break;
      }

      if (limit > 0) allListings = allListings.slice(0, limit);

      if (allListings.length === 0) {
        return Response.json({ message: 'No touchless listings with websites found', done: true }, { headers: corsHeaders });
      }

      const good = allListings.filter(l => !SKIP_DOMAINS.some(d => l.website.toLowerCase().includes(d)));

      if (good.length === 0) {
        return Response.json({ message: 'All listings had directory/social URLs', done: true }, { headers: corsHeaders });
      }

      const urlToIds: Record<string, string[]> = {};
      for (const l of good) {
        if (!urlToIds[l.website]) urlToIds[l.website] = [];
        urlToIds[l.website].push(l.id);
      }
      const urls = Object.keys(urlToIds);

      const batchBody: Record<string, unknown> = {
        urls,
        formats: ['markdown', 'images'],
        onlyMainContent: true,
        ignoreInvalidURLs: true,
        maxConcurrency: 50,
        timeout: 30000,
        blockAds: true,
        skipTlsVerification: true,
        removeBase64Images: true,
        location: { country: 'US', languages: ['en-US'] },
        proxy: 'auto',
        storeInCache: true,
      };

      if (appUrl) {
        batchBody.webhook = { url: `${appUrl}/api/firecrawl-webhook`, events: ['page', 'completed'] };
      }

      const fcRes = await fetch(`${FIRECRAWL_API}/batch/scrape`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batchBody),
      });

      if (!fcRes.ok) {
        const errText = await fcRes.text();
        return Response.json({ error: `Firecrawl error ${fcRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const fcData = await fcRes.json() as { success: boolean; id: string };
      if (!fcData.success || !fcData.id) return Response.json({ error: 'Firecrawl did not return a job ID' }, { status: 502, headers: corsHeaders });

      const { data: batch, error: batchErr } = await supabase.from('pipeline_batches').insert({
        firecrawl_job_id: fcData.id,
        status: 'running',
        total_urls: urls.length,
        chunk_index: 0,
        url_to_id: urlToIds,
        batch_type: 'enrich_touchless',
      }).select().single();

      if (batchErr) return Response.json({ error: batchErr.message }, { status: 500, headers: corsHeaders });

      return Response.json({
        job_id: fcData.id,
        batch_id: (batch as { id: string } | null)?.id ?? null,
        urls_submitted: urls.length,
        listings_count: good.length,
        batches: [{ chunk_index: 0, job_id: fcData.id, urls_submitted: urls.length }],
        total_submitted: urls.length,
      }, { headers: corsHeaders });
    }

    // --- ENRICH TOUCHLESS POLL (auto_poll for enrichment batches) ---
    // Same as auto_poll but only updates photos/amenities, never is_touchless.
    if (action === 'enrich_auto_poll') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId: string = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const ENRICH_PAGE_LIMIT = 5;

      const { data: batch } = await supabase
        .from('pipeline_batches')
        .select('id, status, classify_status, classified_count, total_urls, url_to_id')
        .eq('firecrawl_job_id', jobId)
        .maybeSingle();

      if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404, headers: corsHeaders });

      if (batch.classify_status === 'completed' || batch.classify_status === 'expired') {
        return Response.json({ done: true, classify_status: batch.classify_status }, { headers: corsHeaders });
      }

      const nextCursor: string | null = body.next_cursor ?? null;

      const pageUrl = nextCursor
        ? (nextCursor.includes('limit=') ? nextCursor : `${nextCursor}${nextCursor.includes('?') ? '&' : '?'}limit=${ENRICH_PAGE_LIMIT}`)
        : `${FIRECRAWL_API}/batch/scrape/${jobId}?limit=${ENRICH_PAGE_LIMIT}`;

      const pollRes = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        await supabase.from('pipeline_batches').update({
          classify_status: 'failed',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
        return Response.json({ error: `Firecrawl ${pollRes.status}: ${errText}` }, { status: 502, headers: corsHeaders });
      }

      const pollData = await pollRes.json() as {
        status: string;
        total: number;
        completed: number;
        creditsUsed: number;
        data: Array<{
          markdown?: string;
          images?: string[];
          metadata?: { title?: string; sourceURL?: string; statusCode?: number };
        }>;
        next?: string;
      };

      const batchStatus = pollData.status;
      const creditsUsed = pollData.creditsUsed ?? 0;
      const items = pollData.data ?? [];

      const isExpired = !pollData.next && items.length === 0 && (pollData.completed ?? 0) === 0;
      if (isExpired) {
        await supabase.from('pipeline_batches').update({
          status: 'failed',
          classify_status: 'expired',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
        return Response.json({ done: true, expired: true }, { headers: corsHeaders });
      }

      if (items.length === 0 && batchStatus !== 'completed') {
        await supabase.from('pipeline_batches').update({
          classify_status: 'waiting',
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);

        EdgeRuntime.waitUntil(
          new Promise<void>(resolve => setTimeout(resolve, 8000)).then(() =>
            fetch(`${supabaseUrl}/functions/v1/firecrawl-pipeline`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
              body: JSON.stringify({ action: 'enrich_auto_poll', job_id: jobId, next_cursor: nextCursor }),
            }).catch(() => {})
          )
        );

        return Response.json({ waiting: true, done: false }, { headers: corsHeaders });
      }

      const { data: filterRows } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

      const rawUrlToId = (batch as unknown as { url_to_id?: Record<string, unknown> })?.url_to_id ?? {};
      const urlToIds: Record<string, string[]> = {};
      for (const [rawUrl, val] of Object.entries(rawUrlToId)) {
        if (Array.isArray(val)) urlToIds[rawUrl] = val as string[];
        else if (typeof val === 'string' && val) urlToIds[rawUrl] = [val];
      }

      const normToIds = new Map<string, string[]>();
      for (const [rawUrl, ids] of Object.entries(urlToIds)) {
        normToIds.set(normalizeUrl(rawUrl), ids);
      }

      type EnrichRow = { id: string; name: string; is_touchless: boolean | null; hero_image: string | null; logo_photo: string | null; google_logo_url: string | null; google_photo_url: string | null; street_view_url: string | null; website: string; amenities: string[] | null };
      const listingById = new Map<string, EnrichRow>();

      const sourceURLs = items.map(i => i.metadata?.sourceURL ?? '').filter(Boolean);
      const pageNorms = sourceURLs.map(u => normalizeUrl(u));
      const allIds = pageNorms.flatMap(n => normToIds.get(n) ?? []);
      const uniqueIds = [...new Set(allIds)];
      if (uniqueIds.length > 0) {
        const { data: matchedListings } = await supabase.from('listings')
          .select('id, name, is_touchless, hero_image, logo_photo, google_logo_url, google_photo_url, street_view_url, website, amenities')
          .in('id', uniqueIds);
        for (const l of (matchedListings ?? [])) listingById.set(l.id, l);
      }

      const resolveEnrichListings = (sourceURL: string): EnrichRow[] => {
        const ids = normToIds.get(normalizeUrl(sourceURL)) ?? [];
        const seen = new Set<string>();
        return ids
          .filter(id => { if (seen.has(id)) return false; seen.add(id); return true; })
          .map(id => listingById.get(id))
          .filter(Boolean) as EnrichRow[];
      };

      type EnrichResult = { listings: EnrichRow[]; amenities: string[]; images: string[] };
      const processed: EnrichResult[] = [];
      for (const item of items) {
        const sourceURL = item.metadata?.sourceURL ?? '';
        const statusCode = item.metadata?.statusCode ?? 0;
        const allListings = resolveEnrichListings(sourceURL);
        if (allListings.length === 0) continue;
        const listings = allListings.filter(l => l.is_touchless === true);
        if (listings.length === 0) continue;
        const markdown = item.markdown ?? '';
        const images = item.images ?? [];
        if (statusCode >= 400 || !markdown || markdown.trim().length < 50) continue;
        let amenities: string[] = [];
        try {
          const classification = await classifyWithClaude(markdown, anthropicKey);
          amenities = classification.amenities ?? [];
        } catch { /* skip */ }
        processed.push({ listings, amenities, images });
      }

      let totalProcessed = 0;

      for (const { listings: rowListings, amenities, images } of processed) {
        const websiteImages = filterImages(images);
        totalProcessed += rowListings.length;

        for (const listing of rowListings) {
          const updatePayload: Record<string, unknown> = {
            last_crawled_at: new Date().toISOString(),
          };

          const knownLogoUrl = listing.google_logo_url ?? listing.logo_photo ?? null;
          const extraPhotos = [
            listing.google_photo_url,
            listing.street_view_url,
          ].filter(Boolean) as string[];

          const allImages = [
            ...(knownLogoUrl ? [knownLogoUrl] : []),
            ...extraPhotos,
            ...websiteImages,
          ].filter((u, i, arr) => arr.indexOf(u) === i);

          if (allImages.length > 0 && anthropicKey) {
            try {
              const sel = await selectPhotosWithClaude(
                allImages,
                knownLogoUrl,
                listing.name ?? '',
                listing.is_touchless ?? null,
                anthropicKey,
              );
              if (!sel.no_good_photos) {
                const galleryUrls = sel.gallery_indices
                  .filter(i => i >= 0 && i < allImages.length)
                  .map(i => allImages[i]);
                if (galleryUrls.length > 0) updatePayload.website_photos = galleryUrls;
                if (sel.hero_index >= 0 && sel.hero_index < allImages.length) {
                  updatePayload.hero_image = allImages[sel.hero_index];
                }
                if (sel.logo_index >= 0 && sel.logo_index < allImages.length && !listing.logo_photo) {
                  updatePayload.logo_photo = allImages[sel.logo_index];
                }
              } else if (websiteImages.length > 0) {
                updatePayload.website_photos = websiteImages;
                if (!listing.hero_image) updatePayload.hero_image = websiteImages[0];
              }
            } catch {
              if (websiteImages.length > 0) {
                updatePayload.website_photos = websiteImages;
                if (!listing.hero_image) updatePayload.hero_image = websiteImages[0];
              }
            }
          } else if (websiteImages.length > 0) {
            updatePayload.website_photos = websiteImages;
            if (!listing.hero_image) updatePayload.hero_image = websiteImages[0];
          }

          if (amenities.length > 0) {
            const existing = listing.amenities ?? [];
            const merged = [...existing, ...amenities.filter(a => !existing.includes(a))];
            if (merged.length > existing.length) {
              updatePayload.amenities = merged;
            }
          }

          await Promise.all([
            supabase.from('listings').update(updatePayload).eq('id', listing.id),
            syncFilters(supabase, listing.id, true, amenities, filterMap),
          ]);
        }
      }

      const fcCompleted = pollData.completed ?? 0;
      const newClassified = (batch.classified_count ?? 0) + totalProcessed;
      const hasNextPage = !!pollData.next;
      const isDone = !hasNextPage && items.length > 0;

      await supabase.from('pipeline_batches').update({
        status: isDone && batchStatus === 'completed' ? 'completed' : 'running',
        completed_count: fcCompleted,
        classified_count: newClassified,
        classify_status: isDone ? 'completed' : 'running',
        classify_completed_at: isDone ? new Date().toISOString() : null,
        credits_used: creditsUsed,
        updated_at: new Date().toISOString(),
      }).eq('id', batch.id);

      if (!isDone) {
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/firecrawl-pipeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
            body: JSON.stringify({ action: 'enrich_auto_poll', job_id: jobId, next_cursor: pollData.next ?? null }),
          }).catch(() => {})
        );
      }

      return Response.json({
        processed: totalProcessed,
        enriched: newClassified,
        done: isDone,
        next_cursor: pollData.next ?? null,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
