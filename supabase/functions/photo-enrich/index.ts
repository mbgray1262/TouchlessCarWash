import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';
const MAX_PHOTOS = 5;
const MIN_GALLERY_TARGET = 3;

const SKIP_DOMAINS = [
  'facebook.com', 'yelp.com', 'google.com', 'yellowpages.com',
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
): Promise<{ verdict: 'GOOD' | 'BAD_CONTACT' | 'BAD_OTHER'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image' };

  const prompt = `You are evaluating a photo for a touchless car wash directory. Classify this image as:
GOOD (clear exterior shot of an automated/touchless car wash facility, wash tunnel, or building signage),
BAD_CONTACT (shows brushes, cloth strips, mops, or any contact wash equipment), or
BAD_OTHER (poor quality, car interior, people only, logo/graphic, blurry, or not clearly a car wash).
Reply with only the classification and a one-sentence reason, formatted as: VERDICT: reason`;

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
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = (data.content?.[0]?.text ?? '').trim();
  const clean = text.replace(/^VERDICT:\s*/i, '').trim();

  if (clean.startsWith('GOOD')) return { verdict: 'GOOD', reason: clean.replace(/^GOOD[:\s-]*/i, '').trim() };
  if (clean.startsWith('BAD_CONTACT')) return { verdict: 'BAD_CONTACT', reason: clean.replace(/^BAD_CONTACT[:\s-]*/i, '').trim() };
  return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
}

interface UrlTraceEntry {
  url: string;
  passed: boolean;
  reason: string | null;
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
    { test: s => s.includes('facebook.com') || s.includes('twitter.com') || s.includes('instagram.com'), label: 'social domain' },
    { test: s => s.includes('google-analytics') || s.includes('pixel') || s.includes('tracking'), label: 'tracking keyword' },
    { test: s => s.includes('1x1') || s.includes('spacer') || s.includes('blank'), label: 'spacer/blank keyword' },
    { test: s => s.includes('badge') || s.includes('banner') || s.includes('button'), label: "'banner'/'badge'/'button' keyword" },
    { test: s => s.includes('simoniz') || s.includes('armorall') || s.includes('turtle') || s.includes('rainx'), label: 'brand product keyword' },
    { test: s => s.includes('social') || s.includes('share') || s.includes('sprite'), label: "'social'/'share'/'sprite' keyword" },
    { test: s => /[_\-/]nav[_\-/.]/.test(s) || s.includes('/nav') || s.endsWith('nav.jpg') || s.endsWith('nav.png') || s.endsWith('nav.webp'), label: "'nav' navigation image keyword" },
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
    if (!/\.(jpg|jpeg|png|webp)/i.test(lower)) {
      trace.push({ url, passed: false, reason: 'rejected: no image extension' });
      continue;
    }
    trace.push({ url, passed: true, reason: null });
  }

  const candidates = trace.filter(e => e.passed).map(e => e.url);
  return { candidates, trace };
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

