import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ListingRow {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  crawl_snapshot: { data?: { markdown?: string } } | null;
  amenities: string[] | null;
  wash_packages: Array<Record<string, unknown>> | null;
}

async function extractRichData(
  listing: ListingRow,
  anthropicKey: string
): Promise<Record<string, unknown>> {
  const markdown = listing.crawl_snapshot?.data?.markdown || '';
  if (!markdown || markdown.length < 100) return {};

  const prompt = `Analyze this car wash website content and extract ALL available business details.

Business: ${listing.name}
Location: ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip || ''}

Website content:
${markdown.substring(0, 20000)}

Extract as much detail as possible. Respond with ONLY valid JSON — no commentary, no markdown code blocks:
{
  "service_types": ["touchless automatic", "self-serve bays", "full-service detailing"],
  "wash_packages": [
    {
      "name": "Basic Wash",
      "price": "$8.99",
      "description": "Exterior wash with spot-free rinse",
      "features": ["presoak", "high-pressure rinse", "spot-free rinse", "air dry"]
    }
  ],
  "membership_plans": [
    {
      "name": "Unlimited Monthly",
      "price": "$29.99/month",
      "wash_level": "Works",
      "features": ["unlimited washes", "any location"]
    }
  ],
  "equipment_technology": ["LaserWash 360", "touchless gantry system", "spot-free reverse osmosis"],
  "special_features": ["heated bays", "24/7 access", "pet wash station", "RV/truck capable"],
  "payment_methods": ["credit card", "mobile app", "cash", "RFID tag"],
  "amenities_detailed": [
    {"name": "Free vacuums", "details": "6 vacuum stations, open 24/7"}
  ],
  "hours_notes": "Open 24/7 year-round",
  "review_highlights": "Customers praise the touchless technology and quick service.",
  "unique_selling_points": ["Only touchless wash in the area", "Uses recycled water"]
}

Rules:
- Only include data that is EXPLICITLY stated on the website
- For prices, include the exact price shown (e.g. "$8.99", "Starting at $5")
- If a field has no data, use an empty array [] or null
- Do NOT fabricate or infer information not present in the content`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  const text: string = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  return JSON.parse(jsonMatch[0]);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ── STATUS ──────────────────────────────────────────────────────────────
    if (action === 'status') {
      const { count: withSnapshot } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('crawl_snapshot', 'is', null);

      const { count: withExtracted } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('extracted_data', 'is', null);

      const { count: eligible } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .not('crawl_snapshot', 'is', null)
        .is('extracted_data', null);

      const { count: total } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true);

      return Response.json({
        total_touchless: total ?? 0,
        with_snapshot: withSnapshot ?? 0,
        with_extracted_data: withExtracted ?? 0,
        eligible_for_extraction: eligible ?? 0,
      }, { headers: corsHeaders });
    }

    // ── START ────────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const regenerate: boolean = body.regenerate ?? false;

      let query = supabase
        .from('listings')
        .select('id')
        .eq('is_touchless', true)
        .not('crawl_snapshot', 'is', null)
        .order('review_count', { ascending: false });

      if (!regenerate) {
        query = query.is('extracted_data', null);
      }

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No eligible listings found', total: 0 }, { headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('extraction_jobs')
        .insert({ total: listings.length, status: 'running' })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      const tasks = listings.map((l: { id: string }) => ({
        job_id: job.id,
        listing_id: l.id,
        status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('extraction_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/extract-rich-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: listings.length }, { headers: corsHeaders });
    }

    // ── PROCESS_BATCH ────────────────────────────────────────────────────────
    if (action === 'process_batch') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('extraction_jobs')
        .select('id, status, total, completed, failed')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'completed' || job.status === 'failed') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const { data: taskRows } = await supabase
        .from('extraction_tasks')
        .select('id, listing_id')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('id')
        .limit(1);

      const task = taskRows?.[0];

      if (!task) {
        await supabase.from('extraction_jobs').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      await supabase.from('extraction_tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', task.id);

      let success = false;
      let errorMsg = '';

      try {
        const { data: listing } = await supabase
          .from('listings')
          .select('id, name, address, city, state, zip, crawl_snapshot, amenities, wash_packages')
          .eq('id', task.listing_id)
          .maybeSingle();

        if (listing && listing.crawl_snapshot) {
          const extracted = await extractRichData(listing as ListingRow, anthropicKey);

          if (extracted && Object.keys(extracted).length > 0) {
            const updatePayload: Record<string, unknown> = {
              extracted_data: extracted,
              extracted_at: new Date().toISOString(),
            };

            // Merge wash_packages if we got richer data
            const extractedPkgs = extracted.wash_packages as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(extractedPkgs) && extractedPkgs.length > 0) {
              const existingPkgs = listing.wash_packages || [];
              if (extractedPkgs.length > existingPkgs.length) {
                updatePayload.wash_packages = extractedPkgs;
              }
            }

            // Merge amenities
            const extractedAmenities = extracted.amenities_detailed as Array<{ name: string }> | undefined;
            if (Array.isArray(extractedAmenities) && extractedAmenities.length > 0) {
              const existing = listing.amenities || [];
              const newNames = extractedAmenities.map(a => a.name).filter(n => !existing.includes(n));
              if (newNames.length > 0) {
                updatePayload.amenities = [...existing, ...newNames];
              }
            }

            // Extract equipment brand/model from equipment_technology array
            const equipTech = extracted.equipment_technology as string[] | undefined;
            if (Array.isArray(equipTech) && equipTech.length > 0) {
              const { data: currentListing } = await supabase
                .from('listings')
                .select('equipment_brand, equipment_model')
                .eq('id', task.listing_id)
                .maybeSingle();

              if (!currentListing?.equipment_brand) {
                const knownBrands: Record<string, string> = {
                  'laserwash': 'laserwash',
                  'laser wash': 'laserwash',
                  'pdq': 'pdq',
                  'washworld': 'washworld',
                  'wash world': 'washworld',
                  'razor': 'washworld',
                  'petit': 'petit',
                  'belanger': 'belanger',
                  'kondor': 'belanger',
                  'istobal': 'istobal',
                  'ryko': 'ryko',
                  'd&s': 'ds',
                };

                for (const tech of equipTech) {
                  const techLower = tech.toLowerCase();
                  for (const [keyword, brand] of Object.entries(knownBrands)) {
                    if (techLower.includes(keyword)) {
                      updatePayload.equipment_brand = brand;
                      updatePayload.equipment_model = tech.trim();
                      break;
                    }
                  }
                  if (updatePayload.equipment_brand) break;
                }
              }
            }

            await supabase.from('listings').update(updatePayload).eq('id', task.listing_id);
            success = true;
          }
        }
      } catch (e) {
        errorMsg = (e as Error).message;
      }

      await supabase.from('extraction_tasks').update({
        status: success ? 'completed' : 'failed',
        error: errorMsg || null,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id);

      await supabase.from('extraction_jobs').update({
        completed: (job.completed ?? 0) + (success ? 1 : 0),
        failed: (job.failed ?? 0) + (success ? 0 : 1),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      // Self-invoke for next task
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/extract-rich-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({ listing_id: task.listing_id, success, error: errorMsg || null }, { headers: corsHeaders });
    }

    // ── JOB_STATUS ───────────────────────────────────────────────────────────
    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('extraction_jobs')
        .select('id, status, total, completed, failed, created_at, updated_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      return Response.json(job, { headers: corsHeaders });
    }

    // ── CANCEL ───────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('extraction_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', jobId);
      await supabase.from('extraction_tasks')
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
