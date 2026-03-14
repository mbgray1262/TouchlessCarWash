import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getSecret(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      apikey: serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}

// ── Fetch all listings with pagination ────────────────────────────────
async function fetchAllListings(
  supabase: ReturnType<typeof createClient>,
  select: string,
): Promise<Record<string, unknown>[]> {
  const PAGE_SIZE = 1000; // Supabase default max_rows is 1000
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select(select)
      .not('address', 'is', null)
      .not('address', 'eq', '')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

// deno-lint-ignore no-explicit-any
function groupByAddress(listings: any[]): Record<string, any[]> {
  // deno-lint-ignore no-explicit-any
  const groups: Record<string, any[]> = {};
  for (const l of listings) {
    const key = `${(l.address || '').toLowerCase().trim()}|${(l.city || '').toLowerCase().trim()}|${(l.state || '').toLowerCase().trim()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  }
  return groups;
}

// ── Listing scoring ──────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function scoreListing(l: Record<string, any>): number {
  let score = 0;
  if (l.google_place_id) score += 10;
  if (l.rating && l.rating > 0) score += 5;
  if (l.review_count && l.review_count > 0) score += 3 + Math.min(5, Math.floor(l.review_count / 50));
  if (l.hero_image) score += 5;
  if (l.description) score += 3;
  if (l.hours) score += 3;
  if (l.phone) score += 2;
  if (l.website) score += 2;
  if (l.latitude && l.longitude) score += 3;
  if (Array.isArray(l.amenities) && l.amenities.length > 0) score += 2;
  if (Array.isArray(l.photos) && l.photos.length > 0) score += 2;
  if (l.is_touchless !== null && l.is_touchless !== undefined) score += 2;
  if (Array.isArray(l.wash_packages) && l.wash_packages.length > 0) score += 2;
  if (l.google_maps_url) score += 1;
  if (l.street_view_url) score += 1;
  if (l.google_description) score += 1;
  return score;
}

// ── AI decision ──────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function aiDecide(
  listings: Record<string, any>[],
  sameVendor: boolean,
  anthropicKey: string,
): Promise<{ decision: 'merge' | 'skip'; reasoning: string; confidence: string }> {
  const listingSummaries = listings.map((l, i) => {
    const parts = [
      `Listing ${i + 1}: "${l.name}"`,
      `  Address: ${l.address}, ${l.city}, ${l.state} ${l.zip || ''}`,
      `  Vendor: ${l.vendor_name || 'none'} (id: ${l.vendor_id ?? 'null'})`,
      `  Rating: ${l.rating ?? 'n/a'} (${l.review_count ?? 0} reviews)`,
      `  Touchless: ${l.is_touchless ?? 'unknown'}`,
      `  Google category: ${l.google_category ?? 'n/a'}`,
      `  Has website: ${l.website ? 'yes' : 'no'}`,
      `  Has google_place_id: ${l.google_place_id ? 'yes' : 'no'}`,
      `  Has hero image: ${l.hero_image ? 'yes' : 'no'}`,
      `  Data score: ${scoreListing(l)}`,
    ];
    return parts.join('\n');
  }).join('\n\n');

  const prompt = `You are deduplicating a car wash directory database. Below is a group of ${listings.length} listings that share the same street address, city, and state.${sameVendor ? ' They all belong to the SAME vendor.' : ''}

Determine if these are the SAME business (duplicates that should be merged) or DIFFERENT businesses that happen to be co-located at the same address.

MERGE when:
- Same business listed multiple times with name variants (e.g., "Shell" and "Shell Car Wash")
- Same chain with sub-listings (e.g., "Toot'n Totum" and "Toot'n Totum Express Car Wash")
- A parent business and its service department (e.g., "Circle K" and "Circle K | Car Wash")
- Different names but same vendor and clearly the same physical car wash
${sameVendor ? '- Since these share the same vendor, they are very likely duplicates unless the names suggest completely different business types' : ''}

SKIP when:
- Genuinely different businesses at the same address complex (e.g., a car wash and a separate laundromat)
- An auto dealership and a separate car wash that happen to share an address
- Businesses with different Google Place IDs AND clearly different business types

${listingSummaries}

Respond ONLY with JSON (no other text):
{"decision":"merge" or "skip","reasoning":"1-2 sentence explanation","confidence":"high" or "medium" or "low"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Claude API error ${res.status}: ${errText}`);
      // Default to skip for safety on API errors
      return { decision: 'skip', reasoning: `AI error: ${res.status}`, confidence: 'low' };
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { decision: 'skip', reasoning: `Could not parse AI response: ${raw.slice(0, 100)}`, confidence: 'low' };
    }

    const parsed = JSON.parse(match[0]);
    return {
      decision: parsed.decision === 'merge' ? 'merge' : 'skip',
      reasoning: String(parsed.reasoning || '').slice(0, 500),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    };
  } catch (err) {
    console.error('AI decision error:', err);
    return { decision: 'skip', reasoning: `Error: ${String(err).slice(0, 200)}`, confidence: 'low' };
  }
}

// ── Merge logic ──────────────────────────────────────────────────────
const CHILD_TABLES = [
  'review_snippets',
  'listing_edits',
  'hero_reviews',
  'description_tasks',
  'photo_enrich_tasks',
  'pipeline_runs',
  'listing_filters',
  'street_view_audit_tasks',
  'extraction_tasks',
  'listing_events',
  'best_of_rankings',
];

// deno-lint-ignore no-explicit-any
function mergeArrayField(survivor: any[], duplicate: any[]): any[] {
  if (!Array.isArray(survivor)) survivor = [];
  if (!Array.isArray(duplicate)) duplicate = [];
  const set = new Set([...survivor.map(String), ...duplicate.map(String)]);
  // Return original typed values where possible
  const all = [...survivor, ...duplicate];
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = String(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return set.has(key);
  });
}

async function executeMerge(
  supabase: ReturnType<typeof createClient>,
  // deno-lint-ignore no-explicit-any
  survivor: Record<string, any>,
  // deno-lint-ignore no-explicit-any
  duplicates: Record<string, any>[],
): Promise<{ fieldsMerged: string[]; childRecordsMoved: number }> {
  const fieldsMerged: string[] = [];
  let childRecordsMoved = 0;

  // Build update payload: fill survivor's empty fields from duplicates
  // deno-lint-ignore no-explicit-any
  const update: Record<string, any> = {};

  // Scalar fields: copy from duplicate if survivor is null/empty
  const scalarFields = [
    'phone', 'website', 'google_place_id', 'google_maps_url',
    'google_description', 'google_category', 'business_status',
    'google_photo_url', 'google_logo_url', 'street_view_url',
    'google_id', 'booking_url', 'price_range', 'typical_time_spent',
    'hero_image', 'hero_image_source', 'logo_url', 'logo_photo',
    'location_page_url', 'equipment_brand', 'equipment_model',
    'parent_chain', 'description', 'google_subtypes',
    'latitude', 'longitude',
  ];

  for (const field of scalarFields) {
    if (!survivor[field] && duplicates.some((d) => d[field])) {
      const donor = duplicates.find((d) => d[field]);
      if (donor) {
        update[field] = donor[field];
        fieldsMerged.push(field);
      }
    }
  }

  // JSONB fields: copy if survivor is null
  const jsonbFields = ['hours', 'google_about', 'reviews_per_score', 'popular_times', 'crawl_snapshot', 'extracted_data'];
  for (const field of jsonbFields) {
    if (!survivor[field] && duplicates.some((d) => d[field])) {
      const donor = duplicates.find((d) => d[field]);
      if (donor) {
        update[field] = donor[field];
        fieldsMerged.push(field);
      }
    }
  }

  // Special: take higher rating/review_count
  for (const dup of duplicates) {
    if (dup.rating && (!survivor.rating || dup.rating > survivor.rating)) {
      update.rating = dup.rating;
      if (!fieldsMerged.includes('rating')) fieldsMerged.push('rating');
    }
    if (dup.review_count && (!survivor.review_count || dup.review_count > survivor.review_count)) {
      update.review_count = dup.review_count;
      if (!fieldsMerged.includes('review_count')) fieldsMerged.push('review_count');
    }
    if (dup.google_photos_count && (!survivor.google_photos_count || dup.google_photos_count > survivor.google_photos_count)) {
      update.google_photos_count = dup.google_photos_count;
      if (!fieldsMerged.includes('google_photos_count')) fieldsMerged.push('google_photos_count');
    }
  }

  // Special: is_touchless — prefer true or false over null
  if (survivor.is_touchless === null) {
    const donor = duplicates.find((d) => d.is_touchless !== null);
    if (donor) {
      update.is_touchless = donor.is_touchless;
      fieldsMerged.push('is_touchless');
    }
  }

  // Array fields: union
  const arrayFields = ['amenities', 'photos', 'touchless_wash_types', 'touchless_evidence', 'wash_packages'];
  for (const field of arrayFields) {
    const dupWithData = duplicates.find(
      (d) => Array.isArray(d[field]) && d[field].length > 0,
    );
    if (dupWithData) {
      const merged = mergeArrayField(survivor[field], dupWithData[field]);
      if (merged.length > (Array.isArray(survivor[field]) ? survivor[field].length : 0)) {
        update[field] = merged;
        fieldsMerged.push(field);
      }
    }
  }

  // Apply update to survivor
  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('listings')
      .update(update)
      .eq('id', survivor.id);
    if (error) {
      console.error(`Failed to update survivor ${survivor.id}: ${error.message}`);
    }
  }

  // Reassign child records from each duplicate to the survivor
  const dupIds = duplicates.map((d) => d.id);
  for (const table of CHILD_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .update({ listing_id: survivor.id })
        .in('listing_id', dupIds)
        .select('id');

      if (!error && data) {
        childRecordsMoved += data.length;
      }
    } catch {
      // Table might not exist or have no matching rows — that's OK
    }
  }

  // Delete duplicate listings
  for (const dupId of dupIds) {
    const { error } = await supabase.from('listings').delete().eq('id', dupId);
    if (error) {
      console.error(`Failed to delete duplicate ${dupId}: ${error.message}`);
    }
  }

  return { fieldsMerged, childRecordsMoved };
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? 'status';

    // ── STATUS ──
    if (action === 'status') {
      const listings = await fetchAllListings(supabase, 'id, address, city, state, vendor_id');
      const groups = groupByAddress(listings);

      let totalGroups = 0;
      let sameVendorGroups = 0;
      let diffVendorGroups = 0;

      for (const [, group] of Object.entries(groups)) {
        if (group.length < 2) continue;
        totalGroups++;
        const nonNull = group.filter((l: Record<string, unknown>) => l.vendor_id != null);
        const uniqueVendors = [...new Set(nonNull.map((l: Record<string, unknown>) => l.vendor_id))];
        if (uniqueVendors.length <= 1) sameVendorGroups++;
        else diffVendorGroups++;
      }

      const { count: processedCount } = await supabase
        .from('dedup_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      return json({
        total_listings: listings.length,
        duplicate_groups: totalGroups,
        same_vendor_groups: sameVendorGroups,
        diff_vendor_groups: diffVendorGroups,
        already_processed: processedCount ?? 0,
      });
    }

    // ── START ──
    if (action === 'start') {
      const scope: string = body.scope ?? 'all'; // 'same_vendor' or 'all'

      const allListings = await fetchAllListings(supabase, 'id, name, address, city, state, vendor_id');
      const groups = groupByAddress(allListings);

      // Filter to duplicate groups only
      const dupGroups = Object.entries(groups)
        .filter(([, group]) => group.length >= 2)
        .map(([key, group]) => {
          const vendorIds = group.map((l: Record<string, unknown>) => l.vendor_id).filter(Boolean);
          const uniqueVendors = [...new Set(vendorIds)];
          const sameVendor = uniqueVendors.length <= 1;
          return { key, group, sameVendor };
        });

      // Apply scope filter
      const filtered = scope === 'same_vendor'
        ? dupGroups.filter((g) => g.sameVendor)
        : dupGroups;

      if (filtered.length === 0) {
        return json({ error: 'No duplicate groups found for this scope' }, 404);
      }

      // Create job
      const { data: job, error: jobErr } = await supabase
        .from('dedup_jobs')
        .insert({
          status: 'running',
          scope,
          total: filtered.length,
        })
        .select('id')
        .single();

      if (jobErr || !job) return json({ error: jobErr?.message ?? 'Failed to create job' }, 500);

      // Create tasks
      const tasks = filtered.map((g) => ({
        job_id: job.id,
        group_key: g.key,
        listing_ids: g.group.map((l: { id: string }) => l.id),
        listing_names: g.group.map((l: { name: string }) => l.name),
        vendor_ids: g.group.map((l: { vendor_id: number | null }) => l.vendor_id).filter(Boolean),
        same_vendor: g.sameVendor,
        group_size: g.group.length,
      }));

      // Insert in batches (Supabase limit)
      const BATCH_SIZE = 500;
      for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        const batch = tasks.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase
          .from('dedup_tasks')
          .insert(batch);
        if (insertErr) {
          console.error(`Task insert batch error: ${insertErr.message}`);
        }
      }

      // Kick processing
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey;
      // @ts-ignore: Deno edge runtime API
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/dedup-listings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {}),
      );

      return json({ job_id: job.id, total: filtered.length, scope });
    }

    // ── PROCESS_BATCH ──
    if (action === 'process_batch') {
      const jobId: string = body.job_id;
      if (!jobId) return json({ error: 'job_id required' }, 400);

      // Check job status
      const { data: job } = await supabase
        .from('dedup_jobs')
        .select('id, status, total, completed, failed, merged, skipped')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return json({ error: 'Job not found' }, 404);
      if (job.status === 'completed' || job.status === 'failed') {
        return json({ done: true, status: job.status });
      }

      // Claim one pending task
      const { data: pendingTasks } = await supabase
        .from('dedup_tasks')
        .select('*')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('id')
        .limit(1);

      const task = pendingTasks?.[0];
      if (!task) {
        // Check if truly done
        const { count: inProgress } = await supabase
          .from('dedup_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('status', 'in_progress');

        if ((inProgress ?? 0) > 0) {
          return json({ done: false, waiting: true });
        }

        // All done
        await supabase
          .from('dedup_jobs')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return json({ done: true });
      }

      // Mark in progress
      await supabase
        .from('dedup_tasks')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', task.id);

      let taskSuccess = false;
      let decision: 'merge' | 'skip' = 'skip';
      let reasoning = '';
      let confidence = 'low';
      let survivorId: string | null = null;
      let duplicateIds: string[] = [];
      let fieldsMerged: string[] = [];
      let childRecordsMoved = 0;
      let errorMsg = '';

      try {
        // Fetch full listing data for all listings in the group
        const { data: listings } = await supabase
          .from('listings')
          .select('*')
          .in('id', task.listing_ids);

        if (!listings || listings.length < 2) {
          // Group no longer has duplicates (already deleted?)
          decision = 'skip';
          reasoning = 'Group has fewer than 2 listings (already resolved)';
          confidence = 'high';
          taskSuccess = true;
        } else {
          // Get vendor names for AI context
          const vendorIds = [...new Set(listings.map((l) => l.vendor_id).filter(Boolean))];
          let vendorMap: Record<number, string> = {};
          if (vendorIds.length > 0) {
            const { data: vendors } = await supabase
              .from('vendors')
              .select('id, canonical_name')
              .in('id', vendorIds);
            if (vendors) {
              vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.canonical_name]));
            }
          }

          // Add vendor names to listings
          const enrichedListings = listings.map((l) => ({
            ...l,
            vendor_name: l.vendor_id ? vendorMap[l.vendor_id] ?? null : null,
          }));

          // Get AI decision
          const anthropicKey =
            Deno.env.get('ANTHROPIC_API_KEY') ??
            (await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY'));

          if (!anthropicKey) {
            throw new Error('ANTHROPIC_API_KEY not configured');
          }

          const aiResult = await aiDecide(enrichedListings, task.same_vendor, anthropicKey);
          decision = aiResult.decision;
          reasoning = aiResult.reasoning;
          confidence = aiResult.confidence;

          if (decision === 'merge') {
            // Score listings and pick survivor
            const scored = enrichedListings
              .map((l) => ({ ...l, _score: scoreListing(l) }))
              .sort((a, b) => b._score - a._score);

            const survivor = scored[0];
            const dupes = scored.slice(1);

            survivorId = survivor.id;
            duplicateIds = dupes.map((d) => d.id);

            // Execute merge
            const result = await executeMerge(supabase, survivor, dupes);
            fieldsMerged = result.fieldsMerged;
            childRecordsMoved = result.childRecordsMoved;

            console.log(
              `[dedup] MERGED: "${survivor.name}" survived, ${dupes.length} duplicate(s) removed at ${task.group_key}. ${fieldsMerged.length} fields merged, ${childRecordsMoved} child records moved.`,
            );
          } else {
            console.log(
              `[dedup] SKIPPED: ${task.group_key} (${task.listing_names?.join(', ')}): ${reasoning}`,
            );
          }

          taskSuccess = true;
        }
      } catch (err) {
        errorMsg = String(err).slice(0, 500);
        console.error(`[dedup] Task ${task.id} error: ${errorMsg}`);
      }

      // Update task
      await supabase
        .from('dedup_tasks')
        .update({
          status: taskSuccess ? 'completed' : 'failed',
          decision,
          ai_reasoning: reasoning,
          confidence,
          survivor_id: survivorId,
          duplicate_ids: duplicateIds.length > 0 ? duplicateIds : null,
          fields_merged: fieldsMerged.length > 0 ? fieldsMerged : null,
          child_records_moved: childRecordsMoved,
          error: errorMsg || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      // Update job counters
      const isMerge = taskSuccess && decision === 'merge';
      const isSkip = taskSuccess && decision === 'skip';
      await supabase
        .from('dedup_jobs')
        .update({
          completed: (job.completed ?? 0) + (taskSuccess ? 1 : 0),
          failed: (job.failed ?? 0) + (taskSuccess ? 0 : 1),
          merged: (job.merged ?? 0) + (isMerge ? 1 : 0),
          skipped: (job.skipped ?? 0) + (isSkip ? 1 : 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Self-chain
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey;
      // @ts-ignore: Deno edge runtime API
      EdgeRuntime.waitUntil(
        new Promise((r) => setTimeout(r, 300)).then(() =>
          fetch(`${supabaseUrl}/functions/v1/dedup-listings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ action: 'process_batch', job_id: jobId }),
          }).catch(() => {}),
        ),
      );

      return json({
        task_id: task.id,
        decision,
        reasoning,
        survivor_id: survivorId,
        duplicates_removed: duplicateIds.length,
        fields_merged: fieldsMerged,
        child_records_moved: childRecordsMoved,
        success: taskSuccess,
        error: errorMsg || null,
      });
    }

    // ── JOB_STATUS ──
    if (action === 'job_status') {
      const jobId: string = body.job_id;
      if (!jobId) return json({ error: 'job_id required' }, 400);

      const { data: job } = await supabase
        .from('dedup_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return json({ error: 'Job not found' }, 404);
      return json(job);
    }

    // ── RESULTS ──
    if (action === 'results') {
      const jobId: string = body.job_id;
      const limit: number = body.limit ?? 50;
      const offset: number = body.offset ?? 0;

      let query = supabase
        .from('dedup_tasks')
        .select('id, group_key, listing_names, same_vendor, group_size, decision, ai_reasoning, confidence, survivor_id, duplicate_ids, fields_merged, child_records_moved, error, status')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (jobId) query = query.eq('job_id', jobId);

      const { data: tasks, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ tasks: tasks ?? [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[dedup-listings] Fatal error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
