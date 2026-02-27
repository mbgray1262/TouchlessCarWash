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
  'rocketstores.com',
];

async function extractAmenitiesWithClaude(markdown: string, apiKey: string): Promise<string[]> {
  const truncated = markdown.slice(0, 6000);

  const prompt = `You are analyzing a car wash website to extract amenity and service features.

From the text below, extract a list of specific amenities or services offered. Focus on:
- Wash packages and tiers (Express, Deluxe, Premium, etc.)
- Membership or unlimited wash clubs
- Add-on services (tire shine, underbody wash, rain repellent, etc.)
- Facility features (free vacuums, air fresheners, towel dry, hand dry, mat cleaning, etc.)
- Special capabilities (RV wash, truck wash, fleet services, etc.)
- Payment options only if notable (app payment, license plate recognition, etc.)

Return ONLY a JSON array of short, specific amenity strings. Each should be 1-5 words.
If nothing relevant is found, return an empty array [].

Example output: ["Free Vacuums", "Unlimited Wash Club", "Rain Repellent", "Tire Shine", "RV Wash"]

Website text:
${truncated}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
}

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
      const { count: eligible } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('website', 'is', null)
        .or('amenities.is.null,amenities.eq.{}');

      const { count: withAmenities } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('amenities', 'is', null)
        .neq('amenities', '{}');

      return Response.json({
        eligible: eligible ?? 0,
        already_have_amenities: withAmenities ?? 0,
      }, { headers: corsHeaders });
    }

    // --- START ---
    if (action === 'start') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;

      let query = supabase
        .from('listings')
        .select('id, name, website, amenities')
        .eq('is_touchless', true)
        .not('website', 'is', null)
        .or('amenities.is.null,amenities.eq.{}')
        .order('id');

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No eligible listings found', total: 0 }, { headers: corsHeaders });
      }

      // Filter out skip domains
      const eligible = listings.filter(l =>
        !SKIP_DOMAINS.some(d => (l.website ?? '').includes(d))
      );

      if (eligible.length === 0) {
        return Response.json({ message: 'All eligible listings have skipped domains', total: 0 }, { headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('amenity_backfill_jobs')
        .insert({
          total: eligible.length,
          processed: 0,
          succeeded: 0,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      const tasks = eligible.map(l => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        website: l.website,
        existing_amenities: l.amenities ?? [],
        task_status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('amenity_backfill_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/amenity-backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: eligible.length }, { headers: corsHeaders });
    }

    // --- PROCESS BATCH ---
    if (action === 'process_batch') {
      if (!firecrawlKey || !anthropicKey) {
        return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('amenity_backfill_jobs')
        .select('id, status, total, processed, succeeded')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const { data: tasks } = await supabase
        .from('amenity_backfill_tasks')
        .select('id, listing_id, listing_name, website, existing_amenities')
        .eq('job_id', jobId)
        .eq('task_status', 'pending')
        .order('id')
        .limit(1);

      const task = tasks?.[0];
      if (!task) {
        await supabase.from('amenity_backfill_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      await supabase.from('amenity_backfill_tasks').update({ task_status: 'in_progress' }).eq('id', task.id);

      let newAmenities: string[] = [];
      let success = false;

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
            onlyMainContent: true,
            timeout: 20000,
          }),
        });

        if (fcRes.ok) {
          const fcData = await fcRes.json() as { success: boolean; data?: { markdown?: string } };
          const markdown = fcData.data?.markdown ?? '';
          if (markdown.trim().length >= 50) {
            const extracted = await extractAmenitiesWithClaude(markdown, anthropicKey);
            const existing = Array.isArray(task.existing_amenities) ? task.existing_amenities : [];
            newAmenities = extracted.filter(a => !existing.includes(a));

            if (newAmenities.length > 0) {
              const merged = [...existing, ...newAmenities];
              await supabase.from('listings').update({ amenities: merged }).eq('id', task.listing_id);
              success = true;
            }
          }
        }
      } catch {
        // mark failed, continue
      }

      await supabase.from('amenity_backfill_tasks').update({
        task_status: 'done',
        amenities_found: newAmenities.length,
        amenities_added: newAmenities,
        finished_at: new Date().toISOString(),
      }).eq('id', task.id);

      await supabase.from('amenity_backfill_jobs').update({
        processed: (job.processed ?? 0) + 1,
        succeeded: (job.succeeded ?? 0) + (success ? 1 : 0),
      }).eq('id', jobId);

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/amenity-backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({
        processed: task.listing_id,
        amenities_added: newAmenities.length,
      }, { headers: corsHeaders });
    }

    // --- JOB STATUS ---
    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('amenity_backfill_jobs')
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

      await supabase.from('amenity_backfill_jobs').update({ status: 'cancelled' }).eq('id', jobId);
      await supabase.from('amenity_backfill_tasks')
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
