import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';

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

function filterWebsiteImages(images: string[]): string[] {
  return images.filter(url => {
    const lower = url.toLowerCase();
    if (lower.includes('favicon')) return false;
    if (lower.includes('logo')) return false;
    if (lower.includes('icon')) return false;
    if (lower.includes('facebook.com') || lower.includes('twitter.com') || lower.includes('instagram.com')) return false;
    if (lower.includes('google-analytics') || lower.includes('pixel') || lower.includes('tracking')) return false;
    if (lower.includes('1x1') || lower.includes('spacer') || lower.includes('blank')) return false;
    if (lower.includes('badge') || lower.includes('banner') || lower.includes('button')) return false;
    if (lower.includes('simoniz') || lower.includes('armorall') || lower.includes('turtlewax') || lower.includes('rainx')) return false;
    return /\.(jpg|jpeg|png|webp)/i.test(lower);
  }).slice(0, 10);
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

      // Fetch touchless listings
      let query = supabase
        .from('listings')
        .select('id, name, website, google_photo_url, google_logo_url, street_view_url, hero_image, logo_photo, crawl_notes')
        .eq('is_touchless', true)
        .order('id');

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ error: 'No touchless listings found' }, { status: 404, headers: corsHeaders });
      }

      // Create a job record
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

      // Insert all listing tasks
      const tasks = listings.map(l => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        website: l.website,
        google_photo_url: l.google_photo_url,
        google_logo_url: l.google_logo_url,
        street_view_url: l.street_view_url,
        current_hero: l.hero_image,
        current_logo: l.logo_photo,
        current_crawl_notes: l.crawl_notes,
        task_status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('photo_enrich_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      // Kick off processing in background
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

      // Check job exists and is running
      const { data: job } = await supabase
        .from('photo_enrich_jobs')
        .select('id, status, total, processed, succeeded')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      // Grab next pending task
      const { data: tasks } = await supabase
        .from('photo_enrich_tasks')
        .select('id, listing_id, listing_name, website, google_photo_url, google_logo_url, street_view_url, current_hero, current_logo, current_crawl_notes')
        .eq('job_id', jobId)
        .eq('task_status', 'pending')
        .order('id')
        .limit(1);

      const task = tasks?.[0];
      if (!task) {
        // All tasks processed — mark job done
        await supabase.from('photo_enrich_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      // Mark task in_progress
      await supabase.from('photo_enrich_tasks').update({ task_status: 'in_progress' }).eq('id', task.id);

      let heroImage: string | null = null;
      let heroSource: string | null = null;
      let galleryPhotos: string[] = [];
      let logoPhoto: string | null = null;
      let crawlNotes = task.current_crawl_notes ?? '';

      // --- STEP 1: Evaluate google_photo_url ---
      if (task.google_photo_url) {
        try {
          const result = await classifyPhotoWithClaude(task.google_photo_url, anthropicKey);
          if (result.verdict === 'GOOD') {
            heroImage = task.google_photo_url;
            heroSource = 'google';
          } else {
            const note = `[Google photo rejected: ${result.verdict} — ${result.reason}]`;
            crawlNotes = crawlNotes ? `${crawlNotes} ${note}` : note;
          }
        } catch {
          // continue to step 2
        }
      }

      // --- STEP 2: Firecrawl website scraping ---
      if (!heroImage && task.website && !SKIP_DOMAINS.some(d => (task.website ?? '').includes(d))) {
        try {
          const fcRes = await fetch(`${FIRECRAWL_API}/scrape`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: task.website,
              formats: ['markdown'],
              onlyMainContent: false,
              includeTags: ['img'],
              timeout: 20000,
            }),
          });

          if (fcRes.ok) {
            const fcData = await fcRes.json() as { success: boolean; data?: { images?: string[] } };
            const rawImages = fcData.data?.images ?? [];
            const candidates = filterWebsiteImages(rawImages);

            for (const imgUrl of candidates) {
              try {
                const result = await classifyPhotoWithClaude(imgUrl, anthropicKey);
                if (result.verdict === 'GOOD') {
                  if (!heroImage) {
                    heroImage = imgUrl;
                    heroSource = 'website';
                  } else if (galleryPhotos.length < 3) {
                    galleryPhotos.push(imgUrl);
                  }
                  if (heroImage && galleryPhotos.length >= 3) break;
                }
              } catch {
                // skip this image
              }
            }
          }
        } catch {
          // continue to step 3
        }
      }

      // --- STEP 3: Street view fallback ---
      if (!heroImage && task.street_view_url) {
        heroImage = task.street_view_url;
        heroSource = 'street_view';
      }

      // --- LOGO: always use google_logo_url, rehost to storage ---
      if (task.google_logo_url && !task.current_logo) {
        const rehosted = await rehostToStorage(supabase, task.google_logo_url, task.listing_id, 'logo');
        logoPhoto = rehosted ?? task.google_logo_url;
      }

      // --- Save to listings ---
      const update: Record<string, unknown> = {
        last_crawled_at: new Date().toISOString(),
        crawl_notes: crawlNotes || null,
      };

      if (heroImage) {
        update.hero_image = heroImage;
        update.hero_image_source = heroSource;
      }
      if (galleryPhotos.length > 0) {
        update.photos = galleryPhotos;
      }
      if (logoPhoto) {
        update.logo_photo = logoPhoto;
      }

      await supabase.from('listings').update(update).eq('id', task.listing_id);

      // Mark task done
      await supabase.from('photo_enrich_tasks').update({
        task_status: 'done',
        hero_image_found: !!heroImage,
        hero_source: heroSource,
        gallery_count: galleryPhotos.length,
        logo_found: !!logoPhoto,
        finished_at: new Date().toISOString(),
      }).eq('id', task.id);

      // Update job counters
      await supabase.from('photo_enrich_jobs').update({
        processed: (job.processed ?? 0) + 1,
        succeeded: (job.succeeded ?? 0) + (heroImage ? 1 : 0),
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
        hero_found: !!heroImage,
        hero_source: heroSource,
        gallery_count: galleryPhotos.length,
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
