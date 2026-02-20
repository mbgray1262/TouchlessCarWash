import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 20;
const BATCHES_PER_CHUNK = 50;

interface VendorInput {
  id: number;
  canonical_name: string;
  domain: string;
  sample_names: string[];
}

async function getAnthropicKey(supabaseUrl: string, supabaseKey: string): Promise<string | null> {
  const envKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (envKey) return envKey;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ secret_name: "ANTHROPIC_API_KEY" }),
  });
  if (!res.ok) return null;
  const val = await res.json();
  return typeof val === "string" ? val : null;
}

async function cleanBatch(vendors: VendorInput[], anthropicKey: string): Promise<Map<number, string>> {
  const lines = vendors.map((v) => {
    const samples = v.sample_names.slice(0, 5).join(", ") || "none";
    return `id=${v.id} domain="${v.domain}" current_name="${v.canonical_name}" sample_listing_names=[${samples}]`;
  });

  const prompt = `You are a data cleanup assistant for a car wash business directory. I will give you a list of car wash vendors with their domain, current name, and sample listing names from that domain.

For each vendor, return the correct canonical business name — the real, official name of the brand/company. Follow these rules:
- Use the most recognizable official brand name (e.g. "Shell" not "Find Shell", "Chevron" not "Chevronwithtechron")
- Use proper casing and spacing (e.g. "Dollar General" not "Dollargeneral")
- If the current name is already correct, return it unchanged
- Do NOT include domain extensions, URLs, or marketing slogans
- Do NOT include "Car Wash" unless it is truly part of the brand name

Vendors:
${lines.join("\n")}

Respond with a JSON array only, no explanation. Each element: {"id": <number>, "name": "<correct name>"}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 529 || res.status === 503) continue;
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in Claude response");

    const parsed: Array<{ id: number; name: string }> = JSON.parse(jsonMatch[0]);
    const map = new Map<number, string>();
    for (const item of parsed) {
      if (item.id && item.name) map.set(item.id, item.name.trim());
    }
    return map;
  }

  return new Map();
}

async function fetchVendorChunk(
  supabase: ReturnType<typeof createClient>,
  offset: number,
  limit: number
): Promise<Array<{ id: number; canonical_name: string; domain: string }>> {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, canonical_name, domain")
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchSampleNamesForChunk(
  supabase: ReturnType<typeof createClient>,
  vendorIds: number[]
): Promise<Map<number, string[]>> {
  const PAGE = 5000;
  const map = new Map<number, string[]>();
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("listings")
      .select("vendor_id, name")
      .in("vendor_id", vendorIds)
      .not("name", "is", null)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ vendor_id: number; name: string }>) {
      const arr = map.get(row.vendor_id) ?? [];
      if (arr.length < 8) { arr.push(row.name); map.set(row.vendor_id, arr); }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function countVendors(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { count, error } = await supabase.from("vendors").select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function runChunk(jobId: string, supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  async function updateJob(fields: Record<string, unknown>) {
    await supabase.from("vendor_clean_jobs").update(fields).eq("id", jobId);
  }

  try {
    const { data: job, error: jErr } = await supabase
      .from("vendor_clean_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (jErr || !job) throw new Error("Job not found");

    const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);
    if (!anthropicKey) throw new Error("Anthropic API key not configured");

    const total = job.total > 0 ? job.total : await countVendors(supabase);
    const totalBatches = Math.ceil(total / BATCH_SIZE);
    const offset: number = job.resume_offset ?? 0;

    await updateJob({
      status: "running",
      total,
      total_batches: totalBatches,
      started_at: job.started_at ?? new Date().toISOString(),
    });

    const chunkVendorLimit = BATCHES_PER_CHUNK * BATCH_SIZE;
    const vendors = await fetchVendorChunk(supabase, offset, chunkVendorLimit);

    if (vendors.length === 0) {
      await updateJob({
        status: "done",
        processed: total,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const sampleMap = await fetchSampleNamesForChunk(supabase, vendors.map((v) => v.id));

    const vendorInputs: VendorInput[] = vendors.map((v) => ({
      id: v.id,
      canonical_name: v.canonical_name,
      domain: v.domain ?? "",
      sample_names: sampleMap.get(v.id) ?? [],
    }));

    let processed = job.processed ?? 0;
    let changed = job.changed ?? 0;
    const startBatch = Math.floor(offset / BATCH_SIZE);

    for (let i = 0; i < vendorInputs.length; i += BATCH_SIZE) {
      const batch = vendorInputs.slice(i, i + BATCH_SIZE);
      const batchNum = startBatch + Math.floor(i / BATCH_SIZE) + 1;

      await updateJob({ current_batch: batchNum });

      try {
        const nameMap = await cleanBatch(batch, anthropicKey);
        for (const vendor of batch) {
          const newName = nameMap.get(vendor.id);
          if (!newName) continue;
          if (newName !== vendor.canonical_name) {
            changed++;
            await supabase.from("vendors").update({ canonical_name: newName }).eq("id", vendor.id);
          }
        }
      } catch (err) {
        console.error(`Batch ${batchNum} error:`, err);
      }

      processed += batch.length;
      await updateJob({ processed, changed });
      await new Promise(r => setTimeout(r, 150));
    }

    const nextOffset = offset + vendors.length;
    const isComplete = nextOffset >= total;

    if (isComplete) {
      await updateJob({
        status: "done",
        processed: total,
        changed,
        resume_offset: nextOffset,
        completed_at: new Date().toISOString(),
      });
    } else {
      await updateJob({
        status: "paused",
        processed,
        changed,
        resume_offset: nextOffset,
      });
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateJob({ status: "failed", error: msg, completed_at: new Date().toISOString() });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.has("job_id")) {
    const jobId = url.searchParams.get("job_id")!;
    const { data, error } = await supabase
      .from("vendor_clean_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const resumeJobId: string | null = body?.resume_job_id ?? null;

  if (resumeJobId) {
    EdgeRuntime.waitUntil(runChunk(resumeJobId, supabaseUrl, supabaseKey));
    return new Response(JSON.stringify({ job_id: resumeJobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error: createErr } = await supabase
    .from("vendor_clean_jobs")
    .insert({ status: "pending", resume_offset: 0 })
    .select("id")
    .single();

  if (createErr || !job) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create job" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  EdgeRuntime.waitUntil(runChunk(job.id, supabaseUrl, supabaseKey));

  return new Response(JSON.stringify({ job_id: job.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
