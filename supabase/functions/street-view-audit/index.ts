import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PARALLEL_BATCH_SIZE = 10;
const NUM_PARALLEL_WORKERS = 5;
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

async function classifyStreetViewImage(
  imageUrl: string,
  apiKey: string,
): Promise<{ verdict: 'GOOD' | 'BAD_OTHER' | 'fetch_failed'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'fetch_failed', reason: 'Could not fetch image (timeout or invalid format)' };

  const prompt = `You are quality-checking a street view / exterior photo used as the hero image for a touchless car wash directory listing. This image was automatically assigned as a fallback — it may or may not actually show a usable car wash exterior.

Classify this image as one of:

GOOD — the image clearly represents a car wash facility in a way that is useful for a directory listing:
  - Exterior of a car wash building, facility entrance, canopy, or facade — even if taken from across the street
  - Drive-through tunnel entrance or exit
  - Car wash signage clearly visible with building or wash bays in frame
  - Interior of an automated wash tunnel (nozzles, arches, a car moving through)
  - A car being washed by automated equipment

BAD_OTHER — reject for ANY of these reasons:
  - GENERIC STREET SCENE: A road, intersection, parking lot, or street with no car wash clearly identifiable. Even if taken at the correct address, if the car wash isn't clearly visible, it's BAD_OTHER.
  - WRONG BUSINESS: Gas station pumps with no wash, convenience store, restaurant, laundromat, or any non-car-wash subject is the primary focus.
  - TOO FAR / UNRECOGNIZABLE: The image is so far away or blurry that you cannot tell a car wash is present.
  - BLANK / BROKEN: Solid color, near-black, placeholder image, or image failed to load properly.
  - CAR INTERIOR: Dashboard, steering wheel, or seats photographed from inside a vehicle with no facility visible.
  - PEOPLE ONLY: Photo of people with no car wash facility visible.

IMPORTANT RULES:
- The bar for GOOD is that a reasonable user would understand from this photo that it depicts a car wash location.
- If a car wash building or tunnel entrance is clearly visible — even partially — prefer GOOD.
- If it's just a street scene or parking lot with no identifiable car wash, it is BAD_OTHER.

Reply with only the verdict and a one-sentence reason in this exact format:
VERDICT: reason`;

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
        await new Promise(r => setTimeout(r, 2000 * attempt));
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
    return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
  }

  return { verdict: 'fetch_failed', reason: 'Max retries exceeded' };
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
      const { count: totalStreetView } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .eq('hero_image_source', 'street_view')
        .not('hero_image', 'is', null);

      const { count: alreadyAudited } = await supabase
        .from('street_view_audit_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('task_status', 'done');

      const { data: recentJob } = await supabase
        .from('street_view_audit_jobs')
        .select('id, status, total, processed, succeeded, cleared, started_at, finished_at')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        total_street_view: totalStreetView ?? 0,
        already_audited: alreadyAudited ?? 0,
        recent_job: recentJob ?? null,
      }, { headers: corsHeaders });
    }

    // ── START ─────────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;

      let query = supabase
        .from('listings')
        .select('id, name, hero_image')
        .eq('is_touchless', true)
        .eq('hero_image_source', 'street_view')
        .not('hero_image', 'is', null)
        .order('id');

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ error: 'No street view hero listings found' }, { status: 404, headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('street_view_audit_jobs')
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
        const { error: taskErr } = await supabase.from('street_view_audit_tasks').insert(tasks.slice(i, i + CHUNK_SIZE));
        if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const workerPromises = Array.from({ length: NUM_PARALLEL_WORKERS }, () =>
        fetch(`${supabaseUrl}/functions/v1/street-view-audit`, {
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
        .from('street_view_audit_jobs')
        .select('id, status')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const stuckCutoff = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS).toISOString();
      await supabase
        .from('street_view_audit_tasks')
        .update({ task_status: 'pending' })
        .eq('job_id', jobId)
        .eq('task_status', 'in_progress')
        .lt('updated_at', stuckCutoff);

      const { data: batchTasks, error: claimErr } = await supabase.rpc('claim_street_view_audit_tasks', {
        p_job_id: jobId,
        p_batch_size: PARALLEL_BATCH_SIZE,
      });

      if (claimErr) {
        return Response.json({ error: claimErr.message }, { status: 500, headers: corsHeaders });
      }

      if (!batchTasks || batchTasks.length === 0) {
        const { count: pendingCount } = await supabase
          .from('street_view_audit_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .in('task_status', ['pending', 'in_progress']);

        if (!pendingCount || pendingCount === 0) {
          await supabase.from('street_view_audit_jobs').update({
            status: 'done',
            finished_at: new Date().toISOString(),
          }).eq('id', jobId);
          return Response.json({ done: true }, { headers: corsHeaders });
        }

        return Response.json({ done: false, waiting: true }, { headers: corsHeaders });
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/street-view-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      const { data: jobCheck } = await supabase
        .from('street_view_audit_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();

      if (jobCheck?.status === 'cancelled') {
        await supabase.from('street_view_audit_tasks')
          .update({ task_status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('job_id', jobId)
          .in('task_status', ['pending', 'in_progress']);
        return Response.json({ done: true, status: 'cancelled' }, { headers: corsHeaders });
      }

      const processOneTask = async (task: { id: number; listing_id: string; listing_name: string; hero_image_url: string }) => {
        const { verdict, reason } = await classifyStreetViewImage(task.hero_image_url, anthropicKey);

        let actionTaken = 'kept';

        if (verdict === 'BAD_OTHER') {
          await supabase
            .from('listings')
            .update({ hero_image: null, hero_image_source: null })
            .eq('id', task.listing_id);
          actionTaken = 'cleared';
        }

        await supabase.from('street_view_audit_tasks').update({
          task_status: 'done',
          verdict,
          reason,
          action_taken: actionTaken,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', task.id);

        return { verdict, actionTaken };
      };

      const results = await Promise.allSettled(
        batchTasks.map((task: { id: number; listing_id: string; listing_name: string; hero_image_url: string }) => processOneTask(task))
      );

      let batchSucceeded = 0;
      let batchCleared = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.verdict === 'GOOD') batchSucceeded++;
          if (result.value.actionTaken === 'cleared') batchCleared++;
        } else {
          const failedTask = batchTasks[results.indexOf(result)];
          await supabase.from('street_view_audit_tasks').update({
            task_status: 'done',
            verdict: 'fetch_failed',
            reason: `Unhandled error: ${(result.reason as Error)?.message ?? 'unknown'}`,
            action_taken: 'kept',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', failedTask.id);
        }
      }

      await supabase.rpc('increment_street_view_audit_job_counts', {
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
        .from('street_view_audit_jobs')
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
        .from('street_view_audit_tasks')
        .select('id, listing_id, listing_name, hero_image_url, task_status, verdict, reason, action_taken, finished_at')
        .eq('job_id', jobId)
        .order('id');

      return Response.json({ tasks: tasks ?? [] }, { headers: corsHeaders });
    }

    // ── CANCEL ────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('street_view_audit_jobs').update({ status: 'cancelled' }).eq('id', jobId);
      await supabase.from('street_view_audit_tasks')
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
