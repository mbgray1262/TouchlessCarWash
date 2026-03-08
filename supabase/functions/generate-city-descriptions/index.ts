import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

interface CityAggregates {
  state: string;
  city: string;
  stateName: string;
  listingCount: number;
  avgRating: number | null;
  topRatedName: string | null;
  topRating: number | null;
  topReviewedName: string | null;
  topReviewCount: number | null;
  commonAmenities: string[];
  washTypes: string[];
  has24hr: boolean;
  hasMembership: boolean;
  priceRange: string | null;
  equipmentBrands: string[];
  specialFeatures: string[];
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

async function gatherCityData(
  supabase: ReturnType<typeof createClient>,
  state: string,
  city: string,
): Promise<CityAggregates> {
  const { data: listings } = await supabase
    .from('listings')
    .select('name, rating, review_count, amenities, hours, wash_packages, touchless_wash_types, equipment_brand, extracted_data, price_range')
    .eq('is_touchless', true)
    .eq('state', state)
    .ilike('city', city);

  const rows = listings ?? [];
  const listingCount = rows.length;

  // Ratings
  const rated = rows.filter((l: { rating: number | null }) => l.rating != null && l.rating > 0);
  const avgRating = rated.length > 0
    ? Math.round((rated.reduce((sum: number, l: { rating: number }) => sum + l.rating, 0) / rated.length) * 10) / 10
    : null;
  const topRated = rated.length > 0
    ? rated.reduce((best: { name: string; rating: number }, l: { name: string; rating: number }) => l.rating > best.rating ? l : best)
    : null;

  // Most reviewed
  const reviewed = rows.filter((l: { review_count: number | null }) => l.review_count != null && l.review_count > 0);
  const topReviewed = reviewed.length > 0
    ? reviewed.reduce((best: { name: string; review_count: number }, l: { name: string; review_count: number }) =>
        l.review_count > best.review_count ? l : best)
    : null;

  // Common amenities
  const amenityCounts: Record<string, number> = {};
  for (const l of rows) {
    if (l.amenities) {
      for (const a of l.amenities as string[]) {
        amenityCounts[a] = (amenityCounts[a] ?? 0) + 1;
      }
    }
  }
  const commonAmenities = Object.entries(amenityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([a]) => a);

  // Wash types
  const washTypeSet = new Set<string>();
  for (const l of rows) {
    if (l.touchless_wash_types) {
      for (const wt of l.touchless_wash_types as string[]) {
        washTypeSet.add(wt);
      }
    }
  }
  const washTypeLabels: Record<string, string> = {
    touchless_automatic: 'touchless automatic',
  };
  const washTypes = Array.from(washTypeSet).map(wt => washTypeLabels[wt] || wt);

  // 24hr check
  const has24hr = rows.some((l: { hours: Record<string, string> | null }) => {
    if (!l.hours) return false;
    return Object.values(l.hours).some(v => /24|open 24/i.test(v));
  });

  // Membership check
  const hasMembership = rows.some((l: { extracted_data: { membership_plans?: unknown[] } | null }) =>
    l.extracted_data?.membership_plans && (l.extracted_data.membership_plans as unknown[]).length > 0
  );

  // Price range
  const prices = rows.map((l: { price_range: string | null }) => l.price_range).filter(Boolean);
  const priceRange = prices.length > 0 ? prices[0] : null;

  // Equipment brands
  const brandSet = new Set<string>();
  for (const l of rows) {
    if (l.equipment_brand) brandSet.add(l.equipment_brand as string);
  }
  const equipmentBrands = Array.from(brandSet);

  // Special features
  const featureSet = new Set<string>();
  for (const l of rows) {
    const ed = l.extracted_data as { special_features?: string[] } | null;
    if (ed?.special_features) {
      for (const f of ed.special_features) {
        featureSet.add(f);
      }
    }
  }
  const specialFeatures = Array.from(featureSet).slice(0, 8);

  return {
    state,
    city,
    stateName: STATE_NAMES[state] ?? state,
    listingCount,
    avgRating,
    topRatedName: topRated?.name ?? null,
    topRating: topRated?.rating ?? null,
    topReviewedName: topReviewed?.name ?? null,
    topReviewCount: topReviewed?.review_count ?? null,
    commonAmenities,
    washTypes,
    has24hr,
    hasMembership,
    priceRange,
    equipmentBrands,
    specialFeatures,
  };
}

async function generateCityDescription(agg: CityAggregates, apiKey: string): Promise<string> {
  const parts: string[] = [];

  parts.push(`City: ${agg.city}, ${agg.stateName} (${agg.state})`);
  parts.push(`Number of verified touchless car washes: ${agg.listingCount}`);

  if (agg.avgRating) parts.push(`Average rating: ${agg.avgRating} stars`);
  if (agg.topRatedName && agg.topRating) parts.push(`Top-rated: ${agg.topRatedName} (${agg.topRating} stars)`);
  if (agg.topReviewedName && agg.topReviewCount) parts.push(`Most reviewed: ${agg.topReviewedName} (${agg.topReviewCount} reviews)`);
  if (agg.washTypes.length > 0) parts.push(`Wash types available: ${agg.washTypes.join(', ')}`);
  if (agg.commonAmenities.length > 0) parts.push(`Common amenities: ${agg.commonAmenities.join(', ')}`);
  if (agg.has24hr) parts.push(`Has 24-hour locations: Yes`);
  if (agg.hasMembership) parts.push(`Membership/unlimited plans available: Yes`);
  if (agg.priceRange) parts.push(`Typical price range: ${agg.priceRange}`);
  if (agg.equipmentBrands.length > 0) parts.push(`Equipment brands: ${agg.equipmentBrands.join(', ')}`);
  if (agg.specialFeatures.length > 0) parts.push(`Notable features: ${agg.specialFeatures.join(', ')}`);

  const context = parts.join('\n');

  const prompt = `You are writing a unique introductory paragraph for a city page on a touchless car wash directory website. The page lists all verified touchless (brushless, no-touch) car wash locations in this city.

Requirements:
- Write exactly 2-3 sentences (50-80 words)
- Naturally include the city name and state for SEO
- Mention the number of verified locations
- Highlight 1-2 standout details from the data (top-rated wash, popular amenities, 24hr availability, membership options, equipment brands, etc.)
- Use a helpful, informative tone — not salesy or generic
- Do NOT use filler phrases like "look no further" or "whether you're looking for"
- Do NOT make up any facts not provided in the data
- Do NOT include a heading — just the paragraph text
- Each city's description must feel unique and specific to that city

City data:
${context}

Write the description now:`;

  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.ok) {
      const data = await res.json() as { content: Array<{ text: string }> };
      return (data.content?.[0]?.text ?? '').trim();
    }

