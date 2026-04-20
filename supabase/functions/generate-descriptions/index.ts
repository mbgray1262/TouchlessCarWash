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
  wash_packages: Array<{ name: string; price?: string; description?: string; features?: string[] }> | null;
  hours: Record<string, string> | null;
  google_description: string | null;
  google_category: string | null;
  google_subtypes: string | null;
  typical_time_spent: string | null;
  price_range: string | null;
  crawl_snapshot: { data?: { markdown?: string } } | null;
  extracted_data: Record<string, unknown> | null;
  parent_chain: string | null;
  review_snippets?: Array<{ review_text: string; rating: number | null; sentiment: string | null }>;
}

async function generateDescriptionWithGemini(listing: ListingData, apiKey: string): Promise<string> {
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

  // Enrich with extracted_data if available (from crawl snapshot extraction).
  // Quote taglines verbatim — do not paraphrase brand voice.
  const ed = listing.extracted_data as Record<string, unknown> | null;
  if (ed) {
    if (typeof ed.tagline === 'string' && ed.tagline.trim()) {
      parts.push(`Tagline (quote verbatim): "${ed.tagline.trim()}"`);
    }
    if (typeof ed.business_type === 'string' && ed.business_type.trim()) {
      parts.push(`Business type: ${ed.business_type}`);
    }
    if (typeof ed.established === 'string' && ed.established.trim()) {
      parts.push(`Established: ${ed.established}`);
    }
    const edPkgs = ed.wash_packages as Array<{ name: string; price?: string; features?: string[] }> | undefined;
    if (Array.isArray(edPkgs) && edPkgs.length > 0 && (!listing.wash_packages || edPkgs.length > listing.wash_packages.length)) {
      const pkgs = edPkgs.map(p => {
        let s = p.name;
        if (p.price) s += ` (${p.price})`;
        if (p.features?.length) s += ` — includes ${p.features.join(', ')}`;
        return s;
      }).join('; ');
      parts.push(`Wash packages from website: ${pkgs}`);
    }
    const plans = ed.membership_plans as Array<{ name: string; price?: string; description?: string }> | undefined;
    if (Array.isArray(plans) && plans.length > 0) {
      parts.push(`Membership options: ${plans.map(m => {
        let s = m.name;
        if (m.price) s += ` at ${m.price}`;
        if (m.description) s += ` (${m.description})`;
        return s;
      }).join(', ')}`);
    }
    const services = ed.service_types as string[] | undefined;
    if (Array.isArray(services) && services.length > 0) {
      parts.push(`Service types offered: ${services.join(', ')}`);
    }
    const equip = ed.equipment_technology as string[] | undefined;
    if (Array.isArray(equip) && equip.length > 0) {
      parts.push(`Equipment/Technology: ${equip.join(', ')}`);
    }
    const features = ed.special_features as string[] | undefined;
    if (Array.isArray(features) && features.length > 0) {
      parts.push(`Special features: ${features.join(', ')}`);
    }
    const amenitiesDetailed = ed.amenities_detailed as Array<string | { name: string; details?: string }> | undefined;
    if (Array.isArray(amenitiesDetailed) && amenitiesDetailed.length > 0) {
      const a = amenitiesDetailed.map(x => typeof x === 'string' ? x : (x.details ? `${x.name} (${x.details})` : x.name)).join(', ');
      parts.push(`Detailed amenities: ${a}`);
    }
    const payments = ed.payment_methods as string[] | undefined;
    if (Array.isArray(payments) && payments.length > 0) {
      parts.push(`Payment methods accepted: ${payments.join(', ')}`);
    }
    const usp = ed.unique_selling_points as string[] | undefined;
    if (Array.isArray(usp) && usp.length > 0) {
      parts.push(`Unique selling points: ${usp.join(', ')}`);
    }
    if (ed.review_highlights) {
      parts.push(`Customer feedback: ${JSON.stringify(ed.review_highlights)}`);
    }
  }

  // Include relevant excerpt from crawl snapshot if available
  const snapshotMd = listing.crawl_snapshot?.data?.markdown;
  if (snapshotMd && snapshotMd.length > 200) {
    parts.push(`\nWebsite content excerpt:\n${snapshotMd.substring(0, 3000)}`);
  }

  // Include per-location customer review snippets — the strongest source of
  // unique per-location content, especially for chain listings where every
  // other data field might be identical to sibling locations. The AI should
  // paraphrase observations customers actually made about THIS specific
  // location rather than parroting corporate marketing copy.
  const snippets = listing.review_snippets ?? [];
  if (snippets.length > 0) {
    const formatted = snippets
      .map((s, i) => {
        const stars = s.rating ? `${s.rating}★` : '';
        const sent = s.sentiment ? ` (${s.sentiment})` : '';
        const trimmed = s.review_text.replace(/\s+/g, ' ').trim().slice(0, 240);
        return `  Review ${i + 1}${stars}${sent}: "${trimmed}"`;
      })
      .join('\n');
    parts.push(`\nCustomer review snippets from this specific location (quote or paraphrase specific observations):\n${formatted}`);
  }

  const context = parts.join('\n');

  // Count the structured-data fields we have. The richer the data, the longer
  // and more specific the description should be. Listings with no usable
  // extracted_data should produce a very short, factual blurb (or, ideally,
  // shouldn't be regenerated at all — see the rich_only flag in start).
  const richFieldCount = ed ? [
    'tagline','wash_packages','membership_plans','service_types','special_features',
    'amenities_detailed','payment_methods','equipment_technology','unique_selling_points',
    'business_type','established','review_highlights'
  ].filter(k => {
    const v = (ed as Record<string, unknown>)[k];
    if (v == null) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  }).length : 0;

  // Review snippets count as richness for chain listings — they're often the
  // ONLY per-location content we have, and they're the most important
  // differentiator for AdSense (real customer text, not corporate copy).
  const hasSnippetRichness = snippets.length >= 2;
  const isRich = richFieldCount >= 3 || !!snapshotMd || hasSnippetRichness;
  const isVeryRich = richFieldCount >= 5 || (hasSnippetRichness && richFieldCount >= 2);

  const targetWords = isVeryRich ? '180-260' : isRich ? '130-200' : '70-120';

  const prompt = `You are writing a description for one specific car wash business on a directory site. The directory has thousands of listings, and your job is to make THIS page distinctly different from every other listing — by grounding every claim in the specific facts about THIS business.

CRITICAL RULES (the directory has been flagged for low-quality content; these rules exist because past descriptions read as templated and got the site rejected from Google AdSense):

1. EVERY sentence must contain at least one fact that comes specifically from the data block below. If a sentence could appear unchanged on a different car wash's page, delete it.

2. If a tagline is provided, quote it verbatim in double quotes with attribution. Do NOT paraphrase taglines.

3. Use specific named details whenever they exist:
   - Named wash packages (e.g., "the Ultimate Shine package at $19.99")
   - Named membership plans (e.g., "the All-Weather Unlimited tier at $34.99/month")
   - Specific equipment models (e.g., "PDQ LaserWash 360")
   - Specific amenities by name (e.g., "free vacuums", "soft towels", "vending machines")
   - Specific service types from the website's own language

4. BANNED PHRASES — these are generic and will trigger duplicate-content detection. Do not use them or any close variant:
   - "gentle on your vehicle" / "protects your paint"
   - "state-of-the-art" / "cutting-edge" / "advanced technology"
   - "look no further" / "best in town" / "top choice"
   - "trusted" / "reliable" / "convenient choice"
   - "whether you're a local or just passing through"
   - "beyond the car wash" / "more than just a car wash"
   - "in just minutes" / "in no time"
   - "your vehicle will thank you" / "leave looking like new"

5. NEVER invent facts. If the data doesn't say it, don't say it. No assumptions about what the business "probably" offers.

6. Length target: ${targetWords} words. Do not pad with filler to hit the upper bound — shorter is fine if data is limited. Quality > length.

7. Format: 1-3 paragraphs of plain text. No headings. No bullet lists. No emojis.

8. Tone: factual and informative, like a knowledgeable local writing a quick guide. Not promotional. Not sycophantic.

9. Naturally include the business name, city, and state once each (for SEO), but do not stuff keywords.

9a. CHAIN LOCATIONS: when the business is part of a named chain (parent_chain is set), the shared corporate website content will be the same across every location of that chain. You MUST lean heavily on the per-location customer review snippets, address, hours, and any location-specific amenities to differentiate this page from sibling locations. If you have review snippets, paraphrase specific observations customers made about THIS location (e.g. "several customers mention the free vacuums work consistently" or "reviewers highlight the 24-hour availability for late-shift drivers"). Do NOT lean primarily on the corporate tagline, founding year, or franchise-wide claims — those appear on every sibling page and are exactly the "scaled content" signal we are trying to avoid.

10. End with a concrete call to action grounded in real data — e.g., the actual phone number, the actual hours, or "visit during the open hours listed below." Do NOT end with generic exhortations like "stop by today!"

Business data:
${context}

Write the description now. Remember: every sentence must contain a fact specific to THIS business.`;

  // Gemini 2.5 Flash — free tier for directory-scale use.
  //
  // IMPORTANT: Gemini 2.5 Flash has "thinking" enabled by default, which
  // consumes output tokens internally before generating the visible
  // response. With the previous maxOutputTokens=800, thinking would
  // consume 400-600 tokens and the actual description would truncate at
  // ~120 chars mid-sentence. Fix: disable thinking entirely via
  // thinkingBudget=0 AND raise the output budget so the 180-260 word
  // target has plenty of headroom.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GEMINI_API_KEY');

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
      if (!geminiKey) {
        return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
      }

      const limit: number = body.limit ?? 0;
      const regenerate: boolean = body.regenerate ?? false;
      const listingIds: string[] | undefined = body.listing_ids;
      // rich_only: when true, only process listings that have extracted_data —
      // i.e. listings where we can ground the description in real facts pulled
      // from the business's own website. This is the recommended mode for
      // regenerating to fix the "scaled content" problem: thin listings
      // (handled separately by lib/listing-quality.ts) are noindexed; rich
      // listings get high-quality, fact-grounded rewrites.
      const richOnly: boolean = body.rich_only ?? false;

      let query = supabase
        .from('listings')
        .select('id')
        .eq('is_touchless', true)
        .order('review_count', { ascending: false });

      // If specific listing IDs provided, only process those
      if (listingIds && listingIds.length > 0) {
        query = query.in('id', listingIds);
      } else if (!regenerate) {
        query = query.is('description', null);
      }

      if (richOnly) {
        query = query.not('extracted_data', 'is', null);
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
      if (!geminiKey) {
        return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
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
          .select('id, name, city, state, address, zip, phone, website, rating, review_count, is_touchless, amenities, wash_packages, hours, google_description, google_category, google_subtypes, typical_time_spent, price_range, crawl_snapshot, extracted_data, parent_chain')
          .eq('id', task.listing_id)
          .maybeSingle();

        if (listing) {
          // Fetch up to 5 per-listing customer review snippets. These are the
          // strongest differentiator for chain locations that share all other
          // data with sibling locations — real customer words from THIS
          // specific wash are genuinely unique content Google can't find on
          // other pages. Feeding them to the prompt lets the AI quote or
          // paraphrase specific observations ("customers mention the free
          // vacuums work consistently", "several reviews note the 24-hour
          // availability"), which breaks up the templated chain-description
          // problem.
          const { data: snippets } = await supabase
            .from('review_snippets')
            .select('review_text, rating, sentiment')
            .eq('listing_id', task.listing_id)
            .order('rating', { ascending: false, nullsFirst: false })
            .limit(5);
          const listingWithSnippets = { ...listing, review_snippets: snippets ?? [] };

          const description = await generateDescriptionWithGemini(listingWithSnippets as ListingData, geminiKey);
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
