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
  'bbb.org', 'instagram.com', 'twitter.com', 'tiktok.com',
];

function filterImages(images: string[]): string[] {
  return images.filter(url => {
    const lower = url.toLowerCase();
    if (lower.includes('favicon') || lower.includes('icon')) return false;
    if (lower.includes('facebook.com') || lower.includes('twitter.com')) return false;
    if (lower.includes('google-analytics') || lower.includes('pixel')) return false;
    if (lower.includes('.svg') && lower.includes('logo')) return false;
    if (lower.includes('1x1') || lower.includes('spacer')) return false;
    return /\.(jpg|jpeg|png|webp)/i.test(lower);
  }).slice(0, 10);
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
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
    const action = url.searchParams.get('action') ?? (req.method === 'POST' ? (await req.json().catch(() => ({}))).action : 'status');

    // --- GET STATUS ---
    if (req.method === 'GET' && !action || action === 'status') {
      const [totalRes, scrapedRes, classifiedRes, touchlessRes, notTouchlessRes, failedRes, redirectRes] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .is('is_touchless', null).not('website', 'is', null).neq('website', ''),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .not('last_crawled_at', 'is', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .not('touchless_evidence', 'is', null),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', true),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('is_touchless', false),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('crawl_status', 'failed'),
        supabase.from('listings').select('id', { count: 'exact', head: true })
          .eq('crawl_status', 'redirect'),
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
        .limit(50);

      return Response.json({
        stats: {
          queue: totalRes.count ?? 0,
          scraped: scrapedRes.count ?? 0,
          classified: classifiedRes.count ?? 0,
          touchless: touchlessRes.count ?? 0,
          not_touchless: notTouchlessRes.count ?? 0,
          failed: failedRes.count ?? 0,
          redirects: redirectRes.count ?? 0,
        },
        batches: batchesRes.data ?? [],
        recent_runs: recentRunsRes.data ?? [],
      }, { headers: corsHeaders });
    }

    // --- SUBMIT BATCH ---
    if (action === 'submit_batch') {
      if (!firecrawlKey) return Response.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500, headers: corsHeaders });

      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
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
          .in('crawl_status', ['failed', 'timeout'])
          .not('website', 'is', null)
          .neq('website', '')
          .order('id');
      }

      const offset = chunkIndex * CHUNK_SIZE;
      const { data: listings, error: listErr } = await query.range(offset, offset + CHUNK_SIZE - 1);

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) return Response.json({ message: 'No listings to process', done: true }, { headers: corsHeaders });

      const urls = listings.map(l => l.website as string);

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
      }).select().single();

      if (batchErr) return Response.json({ error: batchErr.message }, { status: 500, headers: corsHeaders });

      return Response.json({ batch, job_id: fcData.id, urls_submitted: urls.length }, { headers: corsHeaders });
    }

    // --- POLL BATCH ---
    if (action === 'poll_batch') {
      if (!firecrawlKey || !anthropicKey) return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });

      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const jobId: string = body.job_id ?? url.searchParams.get('job_id');
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: batch } = await supabase.from('pipeline_batches')
        .select('*').eq('firecrawl_job_id', jobId).maybeSingle();

      let nextUrl: string | null = `${FIRECRAWL_API}/batch/scrape/${jobId}`;
      let totalProcessed = 0;
      let creditsUsed = 0;
      let batchStatus = 'running';

      while (nextUrl) {
        const pollRes = await fetch(nextUrl, {
          headers: { 'Authorization': `Bearer ${firecrawlKey}` },
        });

        if (!pollRes.ok) break;

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

        batchStatus = pollData.status;
        creditsUsed = pollData.creditsUsed ?? 0;

        for (const item of (pollData.data ?? [])) {
          const sourceURL = item.metadata?.sourceURL ?? '';
          const statusCode = item.metadata?.statusCode ?? 0;

          // Find matching listing by website URL
          const { data: listings } = await supabase.from('listings')
            .select('id, is_touchless, hero_image, description')
            .eq('website', sourceURL)
            .limit(1);

          const listing = listings?.[0];
          if (!listing) continue;

          let crawl_status = 'success';
          let is_touchless: boolean | null = null;
          let touchless_evidence = '';
          let amenities: string[] = [];
          let description: string | null = null;
          const markdown = item.markdown ?? '';
          const images = item.images ?? [];

          if (statusCode >= 400 || !markdown || markdown.trim().length < 50) {
            crawl_status = statusCode >= 400 ? 'failed' : 'no_content';
          } else if (SKIP_DOMAINS.some(d => sourceURL.includes(d))) {
            crawl_status = 'redirect';
          } else {
            try {
              const classification = await classifyWithClaude(markdown, anthropicKey);
              is_touchless = classification.is_touchless ?? null;
              touchless_evidence = classification.touchless_evidence ?? '';
              amenities = classification.amenities ?? [];
              description = classification.description ?? null;
              crawl_status = 'success';
            } catch {
              crawl_status = 'no_content';
            }
          }

          const filteredImages = filterImages(images);

          const updatePayload: Record<string, unknown> = {
            last_crawled_at: new Date().toISOString(),
            crawl_status,
            touchless_evidence,
            website_photos: filteredImages.length > 0 ? filteredImages : null,
          };

          if (listing.is_touchless === null && is_touchless !== null) {
            updatePayload.is_touchless = is_touchless;
          }
          if (!listing.hero_image && filteredImages.length > 0) {
            updatePayload.hero_image = filteredImages[0];
          }
          if (!listing.description && description) {
            updatePayload.description = description;
          }
          if (amenities.length > 0) {
            updatePayload.amenities = amenities;
          }

          await supabase.from('listings').update(updatePayload).eq('id', listing.id);

          await supabase.from('pipeline_runs').insert({
            listing_id: listing.id,
            batch_id: batch?.id ?? null,
            crawl_status,
            is_touchless,
            touchless_evidence,
            raw_markdown: markdown.slice(0, 50000),
            images_found: images.length,
          });

          totalProcessed++;
        }

        nextUrl = pollData.next ?? null;
      }

      if (batch) {
        await supabase.from('pipeline_batches').update({
          status: batchStatus === 'completed' ? 'completed' : 'running',
          completed_count: batch.completed_count + totalProcessed,
          credits_used: creditsUsed,
          updated_at: new Date().toISOString(),
        }).eq('id', batch.id);
      }

      return Response.json({ processed: totalProcessed, credits_used: creditsUsed, batch_status: batchStatus }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
