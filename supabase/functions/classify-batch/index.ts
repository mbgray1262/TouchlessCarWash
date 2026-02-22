import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 10;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function fetchWebsite(url: string): Promise<{ text: string; ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CarWashDirectory/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { text: "", ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { text: stripHtml(html), ok: true };
  } catch (e) {
    clearTimeout(timeout);
    return { text: "", ok: false, error: (e as Error).message };
  }
}

const SYSTEM_PROMPT = `You are classifying car wash businesses. Based on the website text provided, determine if this car wash offers TOUCHLESS (also called "touch-free" or "contactless") washing.

A touchless car wash uses only high-pressure water and chemicals — no brushes, cloth, or friction materials contact the vehicle.

CLASSIFY AS TOUCHLESS (is_touchless: true):
- Website explicitly mentions "touchless", "touch-free", "touch free", "contactless", "no-touch", "brushless", or "laser wash"
- Self-service car washes (wand/spray washes are touchless by definition)
- Washes that offer BOTH touchless and friction/soft-touch options (hybrid facilities)

CLASSIFY AS NOT TOUCHLESS (is_touchless: false) — THIS IS THE DEFAULT:
- Website describes wash packages, tunnel washes, express washes, or specific wash chemicals (triple foam, wheel cleaner, tire shine, ceramic coating, etc.) WITHOUT mentioning touchless/touch-free/contactless
- Website mentions soft-touch, friction, brush, foam brush, cloth, or conveyor wash
- Website has enough content about their wash services but no touchless language
- Businesses that are clearly not car washes (detail shops only, auto repair, etc.)

ONLY classify as UNKNOWN (is_touchless: null) when:
- The website has almost no content at all (just an address, phone number, and maybe a logo — no description of services)
- The page failed to load meaningful content

The overwhelming majority of car washes are friction/soft-touch. Do NOT default to unknown just because touchless isn't mentioned — if they describe their wash services without using touchless language, classify as NOT touchless.

Respond in this exact JSON format:
{"is_touchless": true/false/null, "evidence": "Brief 1-2 sentence explanation of what you found", "amenities": ["list", "of", "amenities", "mentioned"]}

For amenities, extract any of these if mentioned: free vacuum, unlimited wash club, membership program, self-serve bays, RV or oversized vehicle washing, interior cleaning, detailing, ceramic coating, wax, undercarriage wash, tire shine, air freshener, mat cleaner, dog wash.`;