// BUG 1 FIX: Only BAD photos go into badUrls — GOOD photos are never added to the blocked list.
// Previously, GOOD photos were also pushed into rejected[], corrupting blocked_photos.
async function screenAndRehost(
  urls: string[],
  approved: string[],
  badUrls: string[],
  listingId: string,
  supabase: ReturnType<typeof createClient>,
  anthropicKey: string,
  maxApprove: number,
  crawlNotes: string,
): Promise<ScreenResult> {
  const approvedBefore = approved.length;
  for (const url of urls) {
    if (approved.length >= maxApprove) break;
    try {
      const result = await classifyPhotoWithClaude(url, anthropicKey);
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

// BUG 2 FIX: Extract image URLs from HTML content since Firecrawl does not
// return an images[] array — it returns rendered HTML. Parse src/data-src attributes.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'FIRECRAWL_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');

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

      let query = supabase
        .from('listings')
        .select('id, name, website, google_photo_url, google_logo_url, street_view_url, hero_image, hero_image_source, logo_photo, crawl_notes, photos, website_photos, blocked_photos')
        .eq('is_touchless', true)
        .order('hero_image', { nullsFirst: true })
        .order('id');

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ error: 'No touchless listings found' }, { status: 404, headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('photo_enrich_jobs')
        .insert({
          total: listings.length,
          processed: 0,
          succeeded: 0,
          status: 'running',
          started_at: new Date().toISOString(),
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
        current_hero: l.hero_image,
        current_hero_source: l.hero_image_source,
        current_logo: l.logo_photo,
        current_crawl_notes: l.crawl_notes,
        task_status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('photo_enrich_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/photo-enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
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
        .select('id, status, total, processed, succeeded')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const { data: tasks } = await supabase
        .from('photo_enrich_tasks')
        .select('id, listing_id, listing_name, website, google_photo_url, google_logo_url, street_view_url, current_hero, current_hero_source, current_logo, current_crawl_notes')
        .eq('job_id', jobId)
        .eq('task_status', 'pending')
        .order('id')
        .limit(1);

      const task = tasks?.[0];
      if (!task) {
        await supabase.from('photo_enrich_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      await supabase.from('photo_enrich_tasks').update({ task_status: 'in_progress' }).eq('id', task.id);

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
      // BUG 1 FIX: badUrls only contains genuinely bad photo URLs — never GOOD ones.
      // Previously this was called "rejected" and GOOD photos were also pushed into it,
      // which corrupted blocked_photos and blacklisted good photos permanently.
      let badUrls: string[] = [...blockedPhotos];
      // BUG 1 FIX: heroPhoto is tracked independently from approved[].
      // Previously the hero was derived as approved[0] which could be wrong when
      // approved[] was full of gallery photos before the google photo was unshift-ed.
      let heroPhoto: string | null = heroIsManual ? (task.current_hero as string) : null;
      let heroSource: string | null = heroIsManual ? (task.current_hero_source as string) : null;
      let crawlNotes: string = (task.current_crawl_notes as string) ?? '';

      for (const p of currentPhotos) {
        if (p && !approved.includes(p) && approved.length < MAX_PHOTOS) {
          approved.push(p);
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
        total_approved: 0,
        fallback_reason: null,
      };

      // ---- STEP 1: Screen google_photo_url ----
      const googleUrl = task.google_photo_url as string | null;
      trace.google_photo_exists = !!googleUrl;
      if (googleUrl && !badUrls.includes(googleUrl)) {
        try {
          const result = await classifyPhotoWithClaude(googleUrl, anthropicKey);
          trace.google_verdict = result.verdict;
          trace.google_reason = result.reason;
          if (result.verdict === 'GOOD') {
            const rehosted = await rehostToStorage(supabase, googleUrl, task.listing_id as string, 'google_photo');
            const finalUrl = rehosted ?? googleUrl;
            // Always set as hero — independent of gallery capacity
            if (!heroIsManual) {
              heroPhoto = finalUrl;
              heroSource = 'google';
            }
            if (!approved.includes(finalUrl) && approved.length < MAX_PHOTOS) {
              approved.unshift(finalUrl);
            }
          } else {
            badUrls.push(googleUrl);
            if (result.verdict === 'BAD_CONTACT') {
              const note = `[Google photo BAD_CONTACT: ${result.reason}]`;
              crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
            }
          }
        } catch (e) {
          trace.google_verdict = 'fetch_failed';
          trace.google_reason = (e as Error).message;
        }
      } else if (googleUrl && badUrls.includes(googleUrl)) {
        trace.google_verdict = 'previously_blocked';
        trace.google_reason = 'URL is in blocked_photos list';
      }

      // ---- STEP 2: Screen existing website_photos from DB ----
      if (approved.length < MAX_PHOTOS && websitePhotos.length > 0) {
        const candidates = filterCandidateUrls(websitePhotos, badUrls).slice(0, 15);
        trace.website_photos_screened = candidates.length;
        const approvedBefore = approved.length;
        const r = await screenAndRehost(
          candidates, approved, badUrls, task.listing_id as string,
          supabase, anthropicKey, MAX_PHOTOS, crawlNotes,
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

      // ---- STEP 3: Firecrawl scrape ----
      const websiteUrl = task.website as string | null;
      const shouldFirecrawl = approved.length < MIN_GALLERY_TARGET
        && websitePhotos.length === 0
        && websiteUrl
        && !SKIP_DOMAINS.some(d => websiteUrl.includes(d));

      trace.firecrawl_triggered = !!shouldFirecrawl;

      if (shouldFirecrawl) {
        try {
          // BUG 2 FIX: Request html format and parse image URLs from the markup.
          // The old code requested 'markdown' and read data.images which never exists.
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
            const slicedCandidates = candidates.slice(0, 20);
            trace.firecrawl_url_trace = urlTrace;
            trace.firecrawl_candidates = slicedCandidates.length;
            const approvedBefore = approved.length;

            const r = await screenAndRehost(
              slicedCandidates, approved, badUrls, task.listing_id as string,
              supabase, anthropicKey, MAX_PHOTOS, crawlNotes,
            );
            approved = r.approved;
            badUrls = r.badUrls;
            crawlNotes = r.crawlNotes;
            trace.firecrawl_approved = approved.length - approvedBefore;
            if (!heroIsManual && !heroSource && approved.length > 0) {
              heroSource = 'website';
              heroPhoto = approved[0];
            }
          } else {
            trace.fallback_reason = `Firecrawl HTTP ${fcRes.status}`;
          }
        } catch (e) {
          trace.fallback_reason = `Firecrawl error: ${(e as Error).message}`;
        }
      } else if (!shouldFirecrawl && approved.length < MIN_GALLERY_TARGET) {
        if (!websiteUrl) {
          trace.fallback_reason = 'No website URL';
        } else if (websitePhotos.length > 0) {
          trace.fallback_reason = 'Skipped Firecrawl — website_photos already in DB';
        } else if (SKIP_DOMAINS.some(d => websiteUrl.includes(d))) {
          trace.fallback_reason = 'Skipped Firecrawl — website is a directory/social domain';
        }
      }

      trace.total_approved = approved.length;

      // ---- STEP 4: Street view fallback with Claude screening ----
      // BUG 3 FIX: Screen street view before using it. Car interiors, closed signs,
      // and hand-wash photos are rejected. No hero is better than a bad hero.
      const streetViewUrl = task.street_view_url as string | null;
      if (!heroIsManual && !heroPhoto && streetViewUrl) {
        try {
          const svResult = await classifyPhotoWithClaude(streetViewUrl, anthropicKey);
          if (svResult.verdict === 'GOOD') {
            heroPhoto = streetViewUrl;
            heroSource = 'street_view';
            trace.fallback_reason = (trace.fallback_reason as string | null)
              ? `${trace.fallback_reason}; street view passed screening`
              : 'No approved photos — street view passed screening';
          } else {
            trace.fallback_reason = (trace.fallback_reason as string | null)
              ? `${trace.fallback_reason}; street view rejected (${svResult.verdict}): ${svResult.reason}`
              : `Street view rejected (${svResult.verdict}): ${svResult.reason}`;
          }
        } catch {
          trace.fallback_reason = (trace.fallback_reason as string | null)
            ? `${trace.fallback_reason}; street view fetch failed`
            : 'Street view fetch failed';
        }
      } else if (!heroIsManual && !heroPhoto && !streetViewUrl) {
        trace.fallback_reason = (trace.fallback_reason as string | null)
          ? `${trace.fallback_reason}; no street view available`
          : 'No approved photos and no street view URL';
      }

      // ---- STEP 5: Save ----
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
        crawl_notes: crawlNotes || null,
        blocked_photos: newBlocked,
      };

      if (!heroIsManual && heroPhoto) {
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
        total_approved: trace.total_approved as number,
        fallback_reason: trace.fallback_reason as string | null,
      }).eq('id', task.id);

      await supabase.from('photo_enrich_jobs').update({
        processed: (job.processed ?? 0) + 1,
        succeeded: (job.succeeded ?? 0) + (heroPhoto ? 1 : 0),
      }).eq('id', jobId);

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/photo-enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({
        processed: task.listing_id,
        hero_found: !!heroPhoto,
        hero_source: heroSource,
        approved_count: approved.length,
        gallery_count: galleryPhotos.length,
        rejected_count: badUrls.length,
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
      return Response.json(job, { headers: corsHeaders });
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
        .eq('task_status', 'pending');

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
