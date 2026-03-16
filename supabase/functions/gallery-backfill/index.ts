import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MAX_GALLERY_PHOTOS = 5;
const MIN_GALLERY_TARGET = 3;
const STUCK_TASK_TIMEOUT_MS = 90_000;

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
): Promise<{ verdict: 'GOOD_EQUIPMENT' | 'GOOD' | 'BAD_CONTACT' | 'BAD_OTHER'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image' };

  const refImages = (await Promise.all(
    approvedUrls.slice(0, 3).map(u => fetchImageAsBase64(u))
  )).filter((x): x is { base64: string; mediaType: string } => x !== null);

  const dedupClause = refImages.length > 0
    ? '\nAlso reject this photo (as BAD_OTHER) if it shows essentially the same view as any of the already-approved photos shown above — we want visual variety, not multiple shots of the same angle.'
    : '';

  const prompt = `You are selecting photos for a TOUCHLESS car wash directory listing. Be GENEROUS — having some photos is much better than having none.

GOOD_EQUIPMENT — Use this verdict (highest priority!) if you can see touchless car wash equipment:
- Overhead wash gantries, arches, or spray arms (PDQ LaserWash, WashWorld Razor, Belanger, Ryko, etc.)
- Visible manufacturer branding/logos on equipment (NOT the business sign)
- A car inside a touchless wash bay with nozzles/spray arches visible
- Close-up of touchless wash equipment showing identifiable features
This is the MOST VALUABLE type of photo for our directory.

GOOD — Accept if ANY of these are true:
- A car wash building, bay, tunnel, canopy, or sign is visible anywhere in the photo (it does NOT need to be the main subject)
- The photo is taken from a road or parking lot but you can see a car wash business in the scene
- A car is entering, inside, or exiting a wash bay
- A car wash sign, menu board, or price sign is shown
- The photo shows the exterior of a business that is clearly a car wash
When in doubt, lean toward GOOD. A mediocre photo of the right place is better than no photo.

BAD_CONTACT — Reject ONLY if you can clearly see brushes, cloth strips, foam rollers, or spinning mops physically making contact with a car's surface.

BAD_OTHER — Reject ONLY if:
- The photo has absolutely nothing to do with a car wash (food, random products, landscapes with no business)
- It is a close-up of a car body (hood, bumper, wheel) with NO car wash facility visible at all
- Interior of a car (dashboard, seats) with no wash visible
- A selfie or group photo with no car wash visible
- A logo, graphic, clip art, or promotional flyer (not a real photograph)
- So blurry or dark that you cannot tell what is in the photo at all${dedupClause}

Reply with ONLY: VERDICT: one-sentence reason`;

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
      throw new Error(`Claude vision overloaded after ${maxAttempts} attempts`);
    }

    if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    const text = (data.content?.[0]?.text ?? '').trim();
    const clean = text.replace(/^VERDICT:\s*/i, '').trim();

    if (clean.startsWith('GOOD_EQUIPMENT')) return { verdict: 'GOOD_EQUIPMENT', reason: clean.replace(/^GOOD_EQUIPMENT[:\s-]*/i, '').trim() };
    if (clean.startsWith('GOOD')) return { verdict: 'GOOD', reason: clean.replace(/^GOOD[:\s-]*/i, '').trim() };
    if (clean.startsWith('BAD_CONTACT')) return { verdict: 'BAD_CONTACT', reason: clean.replace(/^BAD_CONTACT[:\s-]*/i, '').trim() };
    return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
  }

  throw new Error('Claude vision max retries exceeded');
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

