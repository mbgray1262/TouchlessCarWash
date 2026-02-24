import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
    }

    const payload = await req.json() as {
      type: 'page' | 'completed';
      jobId?: string;
      data?: {
        markdown?: string;
        images?: string[];
        metadata?: { title?: string; sourceURL?: string; statusCode?: number };
      };
      success?: boolean;
      total?: number;
      completed?: number;
      creditsUsed?: number;
    };

    if (payload.type === 'completed') {
      const jobId = payload.jobId;
      if (jobId) {
        await supabase.from('pipeline_batches').update({
          status: 'completed',
          credits_used: payload.creditsUsed ?? 0,
          completed_count: payload.completed ?? 0,
          updated_at: new Date().toISOString(),
        }).eq('firecrawl_job_id', jobId);
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (payload.type !== 'page' || !payload.data) {
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    const item = payload.data;
    const sourceURL = item.metadata?.sourceURL ?? '';
    const statusCode = item.metadata?.statusCode ?? 0;
    const markdown = item.markdown ?? '';
    const images = item.images ?? [];

    const { data: batch } = await supabase.from('pipeline_batches')
      .select('id, url_to_id, batch_type, status').eq('firecrawl_job_id', payload.jobId ?? '').maybeSingle();

    if (batch?.status === 'failed' || batch?.status === 'completed') {
      return Response.json({ ok: true, skipped: 'batch already finished' }, { headers: corsHeaders });
    }

    function normalizeUrl(url: string): string {
      return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
    }

    const rawUrlMap = (batch as unknown as { url_to_id?: Record<string, unknown> })?.url_to_id ?? {};
    const normToIds = new Map<string, string[]>();
    for (const [url, val] of Object.entries(rawUrlMap)) {
      const ids = Array.isArray(val) ? val as string[] : (typeof val === 'string' && val ? [val] : []);
      if (ids.length > 0) {
        const norm = normalizeUrl(url);
        const existing = normToIds.get(norm) ?? [];
        normToIds.set(norm, [...new Set([...existing, ...ids])]);
      }
    }

    const normSrc = normalizeUrl(sourceURL);
    let listingIds: string[] = normToIds.get(normSrc) ?? [];

    if (listingIds.length === 0) {
      const urlVariants = [
        sourceURL, sourceURL.replace(/\/$/, ''), sourceURL + '/',
        sourceURL.replace(/^https?:\/\//, 'https://www.'),
        sourceURL.replace(/^https?:\/\/www\./, 'https://'),
      ];
      const { data: fallbackRows } = await supabase.from('listings')
        .select('id').in('website', urlVariants);
      listingIds = (fallbackRows ?? []).map((r: { id: string }) => r.id);
    }

    if (listingIds.length === 0) {
      return Response.json({ ok: true, skipped: 'no matching listing' }, { headers: corsHeaders });
    }

    const { data: matchedListings } = await supabase.from('listings')
      .select('id, is_touchless, hero_image')
      .in('id', listingIds);
    const listingRows = matchedListings ?? [];

    const { data: filterRows } = await supabase.from('filters').select('id, slug');
    const filterMap: FilterMap = {};
    for (const f of (filterRows ?? [])) filterMap[f.slug] = f.id;

    let crawl_status = 'classified';
    let is_touchless: boolean | null = null;
    let touchless_evidence = '';
    let amenities: string[] = [];

    if (statusCode >= 400 || !markdown || markdown.trim().length < 50) {
      crawl_status = statusCode >= 400 ? 'fetch_failed' : 'no_content';
    } else if (SKIP_DOMAINS.some(d => sourceURL.includes(d))) {
      crawl_status = 'redirect';
    } else {
      try {
        const classification = await classifyWithClaude(markdown, anthropicKey);
        is_touchless = classification.is_touchless ?? null;
        touchless_evidence = classification.touchless_evidence ?? '';
        amenities = classification.amenities ?? [];
      } catch {
        crawl_status = 'classify_failed';
      }
    }

    const filteredImages = filterImages(images);

    const isEnrichBatch = batch?.batch_type === 'enrich_touchless';

    await Promise.all(listingRows.map(async (listing: { id: string; is_touchless: boolean | null; hero_image: string | null }) => {
      const updatePayload: Record<string, unknown> = {
        last_crawled_at: new Date().toISOString(),
        website_photos: filteredImages.length > 0 ? filteredImages : null,
      };
      if (!isEnrichBatch) {
        updatePayload.crawl_status = crawl_status;
        updatePayload.touchless_evidence = touchless_evidence;
        if (listing.is_touchless === null && is_touchless !== null) updatePayload.is_touchless = is_touchless;
      }
      if (!listing.hero_image && filteredImages.length > 0) updatePayload.hero_image = filteredImages[0];
      if (amenities.length > 0) updatePayload.amenities = amenities;

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
      await syncFilters(supabase, listing.id, is_touchless, amenities, filterMap);
    }));

    return Response.json({ ok: true, updated: listingRows.length }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
