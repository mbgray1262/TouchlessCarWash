import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BulkCrawlRequest {
  listingIds: string[];
  delayMs?: number;
}

function extractPhotosFromFirecrawl(firecrawlData: Record<string, unknown>): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();

  const isValidPhoto = (url: string): boolean => {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("data:")) return false;
    if (!url.startsWith("http")) return false;
    const lower = url.toLowerCase();
    if (lower.includes("favicon") || lower.includes(".gif")) return false;
    if (lower.includes("recaptcha") || lower.includes("gravatar")) return false;
    return true;
  };

  const data = firecrawlData.data as Record<string, unknown> | undefined;
  if (!data) return photos;

  if (Array.isArray(data.images)) {
    for (const url of data.images as string[]) {
      if (isValidPhoto(url) && !seen.has(url)) {
        seen.add(url);
        photos.push(url);
      }
    }
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    for (const field of ["ogImage", "og:image", "twitterImage", "twitter:image", "og:image:url"]) {
      const val = metadata[field];
      if (typeof val === "string" && isValidPhoto(val) && !seen.has(val)) {
        seen.add(val);
        photos.push(val);
      } else if (Array.isArray(val)) {
        for (const v of val as string[]) {
          if (isValidPhoto(v) && !seen.has(v)) { seen.add(v); photos.push(v); }
        }
      }
    }
  }

  return photos.slice(0, 30);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { listingIds, delayMs = 1000 }: BulkCrawlRequest = await req.json();

    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "listingIds array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listings, error: fetchError } = await supabase
      .from("listings")
      .select("id, name, website")
      .in("id", listingIds);

    if (fetchError || !listings) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      id: string;
      name: string;
      status: "crawled" | "crawl_failed" | "no_website";
      photos_found: number;
      error?: string;
    }> = [];

    for (const listing of listings) {
      if (!listing.website) {
        await supabase.from("listings").update({
          crawl_status: "no_website",
          verification_status: "crawl_failed",
          crawl_notes: "No website available",
          last_crawled_at: new Date().toISOString(),
        }).eq("id", listing.id);

        results.push({ id: listing.id, name: listing.name, status: "no_website", photos_found: 0 });
        continue;
      }

      try {
        const firecrawlRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: listing.website,
            formats: ["markdown", "images"],
            onlyMainContent: false,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!firecrawlRes.ok) {
          const errText = await firecrawlRes.text().catch(() => "unknown");
          throw new Error(`Firecrawl ${firecrawlRes.status}: ${errText.slice(0, 200)}`);
        }

        const firecrawlData = await firecrawlRes.json();
        const photos = extractPhotosFromFirecrawl(firecrawlData);

        await supabase.from("listings").update({
          crawl_status: "crawled",
          verification_status: "crawled",
          crawl_snapshot: firecrawlData,
          last_crawled_at: new Date().toISOString(),
          crawl_notes: null,
        }).eq("id", listing.id);

        results.push({ id: listing.id, name: listing.name, status: "crawled", photos_found: photos.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("listings").update({
          crawl_status: "failed",
          verification_status: "crawl_failed",
          crawl_notes: msg.slice(0, 500),
          last_crawled_at: new Date().toISOString(),
        }).eq("id", listing.id);

        results.push({ id: listing.id, name: listing.name, status: "crawl_failed", photos_found: 0, error: msg.slice(0, 200) });
      }

      if (delayMs > 0 && listing !== listings[listings.length - 1]) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    const summary = {
      total: results.length,
      crawled: results.filter(r => r.status === "crawled").length,
      failed: results.filter(r => r.status === "crawl_failed").length,
      no_website: results.filter(r => r.status === "no_website").length,
    };

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