async function fetchGooglePlacePhotoUrls(
  placeId: string,
  googleApiKey: string,
  existingPhotos: string[],
  maxFetch: number,
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
    if (urls.length >= maxFetch) break;
    const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=1600&maxWidthPx=1600&key=${googleApiKey}`;
    const mediaRes = await fetch(mediaUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!mediaRes.ok) continue;
    const finalUrl = mediaRes.url;
    if (!finalUrl) continue;
    if (existingPhotos.includes(finalUrl)) continue;
    urls.push(finalUrl);
  }

  return urls;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ---- STATUS ----
    if (action === 'status') {
      const { count: totalWithPlaceId } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('google_place_id', 'is', null);

      const { data: stats } = await supabase.rpc('gallery_photo_stats');

      const { data: recentJob } = await supabase
        .from('gallery_backfill_jobs')
        .select('id, status, total, processed, succeeded, started_at, finished_at')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        total_with_place_id: totalWithPlaceId ?? 0,
        gallery_stats: stats ?? null,
        recent_job: recentJob ?? null,
      }, { headers: corsHeaders });
    }

    // ---- START ----
    if (action === 'start') {
      if (!anthropicKey || !googleApiKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY or GOOGLE_PLACES_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const since: string | null = body.since ?? null;

      let listQuery = supabase
        .from('listings')
        .select('id, name, google_place_id, photos, hero_image')
        .eq('is_touchless', true)
        .not('google_place_id', 'is', null)
        .order('id');

      if (since) {
        listQuery = listQuery.gte('photo_enrichment_attempted_at', since);
      }

      const { data: allListings, error: listErr } = await listQuery;

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!allListings || allListings.length === 0) {
        return Response.json({ error: 'No touchless listings with a place_id found' }, { status: 404, headers: corsHeaders });
      }

      const eligible = (allListings as Array<{
        id: string;
        name: string;
        google_place_id: string;
        photos: string[] | null;
        hero_image: string | null;
      }>).filter(l => {
        const count = Array.isArray(l.photos) ? l.photos.length : 0;
        const needsGallery = count < MIN_GALLERY_TARGET;
        const needsHero = !l.hero_image
          || l.hero_image.includes('streetviewpixels')
          || l.hero_image.includes('street_view');
        return needsGallery || needsHero;
      });

      if (eligible.length === 0) {
        return Response.json({ error: 'No listings need gallery photos or hero image fixes' }, { status: 404, headers: corsHeaders });
      }

      const toProcess = limit > 0 ? eligible.slice(0, limit) : eligible;

      const { data: job, error: jobErr } = await supabase
        .from('gallery_backfill_jobs')
        .insert({
          total: toProcess.length,
          processed: 0,
          succeeded: 0,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      const tasks = toProcess.map(l => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        google_place_id: l.google_place_id,
        photos_before: Array.isArray(l.photos) ? l.photos.length : 0,
        task_status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('gallery_backfill_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const kickUrl = `${supabaseUrl}/functions/v1/gallery-backfill`;
      EdgeRuntime.waitUntil(
        fetch(kickUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: toProcess.length }, { headers: corsHeaders });
    }

    // ---- PROCESS_BATCH ----
    if (action === 'process_batch') {
      if (!anthropicKey || !googleApiKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('gallery_backfill_jobs')
        .select('id, status, total, processed, succeeded')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const stuckCutoff = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS).toISOString();
      await supabase
        .from('gallery_backfill_tasks')
        .update({ task_status: 'pending', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', stuckCutoff);

      const { data: batchTasks } = await supabase
        .from('gallery_backfill_tasks')
        .select('id, listing_id, listing_name, google_place_id, photos_before')
        .eq('job_id', jobId)
        .eq('task_status', 'pending')
        .order('id')
        .limit(2);

      if (!batchTasks || batchTasks.length === 0) {
        await supabase.from('gallery_backfill_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      const taskIds = batchTasks.map((t: { id: number }) => t.id);
      await supabase.from('gallery_backfill_tasks')
        .update({ task_status: 'in_progress', updated_at: new Date().toISOString() })
        .in('id', taskIds);

      async function processOneTask(task: typeof batchTasks[0]) {
        let placePhotosFetched = 0;
        let placePhotosScreened = 0;
        let placePhotosApproved = 0;
        let equipmentPhotosFound = 0;
        let fallbackReason: string | null = null;
        let photosAfter = task.photos_before as number;

        try {
          const { data: listingData } = await supabase
            .from('listings')
            .select('photos, hero_image, blocked_photos')
            .eq('id', task.listing_id)
            .maybeSingle();

          const currentPhotos: string[] = (listingData?.photos as string[]) ?? [];
          const heroImage: string | null = (listingData?.hero_image as string | null) ?? null;
          const blockedPhotos: string[] = (listingData?.blocked_photos as string[]) ?? [];

          const heroNeedsUpgrade = !heroImage
            || heroImage.includes('streetviewpixels')
            || heroImage.includes('street_view');

          const existingUrls = [...currentPhotos, ...(heroImage ? [heroImage] : []), ...blockedPhotos];

          const needed = MAX_GALLERY_PHOTOS - currentPhotos.length;
          if (needed <= 0 && !heroNeedsUpgrade) {
            fallbackReason = 'Already has enough gallery photos and a good hero';
          } else {
            const fetchCount = Math.min(15, needed + 2);
            const placePhotoUrls = await fetchGooglePlacePhotoUrls(
              task.google_place_id as string,
              googleApiKey,
              existingUrls,
              fetchCount,
            );
            placePhotosFetched = placePhotoUrls.length;

            if (placePhotoUrls.length === 0) {
              fallbackReason = 'Google Places API returned no photos';
            } else {
              const newApprovedEquipment: string[] = [];
              const newApprovedOther: string[] = [];
              for (const url of placePhotoUrls) {
                if (currentPhotos.length + newApprovedEquipment.length + newApprovedOther.length >= MAX_GALLERY_PHOTOS) break;
                placePhotosScreened++;
                try {
                  const result = await classifyPhotoWithClaude(url, anthropicKey, [...currentPhotos, ...newApprovedEquipment, ...newApprovedOther]);
                  if (result.verdict === 'GOOD_EQUIPMENT' || result.verdict === 'GOOD') {
                    const slot = `gallery_bp_${currentPhotos.length + newApprovedEquipment.length + newApprovedOther.length}_${Date.now()}`;
                    const rehosted = await rehostToStorage(supabase, url, task.listing_id as string, slot);
                    const finalUrl = rehosted ?? url;
                    if (result.verdict === 'GOOD_EQUIPMENT') {
                      newApprovedEquipment.push(finalUrl);
                      equipmentPhotosFound++;
                    } else {
                      newApprovedOther.push(finalUrl);
                    }
                    placePhotosApproved++;
                  }
                } catch {
                  // skip on error
                }
              }

              // Equipment photos go first so they're prioritized as hero candidates
              const newApproved = [...newApprovedEquipment, ...newApprovedOther];

              if (newApproved.length > 0) {
                // Put equipment photos at the front of the gallery
                const updatedPhotos = [...newApprovedEquipment, ...currentPhotos, ...newApprovedOther];
                const updatePayload: Record<string, unknown> = { photos: updatedPhotos };

                // Prefer equipment photo as hero, otherwise use first new photo
                if (heroNeedsUpgrade) {
                  updatePayload.hero_image = newApprovedEquipment.length > 0 ? newApprovedEquipment[0] : newApproved[0];
                }

                await supabase.from('listings').update(updatePayload).eq('id', task.listing_id);
                photosAfter = updatedPhotos.length;
              } else if (heroNeedsUpgrade && currentPhotos.length > 0) {
                // No new photos found, but listing has existing gallery photos — promote first one to hero
                await supabase.from('listings').update({
                  hero_image: currentPhotos[0],
                }).eq('id', task.listing_id);
                fallbackReason = `${placePhotosScreened} photos screened — none new, but promoted existing gallery photo to hero`;
              } else {
                fallbackReason = `${placePhotosScreened} photos screened by Claude — none passed GOOD verdict`;
              }
            }
          }
        } catch (e) {
          fallbackReason = `Error: ${(e as Error).message}`;
        }

        await supabase.from('gallery_backfill_tasks').update({
          task_status: 'done',
          place_photos_fetched: placePhotosFetched,
          place_photos_screened: placePhotosScreened,
          place_photos_approved: placePhotosApproved,
          photos_after: photosAfter,
          fallback_reason: fallbackReason,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', task.id);

        return { succeeded: placePhotosApproved > 0, equipmentPhotos: equipmentPhotosFound };
      }

      const results = await Promise.all(batchTasks.map(processOneTask));
      const processedCount = results.length;
      const succeededCount = results.filter(r => r.succeeded).length;

      await supabase.from('gallery_backfill_jobs').update({
        processed: (job.processed ?? 0) + processedCount,
        succeeded: (job.succeeded ?? 0) + succeededCount,
      }).eq('id', jobId);

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/gallery-backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({ processed: processedCount, succeeded: succeededCount }, { headers: corsHeaders });
    }

    // ---- JOB_STATUS ----
    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('gallery_backfill_jobs')
        .select('id, status, total, processed, succeeded, started_at, finished_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      return Response.json(job, { headers: corsHeaders });
    }

    // ---- TASK_TRACES ----
    if (action === 'task_traces') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: tasks } = await supabase
        .from('gallery_backfill_tasks')
        .select('id, listing_id, listing_name, google_place_id, photos_before, task_status, place_photos_fetched, place_photos_screened, place_photos_approved, photos_after, fallback_reason, finished_at')
        .eq('job_id', jobId)
        .order('id');

      return Response.json({ tasks: tasks ?? [] }, { headers: corsHeaders });
    }

    // ---- CANCEL ----
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('gallery_backfill_jobs').update({ status: 'cancelled' }).eq('id', jobId);
      await supabase.from('gallery_backfill_tasks')
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
