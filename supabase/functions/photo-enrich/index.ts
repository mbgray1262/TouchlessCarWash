import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';
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

  if (text.startsWith('GOOD')) return { verdict: 'GOOD', reason: text.replace(/^GOOD[:\s]*/i, '').trim() };
  if (text.startsWith('BAD_CONTACT')) return { verdict: 'BAD_CONTACT', reason: text.replace(/^BAD_CONTACT[:\s]*/i, '').trim() };
  return { verdict: 'BAD_OTHER', reason: text.replace(/^BAD_OTHER[:\s]*/i, '').trim() };
}

function filterCandidateUrls(images: string[], alreadySeen: string[]): string[] {
  const seen = new Set(alreadySeen);
  return images.filter(url => {
    if (seen.has(url)) return false;
    const lower = url.toLowerCase();
    if (lower.includes('favicon')) return false;
    if (lower.includes('logo')) return false;
    if (lower.includes('icon')) return false;
    if (lower.includes('facebook.com') || lower.includes('twitter.com') || lower.includes('instagram.com')) return false;
    if (lower.includes('google-analytics') || lower.includes('pixel') || lower.includes('tracking')) return false;
    if (lower.includes('1x1') || lower.includes('spacer') || lower.includes('blank')) return false;
    if (lower.includes('badge') || lower.includes('banner') || lower.includes('button')) return false;
    if (lower.includes('simoniz') || lower.includes('armorall') || lower.includes('turtle') || lower.includes('rainx')) return false;
    if (lower.includes('social') || lower.includes('share') || lower.includes('sprite')) return false;
    return /\.(jpg|jpeg|png|webp)/i.test(lower);
  });
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

type ScreenResult = { approved: string[]; rejected: string[]; crawlNotes: string };

async function screenAndRehost(
  urls: string[],
  approved: string[],
  rejected: string[],
  listingId: string,
  supabase: ReturnType<typeof createClient>,
  anthropicKey: string,
  maxApprove: number,
  crawlNotes: string,
): Promise<ScreenResult> {
  for (const url of urls) {
    if (approved.length >= maxApprove) break;
    try {
      const result = await classifyPhotoWithClaude(url, anthropicKey);
      if (result.verdict === 'GOOD') {
        const slot = `photo_${approved.length}_${Date.now()}`;
        const rehosted = await rehostToStorage(supabase, url, listingId, slot);
        if (rehosted) approved.push(rehosted);
        rejected.push(url);
      } else {
        rejected.push(url);
        if (result.verdict === 'BAD_CONTACT') {
          const note = `[Photo rejected BAD_CONTACT: ${result.reason}]`;
          crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
        }
      }
    } catch {
      rejected.push(url);
    }
  }
  return { approved, rejected, crawlNotes };
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

    // --- STATUS ---
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

    // --- START BATCH ---
    if (action === 'start') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;

      let query = supabase
        .from('listings')
        .select('id, name, website, google_photo_url, google_logo_url, street_view_url, hero_image, hero_image_source, logo_photo, crawl_notes, photos, website_photos, blocked_photos')
        .eq('is_touchless', true)
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

    // --- PROCESS BATCH ---
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

      // Fetch full listing data needed for this step
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

      // Never overwrite a manually-set hero
      const heroIsManual = task.current_hero_source === 'manual' || task.current_hero_source === 'manual_upload';

      let approved: string[] = [];
      let rejectedUrls: string[] = [...blockedPhotos];
      let heroSource: string | null = heroIsManual ? (task.current_hero_source as string) : null;
      let crawlNotes: string = (task.current_crawl_notes as string) ?? '';

      // Carry forward any already-rehosted gallery photos (skip hero slot)
      for (const p of currentPhotos) {
        if (p && !approved.includes(p) && approved.length < MAX_PHOTOS) {
          approved.push(p);
        }
      }

      // ---- STEP 1: Screen google_photo_url ----
      const googleUrl = task.google_photo_url as string | null;
      if (googleUrl && !rejectedUrls.includes(googleUrl)) {
        try {
          const result = await classifyPhotoWithClaude(googleUrl, anthropicKey);
          if (result.verdict === 'GOOD') {
            const rehosted = await rehostToStorage(supabase, googleUrl, task.listing_id as string, 'google_photo');
            const finalUrl = rehosted ?? googleUrl;
            if (!approved.includes(finalUrl) && approved.length < MAX_PHOTOS) {
              approved.unshift(finalUrl);
            }
            if (!heroIsManual && !heroSource) heroSource = 'google';
          } else {
            rejectedUrls.push(googleUrl);
            if (result.verdict === 'BAD_CONTACT') {
              const note = `[Google photo BAD_CONTACT: ${result.reason}]`;
              crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
            }
          }
        } catch {
          // continue
        }
      }

      // ---- STEP 2: Screen existing website_photos from DB ----
      if (approved.length < MAX_PHOTOS && websitePhotos.length > 0) {
        const candidates = filterCandidateUrls(websitePhotos, rejectedUrls).slice(0, 15);
        const r = await screenAndRehost(
          candidates,
          approved,
          rejectedUrls,
          task.listing_id as string,
          supabase,
          anthropicKey,
          MAX_PHOTOS,
          crawlNotes,
        );
        approved = r.approved;
        rejectedUrls = r.rejected;
        crawlNotes = r.crawlNotes;
        if (!heroIsManual && !heroSource && approved.length > 0) heroSource = 'website';
      }

      // ---- STEP 3: Firecrawl scrape only if < MIN_GALLERY_TARGET approved AND no website_photos in DB ----
      const websiteUrl = task.website as string | null;
      const shouldFirecrawl = approved.length < MIN_GALLERY_TARGET
        && websitePhotos.length === 0
        && websiteUrl
        && !SKIP_DOMAINS.some(d => websiteUrl.includes(d));

      if (shouldFirecrawl) {
        try {
          const fcRes = await fetch(`${FIRECRAWL_API}/scrape`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: websiteUrl,
              formats: ['markdown'],
              onlyMainContent: false,
              includeTags: ['img'],
              timeout: 20000,
            }),
          });

          if (fcRes.ok) {
            const fcData = await fcRes.json() as { success: boolean; data?: { images?: string[] } };
            const rawImages = (fcData.data?.images ?? []) as string[];
            const candidates = filterCandidateUrls(rawImages, rejectedUrls).slice(0, 15);

            const r = await screenAndRehost(
              candidates,
              approved,
              rejectedUrls,
              task.listing_id as string,
              supabase,
              anthropicKey,
              MAX_PHOTOS,
              crawlNotes,
            );
            approved = r.approved;
            rejectedUrls = r.rejected;
            crawlNotes = r.crawlNotes;
            if (!heroIsManual && !heroSource && approved.length > 0) heroSource = 'website';
          }
        } catch {
          // continue to step 4
        }
      }

      // ---- STEP 4: Street view fallback ----
      const streetViewUrl = task.street_view_url as string | null;
      const finalHero: string | null = heroIsManual
        ? (task.current_hero as string)
        : (approved[0] ?? (streetViewUrl ?? null));

      const finalHeroSource: string | null = heroIsManual
        ? heroSource
        : (approved.length > 0 ? heroSource : (streetViewUrl ? 'street_view' : null));

      // ---- STEP 5: Save — hero = approved[0], gallery = approved[1..4] ----
      const galleryPhotos = approved.slice(heroIsManual ? 0 : 1, MAX_PHOTOS);

      // ---- LOGO: always use google_logo_url, rehost to storage ----
      let logoPhoto: string | null = null;
      const logoUrl = task.google_logo_url as string | null;
      if (logoUrl && !(task.current_logo as string | null)) {
        const rehosted = await rehostToStorage(supabase, logoUrl, task.listing_id as string, 'logo');
        logoPhoto = rehosted ?? logoUrl;
      }

      // Build final blocked list (original blocked + all rejected this run)
      const newBlocked = [...new Set(rejectedUrls)];

      const update: Record<string, unknown> = {
        last_crawled_at: new Date().toISOString(),
        crawl_notes: crawlNotes || null,
        blocked_photos: newBlocked,
      };

      if (!heroIsManual && finalHero) {
        update.hero_image = finalHero;
        update.hero_image_source = finalHeroSource;
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
        hero_image_found: !!finalHero,
        hero_source: finalHeroSource,
        gallery_count: galleryPhotos.length,
        logo_found: !!logoPhoto,
        finished_at: new Date().toISOString(),
      }).eq('id', task.id);

      await supabase.from('photo_enrich_jobs').update({
        processed: (job.processed ?? 0) + 1,
        succeeded: (job.succeeded ?? 0) + (finalHero ? 1 : 0),
      }).eq('id', jobId);

      // Chain next task
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
        hero_found: !!finalHero,
        hero_source: finalHeroSource,
        approved_count: approved.length,
        gallery_count: galleryPhotos.length,
        rejected_count: rejectedUrls.length,
      }, { headers: corsHeaders });
    }

    // --- JOB STATUS ---
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

    // --- CANCEL ---
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
