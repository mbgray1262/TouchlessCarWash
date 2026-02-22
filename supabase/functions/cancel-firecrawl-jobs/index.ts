import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return Response.json({ error: "FIRECRAWL_API_KEY not configured" }, { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: runningBatches } = await supabase
      .from("pipeline_batches")
      .select("id, firecrawl_job_id")
      .eq("status", "running");

    const results = [];
    for (const batch of (runningBatches ?? [])) {
      const cancelRes = await fetch(
        `https://api.firecrawl.dev/v1/batch/scrape/${batch.firecrawl_job_id}`,
        {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${firecrawlKey}` },
        }
      );
      const cancelBody = await cancelRes.json().catch(() => ({}));
      await supabase
        .from("pipeline_batches")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", batch.id);

      results.push({
        firecrawl_job_id: batch.firecrawl_job_id,
        cancel_status: cancelRes.status,
        cancel_response: cancelBody,
      });
    }

    return Response.json({ cancelled: results }, { status: 200, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
