import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CrawlRequest {
  url: string;
  maxDepth?: number;
  limit?: number;
  includePaths?: string[];
  excludePaths?: string[];
  extractSchema?: Record<string, any>;
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
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!firecrawlApiKey) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { url, maxDepth = 3, limit = 100, includePaths, excludePaths, extractSchema }: CrawlRequest = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const scrapeOptions: Record<string, unknown> = {
      formats: ["markdown", "html"],
      onlyMainContent: true,
    };

    if (extractSchema) {
      scrapeOptions.formats = [
        ...scrapeOptions.formats as string[],
        { type: "json", schema: extractSchema },
      ];
    }

    const crawlConfig = {
      maxDiscoveryDepth: maxDepth,
      limit,
      includePaths,
      excludePaths,
      scrapeOptions,
    };

    const webhookUrl = `${supabaseUrl}/functions/v1/crawl-webhook`;

    const firecrawlResponse = await fetch("https://api.firecrawl.dev/v2/crawl", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        ...crawlConfig,
        webhook: {
          url: webhookUrl,
          events: ["crawl.page", "crawl.completed", "crawl.failed"],
        },
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      throw new Error(`Firecrawl API error: ${errorText}`);
    }

    const firecrawlData = await firecrawlResponse.json();

    const { data: crawlJob, error: dbError } = await supabase
      .from("crawl_jobs")
      .insert({
        job_id: firecrawlData.id,
        url,
        status: "running",
        crawl_config: crawlConfig,
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: firecrawlData.id,
        crawlJob,
        message: "Crawl started successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error starting crawl:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to start crawl"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
