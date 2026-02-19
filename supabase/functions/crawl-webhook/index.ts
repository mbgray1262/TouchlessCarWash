import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FirecrawlWebhookPayload {
  success: boolean;
  type: string;
  id: string;
  data?: Array<{
    markdown?: string;
    html?: string;
    url?: string;
    metadata?: Record<string, any>;
    json?: Record<string, any>;
  }>;
  metadata?: Record<string, any>;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: FirecrawlWebhookPayload = await req.json();

    console.log("Received Firecrawl webhook:", JSON.stringify(payload, null, 2));

    const { id: jobId, success, type, data, error: crawlError } = payload;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing job ID in webhook payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isCompleted = type === "crawl.completed";
    const isFailed = type === "crawl.failed" || !success;
    const isPage = type === "crawl.page";

    const updateData: any = {
      status: isCompleted ? "completed" : isFailed ? "failed" : "running",
      updated_at: new Date().toISOString(),
    };

    if (isPage && data && data.length > 0) {
      const { data: existing } = await supabase
        .from("crawl_jobs")
        .select("results, results_count")
        .eq("job_id", jobId)
        .maybeSingle();

      const existingResults = existing?.results || [];
      updateData.results = [...existingResults, ...data];
      updateData.results_count = (existing?.results_count || 0) + data.length;
    }

    if (isCompleted || isFailed) {
      updateData.completed_at = new Date().toISOString();
    }

    if (crawlError) {
      updateData.error_message = crawlError;
    }

    const { error: updateError } = await supabase
      .from("crawl_jobs")
      .update(updateData)
      .eq("job_id", jobId);

    if (updateError) {
      console.error("Database update error:", updateError);
      throw new Error(`Failed to update crawl job: ${updateError.message}`);
    }

    if (isCompleted) {
      const { data: job } = await supabase
        .from("crawl_jobs")
        .select("results")
        .eq("job_id", jobId)
        .maybeSingle();

      const allResults = job?.results || [];
      if (allResults.length > 0) {
        console.log(`Crawl completed successfully: ${allResults.length} pages scraped`);
        await processScrapedData(supabase, jobId, allResults);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook processed successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process webhook"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processScrapedData(
  supabase: any,
  jobId: string,
  data: Array<any>
): Promise<void> {
  try {
    const carWashes: Array<any> = [];

    for (const page of data) {
      if (page.json || page.extract) {
        const extracted = page.json || page.extract;

        if (extracted.name && extracted.address) {
          const slug = extracted.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

          const carWash = {
            name: extracted.name,
            slug: `${slug}-${Date.now()}`,
            address: extracted.address,
            city: extracted.city || "",
            state: extracted.state || "",
            zip: extracted.zip || "",
            phone: extracted.phone || null,
            website: page.url || extracted.website || null,
            hours: extracted.hours || {},
            wash_packages: extracted.packages || [],
            amenities: extracted.amenities || [],
            latitude: extracted.latitude || null,
            longitude: extracted.longitude || null,
            is_approved: false,
            is_featured: false,
          };

          carWashes.push(carWash);
        }
      }
    }

    if (carWashes.length > 0) {
      const { error: insertError } = await supabase
        .from("submissions")
        .insert(
          carWashes.map(wash => ({
            business_name: wash.name,
            address: wash.address,
            city: wash.city,
            state: wash.state,
            zip: wash.zip,
            phone: wash.phone,
            website: wash.website,
            hours: JSON.stringify(wash.hours),
            wash_packages: JSON.stringify(wash.wash_packages),
            amenities: JSON.stringify(wash.amenities),
            status: "pending",
          }))
        );

      if (insertError) {
        console.error("Error inserting scraped data:", insertError);
      } else {
        console.log(`Successfully created ${carWashes.length} submissions from scraped data`);
      }
    }
  } catch (error) {
    console.error("Error processing scraped data:", error);
  }
}
