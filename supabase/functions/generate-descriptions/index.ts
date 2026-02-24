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

interface ListingData {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
  zip: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  is_touchless: boolean;
  amenities: string[] | null;
  wash_packages: Array<{ name: string; price?: string; description?: string }> | null;
  hours: Record<string, string> | null;
  google_description: string | null;
  google_category: string | null;
  google_subtypes: string | null;
  typical_time_spent: string | null;
  price_range: string | null;
}

async function generateDescriptionWithClaude(listing: ListingData, apiKey: string): Promise<string> {
  const parts: string[] = [];

  parts.push(`Business name: ${listing.name}`);
  parts.push(`Location: ${listing.address}, ${listing.city}, ${listing.state}${listing.zip ? ' ' + listing.zip : ''}`);

  if (listing.is_touchless) {
    parts.push('Type: Touchless (brushless) automated car wash');
  }

  if (listing.rating && listing.rating > 0) {
    const ratingLine = `Rating: ${Number(listing.rating).toFixed(1)} stars`;
    const reviewLine = listing.review_count && listing.review_count > 0
      ? ` based on ${listing.review_count} customer reviews`
      : '';
    parts.push(ratingLine + reviewLine);
  }

  if (listing.amenities && listing.amenities.length > 0) {
    parts.push(`Amenities/services: ${listing.amenities.join(', ')}`);
  }

  if (listing.wash_packages && listing.wash_packages.length > 0) {
    const pkgs = listing.wash_packages.map(p => {
      let s = p.name;
      if (p.price) s += ` (${p.price})`;
      if (p.description) s += ` — ${p.description}`;
      return s;
    }).join('; ');
    parts.push(`Wash packages: ${pkgs}`);
  }

  if (listing.hours && Object.keys(listing.hours).length > 0) {
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const hoursStr = dayOrder
      .filter(d => listing.hours![d])
      .map(d => `${d.charAt(0).toUpperCase() + d.slice(1)}: ${listing.hours![d]}`)
      .join(', ');
    parts.push(`Hours: ${hoursStr}`);
  }

  if (listing.typical_time_spent) {
    parts.push(`Typical visit duration: ${listing.typical_time_spent}`);
  }

  if (listing.price_range) {
    parts.push(`Price range: ${listing.price_range}`);
  }

  if (listing.google_description) {
    parts.push(`Google description: ${listing.google_description}`);
  }

  if (listing.google_subtypes) {
    parts.push(`Business subtypes: ${listing.google_subtypes}`);
  }

  const context = parts.join('\n');

  const prompt = `You are writing a helpful, informative description for a car wash business listing page. The description should:
- Be 2-3 concise paragraphs (roughly 80-150 words total)
- Naturally highlight the most compelling details: touchless/brushless technology, amenities, ratings, wash options, hours, and location
- Use a friendly but factual tone — helpful to a customer deciding whether to visit
- Be optimized for SEO by naturally including the business name, city, and state
- NOT use generic filler phrases like "look no further" or "best in town"
- NOT make up any details not provided in the data below
- NOT include a title/heading — just the paragraph text

Business data:
${context}

Write the description now:`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return (data.content?.[0]?.text ?? '').trim();
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

    if (action === 'status') {
      const { count: withDesc } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .not('description', 'is', null);

      const { count: without } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('description', null)
        .eq('is_touchless', true);

      const { count: total } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true);

      return Response.json({
        total_touchless: total ?? 0,
        with_description: withDesc ?? 0,
        without_description: without ?? 0,
      }, { headers: corsHeaders });
    }

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
        .order('review_count', { ascending: false });

      if (!regenerate) {
        query = query.is('description', null);
      }

      if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) return Response.json({ error: listErr.message }, { status: 500, headers: corsHeaders });
      if (!listings || listings.length === 0) {
        return Response.json({ message: 'No eligible listings found', total: 0 }, { headers: corsHeaders });
      }

      const { data: job, error: jobErr } = await supabase
        .from('description_jobs')
        .insert({ total: listings.length, status: 'running' })
        .select('id')
        .single();

      if (jobErr || !job) return Response.json({ error: jobErr?.message ?? 'Failed to create job' }, { status: 500, headers: corsHeaders });

      const tasks = listings.map((l: { id: string }) => ({
        job_id: job.id,
        listing_id: l.id,
        status: 'pending',
      }));

      const { error: taskErr } = await supabase.from('description_tasks').insert(tasks);
      if (taskErr) return Response.json({ error: taskErr.message }, { status: 500, headers: corsHeaders });

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/generate-descriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {})
      );

      return Response.json({ job_id: job.id, total: listings.length }, { headers: corsHeaders });
    }

    if (action === 'process_batch') {
      if (!anthropicKey) {
        return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('description_jobs')
        .select('id, status, total, completed, failed')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      if (job.status === 'completed' || job.status === 'failed') {
        return Response.json({ done: true, status: job.status }, { headers: corsHeaders });
      }

      const { data: taskRows } = await supabase
        .from('description_tasks')
        .select('id, listing_id')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('id')
        .limit(1);

      const task = taskRows?.[0];

      if (!task) {
        await supabase.from('description_jobs').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', jobId);
        return Response.json({ done: true }, { headers: corsHeaders });
      }

      await supabase.from('description_tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', task.id);

      let success = false;
      let errorMsg = '';

      try {
        const { data: listing } = await supabase
          .from('listings')
          .select('id, name, city, state, address, zip, phone, website, rating, review_count, is_touchless, amenities, wash_packages, hours, google_description, google_category, google_subtypes, typical_time_spent, price_range')
          .eq('id', task.listing_id)
          .maybeSingle();

        if (listing) {
          const description = await generateDescriptionWithClaude(listing as ListingData, anthropicKey);
          if (description && description.length > 20) {
            await supabase.from('listings').update({
              description,
              description_generated_at: new Date().toISOString(),
            }).eq('id', task.listing_id);
            success = true;
          }
        }
      } catch (e) {
        errorMsg = (e as Error).message;
      }

      await supabase.from('description_tasks').update({
        status: success ? 'completed' : 'failed',
        error: errorMsg || null,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id);

      await supabase.from('description_jobs').update({
        completed: (job.completed ?? 0) + (success ? 1 : 0),
        failed: (job.failed ?? 0) + (success ? 0 : 1),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/generate-descriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
        }).catch(() => {})
      );

      return Response.json({ listing_id: task.listing_id, success, error: errorMsg || null }, { headers: corsHeaders });
    }

    if (action === 'job_status') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from('description_jobs')
        .select('id, status, total, completed, failed, created_at, updated_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
      return Response.json(job, { headers: corsHeaders });
    }

    if (action === 'cancel') {
      const jobId = body.job_id;
      if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

      await supabase.from('description_jobs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', jobId);
      await supabase.from('description_tasks')
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
