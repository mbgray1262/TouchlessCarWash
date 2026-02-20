import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

interface VendorInput {
  id: number;
  canonical_name: string;
  domain: string;
  sample_names: string[];
}

async function cleanBatch(
  vendors: VendorInput[],
  anthropicKey: string
): Promise<Map<number, string>> {
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

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

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

    if (res.status === 529 || res.status === 529) {
      lastErr = new Error(`Anthropic overloaded (${res.status})`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

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

  throw lastErr ?? new Error("Failed after retries");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const vendorIds: number[] | null = body.vendor_ids ?? null;
  const BATCH = 20;

  let query = supabase.from("vendors").select("id, canonical_name, domain");
  if (vendorIds && vendorIds.length > 0) query = query.in("id", vendorIds);
  const { data: vendors, error: vErr } = await query.order("id");

  if (vErr || !vendors) {
    return new Response(JSON.stringify({ error: vErr?.message ?? "Failed to fetch vendors" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: listingRows } = await supabase
    .from("listings")
    .select("vendor_id, name")
    .in("vendor_id", vendors.map((v: { id: number }) => v.id))
    .not("name", "is", null);

  const sampleMap = new Map<number, string[]>();
  for (const row of (listingRows ?? []) as Array<{ vendor_id: number; name: string }>) {
    const arr = sampleMap.get(row.vendor_id) ?? [];
    if (arr.length < 8) arr.push(row.name);
    sampleMap.set(row.vendor_id, arr);
  }

  const vendorInputs: VendorInput[] = vendors.map((v: { id: number; canonical_name: string; domain: string }) => ({
    id: v.id,
    canonical_name: v.canonical_name,
    domain: v.domain ?? "",
    sample_names: sampleMap.get(v.id) ?? [],
  }));

  const total = vendorInputs.length;
  const totalBatches = Math.ceil(total / BATCH);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      function send(event: string, data: unknown) {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      send("start", { total, batches: totalBatches });

      let processed = 0;
      let changed = 0;

      for (let i = 0; i < vendorInputs.length; i += BATCH) {
        const batch = vendorInputs.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;

        try {
          const nameMap = await cleanBatch(batch, anthropicKey);

          const updates: Array<{ id: number; old_name: string; new_name: string; changed: boolean }> = [];

          for (const vendor of batch) {
            const newName = nameMap.get(vendor.id);
            if (!newName) continue;
            const wasChanged = newName !== vendor.canonical_name;
            updates.push({ id: vendor.id, old_name: vendor.canonical_name, new_name: newName, changed: wasChanged });
            if (wasChanged) {
              changed++;
              await supabase
                .from("vendors")
                .update({ canonical_name: newName })
                .eq("id", vendor.id);
            }
          }

          processed += batch.length;
          send("progress", {
            batch: batchNum,
            total_batches: totalBatches,
            processed,
            total,
            changed,
            updates,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          send("batch_error", { batch: batchNum, error: msg });
          processed += batch.length;
        }

        await new Promise(r => setTimeout(r, 200));
      }

      send("done", { total, changed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
