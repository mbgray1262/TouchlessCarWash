import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PARALLEL_BATCH_SIZE = 5;
const NUM_PARALLEL_WORKERS = 3;
const STUCK_TASK_TIMEOUT_MS = 120_000;

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
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
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

async function classifyHeroImage(
  imageUrl: string,
  apiKey: string,
): Promise<{ verdict: 'GOOD' | 'BAD_CONTACT' | 'BAD_OTHER' | 'fetch_failed'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'fetch_failed', reason: 'Could not fetch image (timeout or invalid format)' };

  const prompt = `You are quality-checking a hero image for a touchless car wash directory listing. This is the primary image users see when browsing the directory, so it must clearly represent an AUTOMATED touchless car wash business.

Classify this image as one of:

GOOD — the image is a real photograph that clearly represents an automated car wash:
  - Exterior of a car wash building, facility entrance, or facade
  - Interior of an automated wash tunnel showing arches, nozzles, blowers, or a car moving through
  - A car being washed by automated touchless equipment (high-pressure water jets, foam applicators, air dryers)
  - Drive-through tunnel view from the driver's perspective entering or exiting
  - Clear signage or canopy of a car wash facility with the building or wash bays visible

BAD_CONTACT — the image clearly shows physical contact wash equipment that touches the car: spinning brush rollers, cloth strips, mop curtains, or hanging fabric/foam pads making contact with a vehicle. Do NOT use BAD_CONTACT for touchless equipment like water jets, spray arches, or foam nozzles.

BAD_OTHER — reject for ANY of these reasons:
  - NOT A REAL PHOTOGRAPH: Any illustration, logo, mascot, cartoon character, brand graphic, marketing artwork, or digitally created image. This includes stylized characters (astronauts, animals, mascots), colorful brand illustrations, and any image that is clearly not a photograph of a real place. If it looks drawn, rendered, or designed rather than photographed, it is BAD_OTHER.
  - SELF-SERVE WAND BAY: A coin-operated or token-operated self-serve bay where customers wash their own car using a handheld wand, spray gun, or pressure washer hose. These are not automated touchless washes.
  - EQUIPMENT CLOSE-UP: A close-up of a single piece of equipment (soap dispenser, vacuum station, payment kiosk, token machine, vending machine, air compressor) with no broader facility context.
  - WRONG BUSINESS: Gas station forecourt/pumps with no car wash visible, EV charging station, convenience store, restaurant, laundromat, or any non-car-wash business.
  - CAR INTERIOR: Dashboard, steering wheel, or seats photographed from inside a vehicle.
  - PEOPLE ONLY: Photo of people with no car wash facility visible.
  - BROKEN/UNUSABLE: Solid color, blank gradient, placeholder graphic, severely blurry, nearly black, or otherwise unusable image.
  - SIGNAGE ONLY: A photo showing only a sign, menu board, or price list with no car wash facility visible behind it.

IMPORTANT RULES:
- The image MUST be a real photograph. Illustrations and graphics are ALWAYS BAD_OTHER.
- A business may have both self-serve bays and automated touchless bays. If the photo shows the self-serve wand bay side, reject it — we want the automated touchless side.
- When genuinely uncertain between GOOD and BAD_OTHER for a real photograph where some car wash facility is visible, prefer GOOD.
- When genuinely uncertain whether an image is a real photograph or a graphic/illustration, prefer BAD_OTHER.

Reply with only the verdict and a one-sentence reason in this exact format:
VERDICT: reason`;

  const maxAttempts = 5;
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
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: img.base64,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (res.status === 529 || res.status === 503 || res.status === 429) {
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 30000 * attempt));
        continue;
      }
      return { verdict: 'fetch_failed', reason: `Claude overloaded (${res.status}) after ${maxAttempts} retries` };
    }

    if (!res.ok) {
      return { verdict: 'fetch_failed', reason: `Claude API error ${res.status}` };
    }

    const data = await res.json() as { content: Array<{ text: string }> };
    const text = (data.content?.[0]?.text ?? '').trim();
    const clean = text.replace(/^VERDICT:\s*/i, '').trim();

    if (clean.toUpperCase().startsWith('GOOD')) {
      return { verdict: 'GOOD', reason: clean.replace(/^GOOD[:\s-]*/i, '').trim() };
    }
    if (clean.toUpperCase().startsWith('BAD_CONTACT')) {
      return { verdict: 'BAD_CONTACT', reason: clean.replace(/^BAD_CONTACT[:\s-]*/i, '').trim() };
    }
    return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
  }

  return { verdict: 'fetch_failed', reason: 'Max retries exceeded' };
}