    if (res.status === 529 || res.status === 429) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }

    throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  }
  throw new Error('Max retries exceeded');
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

    // ── STATUS ──
    if (action === 'status') {
      const { count: withDesc } = await supabase
        .from('city_descriptions')
        .select('id', { count: 'exact', head: true })
        .not('description', 'is', null);

      // Count distinct cities from listings
      const { data: allListings } = await supabase
        .from('listings')
        .select('state, city')
        .eq('is_touchless', true);

      const citySet = new Set<string>();
      if (allListings) {
        for (const l of allListings) {
          citySet.add(`${l.state}::${l.city}`);
        }
      }

      return Response.json({
        total_cities: citySet.size,
        with_description: withDesc ?? 0,
        without_description: citySet.size - (withDesc ?? 0),
      }, { headers: corsHeaders });
    }

    // ── START ──
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const regenerate: boolean = body.regenerate ?? false;

      // Get all distinct cities from listings
      const { data: allListings } = await supabase
        .from('listings')
        .select('state, city')
        .eq('is_touchless', true);

      if (!allListings || allListings.length === 0) {
        return Response.json({ message: 'No touchless listings found', total: 0 }, { headers: corsHeaders });
      }

      const cityMap = new Map<string, { state: string; city: string }>();
      for (const l of allListings) {
        const key = `${l.state}::${l.city}`;
        if (!cityMap.has(key)) {
          cityMap.set(key, { state: l.state, city: l.city });
        }
      }

      let cities = Array.from(cityMap.values());

      // Filter out cities that already have descriptions
      if (!regenerate) {
        const { data: existing } = await supabase
          .from('city_descriptions')
          .select('state, city')
          .not('description', 'is', null);

        if (existing && existing.length > 0) {
          const existingSet = new Set(existing.map((e: { state: string; city: string }) => `${e.state}::${e.city}`));
          cities = cities.filter(c => !existingSet.has(`${c.state}::${c.city}`));
        }
      }

      if (limit > 0) cities = cities.slice(0, limit);

      if (cities.length === 0) {
        return Response.json({ message: 'All cities already have descriptions', total: 0 }, { headers: corsHeaders });
      }

      // Create job
      const { data: job, error: jobErr } = await supabase
        .from('city_description_jobs')
        .insert({ total: cities.length, status: 'running' })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      // Create tasks
      const tasks = cities.map(c => ({
        job_id: job.id,
        state: c.state,
        city: c.city,
        status: 'pending',
      }));

      // Insert in batches of 500
      for (let i = 0; i < tasks.length; i += 500) {
        const batch = tasks.slice(i, i + 500);
        const { error: taskErr } = await supabase.from('city_description_tasks').insert(batch);
        if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });
      }

      // Kick off processing
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/generate-city-descriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: cities.length }, { headers: corsHeaders });
    }

    // ── PROCESS_BATCH ──
    if (action === 'process_batch') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('city_description_jobs')
        .select('id, status, total, completed, failed')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'completed' || job.status === 'failed') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      // Grab next pending task
      const { data: taskRows } = await supabase
        .from('city_description_tasks')
        .select('id, state, city')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('id')
        .limit(1);

      const task = taskRows?.[0];

      if (!task) {
        await supabase.from('city_description_jobs').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      await supabase.from('city_description_tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', task.id);

      let success = false;
      let errorMsg = '';

      try {
        const agg = await gatherCityData(supabase, task.state, task.city);
        const description = await generateCityDescription(agg, anthropicKey);

        if (description && description.length > 20) {
          // Upsert into city_descriptions
          const { error: upsertErr } = await supabase
            .from('city_descriptions')
            .upsert({
              state: task.state,
              city: task.city,
              description,
              generated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'state,city' });

          if (upsertErr) throw new Error(upsertErr.message);
          success = true;
        }
      } catch (e) {
        errorMsg = (e as Error).message;
      }

      await supabase.from('city_description_tasks').update({
        status: success ? 'completed' : 'failed',
        error: errorMsg || null,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id);

      await supabase.from('city_description_jobs').update({
        completed: (job.completed ?? 0) + (success ? 1 : 0),
        failed: (job.failed ?? 0) + (success ? 0 : 1),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      // Chain to next task
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/generate-city-descriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({ city: `${task.city}, ${task.state}`, success, error: errorMsg || null }, { headers: corsHeaders });
    }

    // ── JOB_STATUS ──
    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('city_description_jobs')
        .select('id, status, total, completed, failed, created_at, updated_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      return Response.json(job, { headers: corsHeaders });
    }

    // ── CANCEL ──
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('city_description_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', jobId);
      await supabase.from('city_description_tasks')
        .update({ status: 'failed', error: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('status', 'pending');

      return Response.json({ cancelled: true }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