async function classifyWithClaude(text: string, apiKey: string): Promise<{ is_touchless: boolean | null; evidence: string; amenities: string[] }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${raw}`);
  return JSON.parse(jsonMatch[0]);
}

async function classifyOne(
  supabase: ReturnType<typeof createClient>,
  listing: { id: string; name: string; website: string },
  apiKey: string,
): Promise<"touchless" | "not_touchless" | "unknown" | "fetch_failed" | "classify_failed"> {
  const fetched = await fetchWebsite(listing.website);

  if (!fetched.ok || fetched.text.length < 50) {
    await supabase.from("listings").update({
      crawl_status: "fetch_failed",
      last_crawled_at: new Date().toISOString(),
    }).eq("id", listing.id);
    return "fetch_failed";
  }

  let classification: { is_touchless: boolean | null; evidence: string; amenities: string[] };
  try {
    classification = await classifyWithClaude(fetched.text, apiKey);
  } catch (e) {
    await supabase.from("listings").update({
      crawl_status: "classify_failed",
      touchless_evidence: (e as Error).message.slice(0, 500),
      last_crawled_at: new Date().toISOString(),
    }).eq("id", listing.id);
    return "classify_failed";
  }

  const is_touchless = classification.is_touchless === true
    ? true
    : classification.is_touchless === false
      ? false
      : null;

  const crawl_status = is_touchless === null ? "unknown" : "classified";

  const updatePayload: Record<string, unknown> = {
    is_touchless,
    crawl_status,
    touchless_evidence: classification.evidence ?? "",
    last_crawled_at: new Date().toISOString(),
  };

  if (classification.amenities && classification.amenities.length > 0) {
    updatePayload.amenities = classification.amenities;
  }

  await supabase.from("listings").update(updatePayload).eq("id", listing.id);

  if (is_touchless === true) return "touchless";
  if (is_touchless === false) return "not_touchless";
  return "unknown";
}

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  concurrency: number,
  apiKey: string,
  selfUrl: string,
  anonKey: string,
): Promise<void> {
  const { data: jobCheck } = await supabase
    .from("pipeline_jobs")
    .select("status, offset, never_attempted_only")
    .eq("id", jobId)
    .single();

  if (!jobCheck || jobCheck.status !== "running") return;

  const offset = jobCheck.offset ?? 0;
  const neverAttemptedOnly: boolean = jobCheck.never_attempted_only ?? false;

  let query = supabase
    .from("listings")
    .select("id, name, website")
    .is("is_touchless", null)
    .not("website", "is", null)
    .neq("website", "")
    .order("state", { ascending: true })
    .order("city", { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (neverAttemptedOnly) {
    query = query.is("crawl_status", null);
  }

  const { data: listings } = await query;

  if (!listings || listings.length === 0) {
    await supabase.from("pipeline_jobs").update({
      status: "done",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return;
  }

  const results = await Promise.all(
    listings.map(l => classifyOne(supabase, l as { id: string; name: string; website: string }, apiKey))
  );

  let touchless = 0, not_touchless = 0, unknown = 0, failed = 0;
  for (const r of results) {
    if (r === "touchless") touchless++;
    else if (r === "not_touchless") not_touchless++;
    else if (r === "unknown") unknown++;
    else failed++;
  }

  const newOffset = offset + listings.length;

  await supabase.rpc("increment_pipeline_job_counts", {
    p_job_id: jobId,
    p_processed: results.length,
    p_touchless: touchless,
    p_not_touchless: not_touchless,
    p_unknown: unknown,
    p_failed: failed,
    p_offset: newOffset,
  });

  const { data: afterCheck } = await supabase
    .from("pipeline_jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (!afterCheck || afterCheck.status !== "running") return;

  EdgeRuntime.waitUntil(
    fetch(`${selfUrl}/functions/v1/classify-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action: "tick", job_id: jobId, concurrency }),
    }).catch(() => {})
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "start") {
      const concurrency: number = body.concurrency ?? 3;
      const neverAttemptedOnly: boolean = body.never_attempted_only === true;

      const { data: existing } = await supabase
        .from("pipeline_jobs")
        .select("id, status")
        .in("status", ["queued", "running"])
        .maybeSingle();

      if (existing) {
        return Response.json({ error: "A job is already running", job_id: existing.id }, { status: 409, headers: corsHeaders });
      }

      let countQuery = supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .is("is_touchless", null)
        .not("website", "is", null)
        .neq("website", "");

      if (neverAttemptedOnly) {
        countQuery = countQuery.is("crawl_status", null);
      }

      const { count: totalQueue } = await countQuery;

      const { data: job, error: jobErr } = await supabase
        .from("pipeline_jobs")
        .insert({
          status: "running",
          concurrency,
          total_queue: totalQueue ?? 0,
          offset: 0,
          never_attempted_only: neverAttemptedOnly,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (jobErr) {
        return Response.json({ error: jobErr.message }, { status: 500, headers: corsHeaders });
      }

      EdgeRuntime.waitUntil(processBatch(supabase, job.id, concurrency, anthropicKey, supabaseUrl, anonKey));

      return Response.json({ job_id: job.id, status: "started" }, { headers: corsHeaders });
    }

    if (action === "tick") {
      const { job_id, concurrency = 3 } = body;
      if (!job_id) return Response.json({ error: "job_id required" }, { status: 400, headers: corsHeaders });

      EdgeRuntime.waitUntil(processBatch(supabase, job_id, concurrency, anthropicKey, supabaseUrl, anonKey));

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "pause") {
      const { job_id } = body;
      await supabase.from("pipeline_jobs")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", job_id)
        .eq("status", "running");
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "resume") {
      const { job_id } = body;
      const { data: job } = await supabase
        .from("pipeline_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("status", "paused")
        .maybeSingle();

      if (!job) {
        return Response.json({ error: "Job not found or not paused" }, { status: 404, headers: corsHeaders });
      }

      await supabase.from("pipeline_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", job_id);

      EdgeRuntime.waitUntil(processBatch(supabase, job.id, job.concurrency, anthropicKey, supabaseUrl, anonKey));

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "kick") {
      const { job_id } = body;
      if (!job_id) return Response.json({ error: "job_id required" }, { status: 400, headers: corsHeaders });

      const { data: job } = await supabase
        .from("pipeline_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("status", "running")
        .maybeSingle();

      if (!job) {
        return Response.json({ error: "Job not found or not in running state" }, { status: 404, headers: corsHeaders });
      }

      EdgeRuntime.waitUntil(processBatch(supabase, job.id, job.concurrency, anthropicKey, supabaseUrl, anonKey));

      return Response.json({ ok: true, message: "Processing loop restarted" }, { headers: corsHeaders });
    }

    if (action === "status") {
      const { data: job } = await supabase
        .from("pipeline_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({ job: job ?? null }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
