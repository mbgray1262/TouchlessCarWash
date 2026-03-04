import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const CRAWL4AI_API = 'https://www.crawl4ai-cloud.com/query';
const BATCH_SIZE = 5;
const DELAY_BETWEEN_MS = 500;

const SKIP_DOMAINS = [
  'facebook.com', 'yelp.com', 'google.com', 'yellowpages.com',
  'bbb.org', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'maps.apple.com', 'mapquest.com', 'maps.google.com',
  'linkedin.com', 'pinterest.com', 'nextdoor.com', 'foursquare.com',
  'tripadvisor.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com',
  'waze.com', 'rocketstores.com', 'superpages.com', 'whitepages.com',
];

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SKIP_DOMAINS.some(d => lower.includes(d));
}

async function crawlWithCrawl4AI(
  url: string,
  apiKey: string,
): Promise<{ success: boolean; markdown?: string; images?: string[]; metadata?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(CRAWL4AI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        apikey: apiKey,
        output_format: 'markdown',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      return { success: false, error: `Crawl4AI ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();

    // Handle various response formats
    if (data.error) {
      return { success: false, error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error) };
    }

    // Cloud API returns: content, links, images, metadata, etc.
    const markdown = data.content ?? data.markdown ?? data.result?.markdown ?? '';
    const images = data.images ?? data.result?.images ?? [];
    const metadata = data.metadata ?? data.result?.metadata ?? {};

    if (!markdown || markdown.length < 50) {
      return { success: false, error: 'No meaningful content returned' };
    }

    return { success: true, markdown, images, metadata };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('AbortError') || msg.includes('timeout')) {
      return { success: false, error: 'Timeout after 30s' };
    }
    return { success: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const crawl4aiKey = Deno.env.get('CRAWL4AI_API_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ---- STATUS ----
    if (action === 'status') {
      const [totalTouchless, withUrl, withSnapshot, noSnapshot] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true)
          .not('website', 'is', null).neq('website', ''),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true)
          .not('crawl_snapshot', 'is', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true)
          .not('website', 'is', null).neq('website', '')
          .is('crawl_snapshot', null),
      ]);

      const { data: recentJob } = await supabase
        .from('crawl4ai_jobs')
        .select('*')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        total_touchless: totalTouchless.count ?? 0,
        with_url: withUrl.count ?? 0,
        with_snapshot: withSnapshot.count ?? 0,
        needs_scraping: noSnapshot.count ?? 0,
        recent_job: recentJob ?? null,
      }, { headers: corsHeaders });
    }

    // ---- START ----
    if (action === 'start') {
      if (!crawl4aiKey) {
        return Response.json({ error: 'CRAWL4AI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const rescrape: boolean = body.rescrape === true;

      let query = supabase
        .from('listings')
        .select('id, name, website')
        .eq('is_touchless', true)
        .not('website', 'is', null)
        .neq('website', '')
        .order('id');

      if (!rescrape) {
        query = query.is('crawl_snapshot', null);
      }

      // Paginate to get ALL results (Supabase default limit is 1000)
      const allListings: Array<{ id: string; name: string; website: string }> = [];
      const PAGE_SIZE = 1000;
      let page = 0;
      while (true) {
        const { data: batch, error: batchErr } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (batchErr) return Response.json({ error: batchErr.message }, { status: 500, headers: corsHeaders });
        if (!batch || batch.length === 0) break;
        allListings.push(...(batch as Array<{ id: string; name: string; website: string }>));
        if (batch.length < PAGE_SIZE) break;
        page++;
      }

      if (allListings.length === 0) {
        return Response.json({ error: 'No listings need scraping' }, { status: 404, headers: corsHeaders });
      }

      const listings = allListings;

      // Filter out social/directory URLs
      const eligible = (listings as Array<{ id: string; name: string; website: string }>)
        .filter(l => !shouldSkipUrl(l.website));

      if (eligible.length === 0) {
        return Response.json({ error: 'All listings have social/directory URLs — nothing to scrape' }, { status: 404, headers: corsHeaders });
      }

      const toProcess = limit > 0 ? eligible.slice(0, limit) : eligible;

      const { data: job, error: jobErr } = await supabase
        .from('crawl4ai_jobs')
        .insert({
          total: toProcess.length,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: listings.length - eligible.length,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      // Insert tasks
      const tasks = toProcess.map(l => ({
        job_id: job.id,
        listing_id: l.id,
        listing_name: l.name,
        website: l.website,
        task_status: 'pending',
      }));

      // Insert in chunks of 500 to avoid payload limits
      for (let i = 0; i < tasks.length; i += 500) {
        const chunk = tasks.slice(i, i + 500);
        const { error: taskErr } = await supabase.from('crawl4ai_tasks').insert(chunk);
        if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });
      }

      // Kick off processing
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/crawl4ai-scraper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: toProcess.length, skipped: listings.length - eligible.length }, { headers: corsHeaders });
    }

    // ---- CANCEL ----
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('crawl4ai_jobs').update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
      }).eq('id', jobId);

      return Response.json({ cancelled: true }, { headers: corsHeaders });
    }

    // ---- PROCESS_BATCH ----
    if (action === 'process_batch') {
      if (!crawl4aiKey) {
        return Response.json({ error: 'CRAWL4AI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      // Check job status
      const { data: job } = await supabase
        .from('crawl4ai_jobs')
        .select('id, status, total, processed, succeeded, failed')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'cancelled' || job.status === 'done') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      // Reset stuck tasks
      const stuckCutoff = new Date(Date.now() - 120_000).toISOString();
      await supabase
        .from('crawl4ai_tasks')
        .update({ task_status: 'pending', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', stuckCutoff);

      // Get next batch
      const { data: batchTasks } = await supabase
        .from('crawl4ai_tasks')
        .select('id, listing_id, listing_name, website')
        .eq('job_id', jobId)
        .eq('task_status', 'pending')
        .order('id')
        .limit(BATCH_SIZE);

      if (!batchTasks || batchTasks.length === 0) {
        await supabase.from('crawl4ai_jobs').update({
          status: 'done',
          finished_at: new Date().toISOString(),
        }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      // Mark as in_progress
      const taskIds = batchTasks.map((t: { id: number }) => t.id);
      await supabase.from('crawl4ai_tasks')
        .update({ task_status: 'in_progress', updated_at: new Date().toISOString() })
        .in('id', taskIds);

      let batchSucceeded = 0;
      let batchFailed = 0;

      for (const task of batchTasks) {
        const result = await crawlWithCrawl4AI(task.website as string, crawl4aiKey);

        if (result.success && result.markdown) {
          // Save snapshot to listing
          const snapshot = {
            success: true,
            data: {
              markdown: result.markdown,
              images: result.images ?? [],
              metadata: result.metadata ?? {},
            },
            source: 'crawl4ai',
            crawled_at: new Date().toISOString(),
          };

          await supabase.from('listings').update({
            crawl_snapshot: snapshot,
            crawl_status: 'success',
            last_crawled_at: new Date().toISOString(),
          }).eq('id', task.listing_id);

          await supabase.from('crawl4ai_tasks').update({
            task_status: 'done',
            content_length: result.markdown.length,
            images_found: (result.images ?? []).length,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', task.id);

          batchSucceeded++;
        } else {
          await supabase.from('listings').update({
            crawl_status: 'failed',
            last_crawled_at: new Date().toISOString(),
          }).eq('id', task.listing_id);

          await supabase.from('crawl4ai_tasks').update({
            task_status: 'failed',
            error_message: result.error ?? 'Unknown error',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', task.id);

          batchFailed++;
        }

        // Small delay between requests to be respectful
        if (batchTasks.indexOf(task) < batchTasks.length - 1) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
        }
      }

      // Update job counters
      await supabase.from('crawl4ai_jobs').update({
        processed: (job.processed ?? 0) + batchTasks.length,
        succeeded: (job.succeeded ?? 0) + batchSucceeded,
        failed: (job.failed ?? 0) + batchFailed,
      }).eq('id', jobId);

      // Self-chain for next batch
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/crawl4ai-scraper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({ processed: batchTasks.length, succeeded: batchSucceeded, failed: batchFailed }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
