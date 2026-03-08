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

interface StateAggregates {
  state: string;
  stateName: string;
  listingCount: number;
  cityCount: number;
  avgRating: number | null;
  topRatedName: string | null;
  topRatedCity: string | null;
  topRating: number | null;
  topCities: Array<{ city: string; count: number }>;
  commonAmenities: string[];
  washTypes: string[];
  has24hr: boolean;
  hasMembership: boolean;
  equipmentBrands: string[];
}

async function gatherStateData(
  supabase: ReturnType<typeof createClient>,
  state: string,
): Promise<StateAggregates> {
  const { data: listings } = await supabase
    .from('listings')
    .select('name, city, rating, review_count, amenities, hours, touchless_wash_types, equipment_brand, extracted_data')
    .eq('is_touchless', true)
    .eq('state', state);

  const rows = listings ?? [];
  const listingCount = rows.length;

  // Cities
  const cityCounts: Record<string, number> = {};
  for (const l of rows) {
    cityCounts[l.city] = (cityCounts[l.city] ?? 0) + 1;
  }
  const cityCount = Object.keys(cityCounts).length;
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({ city, count }));

  // Ratings
  const rated = rows.filter((l: { rating: number | null }) => l.rating != null && l.rating > 0);
  const avgRating = rated.length > 0
    ? Math.round((rated.reduce((sum: number, l: { rating: number }) => sum + l.rating, 0) / rated.length) * 10) / 10
    : null;
  const topRated = rated.length > 0
    ? rated.reduce((best: { name: string; city: string; rating: number }, l: { name: string; city: string; rating: number }) =>
        l.rating > best.rating ? l : best)
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

  // Equipment brands
  const brandSet = new Set<string>();
  for (const l of rows) {
    if (l.equipment_brand) brandSet.add(l.equipment_brand as string);
  }
  const equipmentBrands = Array.from(brandSet);

  return {
    state,
    stateName: STATE_NAMES[state] ?? state,
    listingCount,
    cityCount,
    avgRating,
    topRatedName: topRated?.name ?? null,
    topRatedCity: topRated?.city ?? null,
    topRating: topRated?.rating ?? null,
    topCities,
    commonAmenities,
    washTypes,
    has24hr,
    hasMembership,
    equipmentBrands,
  };
}

async function generateStateDescription(agg: StateAggregates, apiKey: string): Promise<string> {
  const parts: string[] = [];

  parts.push(`State: ${agg.stateName} (${agg.state})`);
  parts.push(`Total verified touchless car washes: ${agg.listingCount}`);
  parts.push(`Number of cities with locations: ${agg.cityCount}`);

  if (agg.topCities.length > 0) {
    parts.push(`Top cities: ${agg.topCities.map(c => `${c.city} (${c.count})`).join(', ')}`);
  }
  if (agg.avgRating) parts.push(`Average rating across state: ${agg.avgRating} stars`);
  if (agg.topRatedName && agg.topRating && agg.topRatedCity) {
    parts.push(`Top-rated: ${agg.topRatedName} in ${agg.topRatedCity} (${agg.topRating} stars)`);
  }
  if (agg.washTypes.length > 0) parts.push(`Wash types available: ${agg.washTypes.join(', ')}`);
  if (agg.commonAmenities.length > 0) parts.push(`Common amenities: ${agg.commonAmenities.join(', ')}`);
  if (agg.has24hr) parts.push(`Has 24-hour locations: Yes`);
  if (agg.hasMembership) parts.push(`Membership/unlimited plans available: Yes`);
  if (agg.equipmentBrands.length > 0) parts.push(`Equipment brands: ${agg.equipmentBrands.join(', ')}`);

  const context = parts.join('\n');

  const prompt = `You are writing a unique introductory paragraph for a state-level page on a touchless car wash directory website. The page lists all verified touchless (brushless, no-touch) car wash locations across the entire state.

Requirements:
- Write exactly 3-4 sentences (80-120 words)
- Naturally include the state name for SEO
- Mention the total number of verified locations and how many cities they span
- Highlight 2-3 standout details from the data (top cities, ratings, popular amenities, 24hr availability, membership options, wash types, etc.)
- Use a helpful, informative tone — not salesy or generic
- Do NOT use filler phrases like "look no further" or "whether you're looking for"
- Do NOT make up any facts not provided in the data
- Do NOT include a heading — just the paragraph text
- Each state's description must feel unique and specific to that state

State data:
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
        max_tokens: 400,
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
        .from('state_descriptions')
        .select('id', { count: 'exact', head: true })
        .not('description', 'is', null);

      const { data: stateRows } = await supabase.rpc('states_with_touchless_listings');
      const totalStates = (stateRows as string[] | null)?.length ?? 0;

      return Response.json({
        total_states: totalStates,
        with_description: withDesc ?? 0,
        without_description: totalStates - (withDesc ?? 0),
      }, { headers: corsHeaders });
    }

    // ── START ──
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const regenerate: boolean = body.regenerate ?? false;
      const limit: number = body.limit ?? 0;

      // Get all states with touchless listings
      const { data: stateRows } = await supabase.rpc('states_with_touchless_listings');
      let states = (stateRows as string[] | null) ?? [];

      if (!regenerate) {
        const { data: existing } = await supabase
          .from('state_descriptions')
          .select('state')
          .not('description', 'is', null);

        if (existing && existing.length > 0) {
          const existingSet = new Set(existing.map((e: { state: string }) => e.state));
          states = states.filter(s => !existingSet.has(s));
        }
      }

      if (limit > 0) states = states.slice(0, limit);

      if (states.length === 0) {
        return Response.json({ message: 'All states already have descriptions', total: 0 }, { headers: corsHeaders });
      }

      const results: Array<{ state: string; success: boolean; error?: string }> = [];

      for (const state of states) {
        try {
          const agg = await gatherStateData(supabase, state);
          const description = await generateStateDescription(agg, anthropicKey);

          if (description && description.length > 20) {
            const { error: upsertErr } = await supabase
              .from('state_descriptions')
              .upsert({
                state,
                description,
                generated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'state' });

            if (upsertErr) throw new Error(upsertErr.message);
            results.push({ state, success: true });
          }
        } catch (e) {
          results.push({ state, success: false, error: (e as Error).message });
        }
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return Response.json({
        total: states.length,
        succeeded,
        failed,
        results,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