async function findReplacementHero(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  anthropicKey: string,
): Promise<{ heroUrl: string; heroSource: string } | null> {
  const { data: listing } = await supabase
    .from('listings')
    .select('photos, street_view_url')
    .eq('id', listingId)
    .maybeSingle();

  if (!listing) return null;

  const galleryPhotos: string[] = (listing.photos as string[]) ?? [];

  for (const photoUrl of galleryPhotos) {
    if (!photoUrl) continue;
    try {
      const { verdict } = await classifyHeroImage(photoUrl, anthropicKey);
      if (verdict === 'GOOD') {
        return { heroUrl: photoUrl, heroSource: 'gallery' };
      }
    } catch {
      continue;
    }
  }

  if (listing.street_view_url) {
    const svUrl = listing.street_view_url as string;
    try {
      const { verdict } = await classifyHeroImage(svUrl, anthropicKey);
      if (verdict === 'GOOD') {
        return { heroUrl: svUrl, heroSource: 'street_view' };
      }
    } catch {
      // fall through to null
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ── STATUS ───────────────────────────────────────────────────────────────
    if (action === 'status') {
      const { count: listingsWithAuditableHero } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('hero_image', 'is', null)
        .or('hero_image_source.eq.google,hero_image_source.is.null');

      const { data: auditedCountRow } = await supabase
        .rpc('count_distinct_audited_hero_listings');

      const auditedCount = auditedCountRow ?? 0;
      const unauditedCount = Math.max(0, (listingsWithAuditableHero ?? 0) - auditedCount);

      const { data: recentJob } = await supabase
        .from('hero_audit_jobs')
        .select('id, status, total, processed, succeeded, cleared, started_at, finished_at')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        listings_with_auditable_hero: listingsWithAuditableHero ?? 0,
        unaudited_count: unauditedCount,
        audited_count: auditedCount,
        recent_job: recentJob ?? null,
      }, { headers: corsHeaders });
    }

    // ── START ─────────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;

      const { data: listings, error: listErr } = await supabase.rpc('get_unaudited_hero_listings', {
        p_limit: limit > 0 ? limit : null,
      });

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });

      if (!listings || listings.length === 0) {
        return Response.json({ error: 'No unaudited listings with hero images found' }, { status: 404, headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('hero_audit_jobs')
        .insert({
          total: listings.length,
          processed: 0,
          succeeded: 0,
          cleared: 0,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobErr || !job) {
        return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });
      }

      const tasks = listings.map((l: Record<string, unknown>) => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        hero_image_url: l.hero_image,
        task_status: 'pending',
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
        const { error: taskErr } = await supabase.from('hero_audit_tasks').insert(tasks.slice(i, i + CHUNK_SIZE));
        if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const workerPromises = Array.from({ length: NUM_PARALLEL_WORKERS }, () =>
        fetch(`${supabaseUrl}/functions/v1/hero-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );
      await Promise.all(workerPromises);

      return Response.json({ job_id: job.id, total: listings.length }, { headers: corsHeaders });
    }

    // ── PROCESS BATCH ─────────────────────────────────────────────────────────
    if (action === 'process_batch') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('hero_audit_jobs')
        .select('id, status')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const stuckCutoff = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS).toISOString();
      await supabase
        .from('hero_audit_tasks')
        .update({ task_status: 'pending' })
        .eq('job_id', jobId)
        .eq('task_status', 'in_progress')
        .lt('updated_at', stuckCutoff);

      const { data: batchTasks, error: claimErr } = await supabase.rpc('claim_hero_audit_tasks', {
        p_job_id: jobId,
        p_batch_size: PARALLEL_BATCH_SIZE,
      });

      if (claimErr) {
        return Response.json({ error: claimErr.message }, { status: 500, headers: corsHeaders });
      }

      if (!batchTasks || batchTasks.length === 0) {
        const { count: pendingCount } = await supabase
          .from('hero_audit_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .in('task_status', ['pending', 'in_progress']);

        if (!pendingCount || pendingCount === 0) {
          await supabase.from('hero_audit_jobs').update({
            status: 'done',
            finished_at: new Date().toISOString(),
          }).eq('id', jobId);
          return Response.json({ done: true }, { headers: corsHeaders });
        }

        return Response.json({ done: false, waiting: true }, { headers: corsHeaders });
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/hero-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      const processOneTask = async (task: { id: number; listing_id: string; listing_name: string; hero_image_url: string }) => {
        const { verdict, reason } = await classifyHeroImage(task.hero_image_url, anthropicKey);

        const isBad = verdict === 'BAD_CONTACT' || verdict === 'BAD_OTHER' || verdict === 'fetch_failed';
        let actionTaken = 'kept';

        if (isBad) {
          const replacement = await findReplacementHero(supabase, task.listing_id, anthropicKey);

          if (replacement) {
            await supabase
              .from('listings')
              .update({
                hero_image: replacement.heroUrl,
                hero_image_source: replacement.heroSource,
              })
              .eq('id', task.listing_id);
            actionTaken = `replaced_with_${replacement.heroSource}`;
          } else {
            await supabase
              .from('listings')
              .update({
                hero_image: null,
                hero_image_source: null,
              })
              .eq('id', task.listing_id);
            actionTaken = 'cleared';
          }
        }

        await supabase.from('hero_audit_tasks').update({
          task_status: 'done',
          verdict,
          reason,
          action_taken: actionTaken,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', task.id);

        return { verdict, actionTaken };
      };

      const { data: jobCheck } = await supabase
        .from('hero_audit_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();

      if (jobCheck?.status === 'cancelled') {
        await supabase.from('hero_audit_tasks')
          .update({ task_status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('job_id', jobId)
          .in('task_status', ['pending', 'in_progress']);
        return Response.json({ done: true, status: 'cancelled' }, { headers: corsHeaders });
      }

      const results = await Promise.allSettled(batchTasks.map((task: { id: number; listing_id: string; listing_name: string; hero_image_url: string }) => processOneTask(task)));

      let batchSucceeded = 0;
      let batchCleared = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.verdict === 'GOOD') batchSucceeded++;
          if (result.value.actionTaken === 'cleared' || result.value.actionTaken.startsWith('replaced_')) batchCleared++;
        } else {
          const failedTask = batchTasks[results.indexOf(result)];
          await supabase.from('hero_audit_tasks').update({
            task_status: 'done',
            verdict: 'fetch_failed',
            reason: `Unhandled error: ${(result.reason as Error)?.message ?? 'unknown'}`,
            action_taken: 'kept',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', failedTask.id);
        }
      }

      await supabase.rpc('increment_hero_audit_job_counts', {
        p_job_id: jobId,
        p_processed: batchTasks.length,
        p_succeeded: batchSucceeded,
        p_cleared: batchCleared,
      });

      return Response.json({
        processed: batchTasks.length,
        succeeded: batchSucceeded,
        cleared: batchCleared,
      }, { headers: corsHeaders });
    }

    // ── JOB STATUS ────────────────────────────────────────────────────────────
    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('hero_audit_jobs')
        .select('id, status, total, processed, succeeded, cleared, started_at, finished_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      return Response.json(job, { headers: corsHeaders });
    }

    // ── TASK TRACES ───────────────────────────────────────────────────────────
    if (action === 'task_traces') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: tasks } = await supabase
        .from('hero_audit_tasks')
        .select('id, listing_id, listing_name, hero_image_url, task_status, verdict, reason, action_taken, finished_at')
        .eq('job_id', jobId)
        .order('id');

      return Response.json({ tasks: tasks ?? [] }, { headers: corsHeaders });
    }

    // ── FORCE REAUDIT ─────────────────────────────────────────────────────────
    // Deletes audit tasks for listings whose current hero came from a replacement
    // (replaced_with_street_view, replaced_with_gallery) so the audit re-checks them.
    // Also re-audits listings where street_view images were kept (fetch_failed on trusted source).
    if (action === 'force_reaudit') {
      // 1. Listings where the replacement was accepted without being classified
      const { data: replacedTasks } = await supabase
        .from('hero_audit_tasks')
        .select('listing_id')
        .like('action_taken', 'replaced_with_%');

      const replacedIds = (replacedTasks ?? []).map((t: { listing_id: string }) => t.listing_id);

      // 2. Listings where audit was fetch_failed but image is still set (trusted source kept)
      const { data: fetchFailedTasks } = await supabase
        .from('hero_audit_tasks')
        .select('listing_id')
        .eq('verdict', 'fetch_failed')
        .eq('action_taken', 'kept');

      const fetchFailedIds = (fetchFailedTasks ?? []).map((t: { listing_id: string }) => t.listing_id);

      const allIds = [...new Set([...replacedIds, ...fetchFailedIds])];

      if (allIds.length === 0) {
        return Response.json({ deleted: 0, message: 'No listings to reaudit' }, { headers: corsHeaders });
      }

      // Delete in chunks to avoid query size limits
      const CHUNK = 200;
      let deleted = 0;
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK);
        const { count } = await supabase
          .from('hero_audit_tasks')
          .delete({ count: 'exact' })
          .in('listing_id', chunk);
        deleted += count ?? 0;
      }

      return Response.json({ deleted, reaudit_listing_count: allIds.length }, { headers: corsHeaders });
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('hero_audit_jobs').update({ status: 'cancelled' }).eq('id', jobId);
      await supabase.from('hero_audit_tasks')
        .update({ task_status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .in('task_status', ['pending', 'in_progress']);

      return Response.json({ cancelled: true }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
