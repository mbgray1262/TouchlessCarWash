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
          .in('crawl_status', ['failed', 'timeout'])
          .not('website', 'is', null)
          .neq('website', '')
          .order('id');
      }

      const offset = chunkIndex * CHUNK_SIZE;
      const { data: listings, error: listErr } = await query.range(offset, offset + CHUNK_SIZE - 1);

      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) return Response.json({ message: 'No listings to process', done: true }, { headers: corsHeaders });

      const urls = listings.map((l: { website: string }) => l.website);

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
    // Processes one page of Firecrawl results per call to avoid timeouts.
    // The UI should call this repeatedly (passing next_cursor) until done=true.
    if (action === 'poll_batch') {
      if (!firecrawlKey || !anthropicKey) return Response.json({ error: 'API keys not configured' }, { status: 500, headers: corsHeaders });

      const jobId: string = body.job_id ?? url.searchParams.get('job_id');
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      // next_cursor is the full Firecrawl pagination URL for the next page, or null to start from beginning
      const nextCursor: string | null = body.next_cursor ?? null;

      const { data: batch } = await supabase.from('pipeline_batches')
        .select('*').eq('firecrawl_job_id', jobId).maybeSingle();

      const { data: filterRows } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

      const pageUrl = nextCursor ?? `${FIRECRAWL_API}/batch/scrape/${jobId}`;
      const pollRes = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });

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
          metadata?: { title?: string; sourceURL?: string; statusCode?: number };
        }>;
        next?: string;
      };

      const batchStatus = pollData.status;
      const creditsUsed = pollData.creditsUsed ?? 0;
      const items = pollData.data ?? [];

      // Collect all sourceURLs from this page and look them up in bulk
      const sourceURLs = items.map(i => i.metadata?.sourceURL ?? '').filter(Boolean);
      const urlVariants = sourceURLs.flatMap(u => {
        const norm = normalizeUrl(u);
        return [
          `https://${norm}`, `https://${norm}/`,
          `http://${norm}`, `http://${norm}/`,
          `https://www.${norm}`, `https://www.${norm}/`,
        ];
      });

      const { data: matchedListings } = await supabase.from('listings')
        .select('id, is_touchless, hero_image, description, website')
        .in('website', urlVariants);

      const listingMap = new Map<string, { id: string; is_touchless: boolean | null; hero_image: string | null; description: string | null; website: string }>();
      for (const l of (matchedListings ?? [])) {
        listingMap.set(normalizeUrl(l.website), l);
      }

      let totalProcessed = 0;

      for (const item of items) {
        const sourceURL = item.metadata?.sourceURL ?? '';
        const statusCode = item.metadata?.statusCode ?? 0;

        const listing = listingMap.get(normalizeUrl(sourceURL));
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

        const { error: updateErr } = await supabase.from('listings').update(updatePayload).eq('id', listing.id);
        if (updateErr) console.error(`listings update failed for ${listing.id}:`, updateErr.message);

        await supabase.from('pipeline_runs').insert({
          listing_id: listing.id,
          batch_id: batch?.id ?? null,
          crawl_status,
          is_touchless,
          touchless_evidence,
          raw_markdown: markdown.slice(0, 50000),
          images_found: images.length,
        });

        await syncFilters(supabase, listing.id, is_touchless, amenities, filterMap);

        totalProcessed++;
      }

      const newCompleted = (batch?.completed_count ?? 0) + totalProcessed;
      const isDone = !pollData.next;

      if (batch) {
        await supabase.from('pipeline_batches').update({
          status: isDone && batchStatus === 'completed' ? 'completed' : 'running',
          completed_count: newCompleted,
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
        total_completed: newCompleted,
        total_urls: batch?.total_urls ?? 0,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
