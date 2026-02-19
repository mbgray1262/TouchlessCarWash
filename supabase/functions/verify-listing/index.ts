import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function rehostPhotos(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  photoUrls: string[]
): Promise<string[]> {
  const rehosted: string[] = [];
  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
      });
      if (!res.ok) { rehosted.push(url); continue; }
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const baseType = contentType.split(";")[0].trim();
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(baseType)) { rehosted.push(url); continue; }
      const ext = baseType === "image/png" ? "png" : baseType === "image/webp" ? "webp" : "jpg";
      const buffer = await res.arrayBuffer();
      const storagePath = `${listingId}/${i}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("listing-photos")
        .upload(storagePath, new Uint8Array(buffer), { contentType: baseType, upsert: true });
      if (uploadError) { rehosted.push(url); continue; }
      const { data: pub } = supabase.storage.from("listing-photos").getPublicUrl(storagePath);
      rehosted.push(pub.publicUrl);
    } catch {
      rehosted.push(url);
    }
  }
  return rehosted;
}

interface VerifyRequest {
  listingId: string;
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

  const addPhoto = (url: string) => {
    if (!isValidPhoto(url) || seen.has(url)) return;
    seen.add(url);
    photos.push(url);
  };

  const data = firecrawlData.data as Record<string, unknown> | undefined;
  if (!data) return photos;

  // Primary: Firecrawl "images" format returns all img src URLs from the page
  if (Array.isArray(data.images)) {
    (data.images as string[]).forEach(url => addPhoto(url));
  }

  // Fallback: og:image / twitter:image from metadata
  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    const ogImageFields = ["ogImage", "og:image", "twitterImage", "twitter:image", "og:image:url"];
    for (const field of ogImageFields) {
      const val = metadata[field];
      if (typeof val === "string") addPhoto(val);
      else if (Array.isArray(val)) (val as string[]).forEach(v => addPhoto(v));
    }
  }

  return photos.slice(0, 30);
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
    const { listingId }: VerifyRequest = await req.json();

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: "listingId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (fetchError || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!listing.website) {
      await supabase
        .from("listings")
        .update({
          crawl_status: "no_website",
          crawl_notes: "No website available for verification",
        })
        .eq("id", listingId);

      return new Response(
        JSON.stringify({ error: "Listing has no website" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const firecrawlResponse = await fetch("https://api.firecrawl.dev/v2/scrape", {
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
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      let errorData;

      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      const errorMessage = errorData.error || errorText;
      const isBlockedSite = errorMessage.includes("do not support this site");
      const isTimeout = errorMessage.includes("timed out") || errorMessage.includes("TIMEOUT");

      let notes = "";
      if (isBlockedSite) {
        notes = "Site blocked by Firecrawl (may be social media or restricted domain). Manual verification needed.";
      } else if (isTimeout) {
        notes = "Website took too long to load. Manual verification needed.";
      } else {
        notes = `Firecrawl error: ${errorMessage.substring(0, 500)}`;
      }

      await supabase
        .from("listings")
        .update({
          crawl_status: "failed",
          crawl_notes: notes,
          last_crawled_at: new Date().toISOString(),
        })
        .eq("id", listingId);

      return new Response(
        JSON.stringify({
          success: false,
          error: notes,
          listing: {
            id: listingId,
            name: listing.name,
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    const markdown = firecrawlData.data?.markdown || "";
    const textContent = markdown.toLowerCase();

    const extractedPhotos = extractPhotosFromFirecrawl(firecrawlData);

    // Phrases that unambiguously mean the car wash itself is touchless
    const definitiveTouchlessPhrases = [
      "touchless car wash",
      "touch-less car wash",
      "touchless automatic",
      "touch-less automatic",
      "touchless wash",
      "touch-less wash",
      "no-touch wash",
      "no touch wash",
      "touchless cleaning",
      "touchfree wash",
      "touch free wash",
      "touch free car wash",
      "touchfree car wash",
      "laser wash",
      "brushless wash",
      "brush-less wash",
      "brushless car wash",
      "brush-less car wash",
      "touchless auto wash",
      "touchless automatic wash",
    ];

    // Phrases that contain "touchless" but do NOT mean a touchless car wash
    const falsePositivePhrases = [
      "touchless drying",
      "touchless dryer",
      "touchless payment",
      "touchless pay",
      "touchless entry",
      "touchless exit",
      "touchless faucet",
      "touchless door",
      "touchless sanitizer",
      "touchless dispenser",
      "touchless transaction",
      "touchless checkout",
    ];

    const notTouchlessKeywords = [
      "brush wash",
      "brushes",
      "hand wash",
      "hand-wash",
      "manual wash",
      "foam brush",
    ];

    let touchlessScore = 0;
    let notTouchlessScore = 0;
    const foundKeywords: string[] = [];
    const foundNegativeKeywords: string[] = [];
    const evidenceSnippets: Array<{ keyword: string; snippet: string; type: string }> = [];

    const extractSnippet = (text: string, keyword: string, contextLength: number = 150): string => {
      const lowerText = text.toLowerCase();
      const index = lowerText.indexOf(keyword.toLowerCase());

      if (index === -1) return "";

      const start = Math.max(0, index - contextLength);
      const end = Math.min(text.length, index + keyword.length + contextLength);

      let snippet = text.substring(start, end);

      if (start > 0) snippet = "..." + snippet;
      if (end < text.length) snippet = snippet + "...";

      return snippet.trim();
    };

    // First, remove false positive phrases from the text so they don't pollute scoring
    let scoringText = textContent;
    for (const fp of falsePositivePhrases) {
      scoringText = scoringText.split(fp.toLowerCase()).join("");
    }

    definitiveTouchlessPhrases.forEach((phrase) => {
      const regex = new RegExp(phrase.replace(/[-]/g, "[-\\s]?"), "gi");
      const matches = scoringText.match(regex);
      if (matches) {
        touchlessScore += matches.length;
        if (!foundKeywords.includes(phrase)) {
          foundKeywords.push(phrase);

          const snippet = extractSnippet(markdown, phrase);
          if (snippet) {
            evidenceSnippets.push({
              keyword: phrase,
              snippet,
              type: "touchless"
            });
          }
        }
      }
    });

    notTouchlessKeywords.forEach((keyword) => {
      const regex = new RegExp(keyword, "gi");
      const matches = textContent.match(regex);
      if (matches) {
        notTouchlessScore += matches.length;
        if (!foundNegativeKeywords.includes(keyword)) {
          foundNegativeKeywords.push(keyword);

          const snippet = extractSnippet(markdown, keyword);
          if (snippet) {
            evidenceSnippets.push({
              keyword,
              snippet,
              type: "not_touchless"
            });
          }
        }
      }
    });

    let isTouchless: boolean | null = null;
    let confidence: string = "unknown";
    let notes = "";

    if (touchlessScore >= 1) {
      isTouchless = true;

      if (touchlessScore >= 5) {
        confidence = "high";
      } else if (touchlessScore >= 3) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      if (notTouchlessScore > 0) {
        notes = `Found touchless keywords: ${foundKeywords.join(", ")} (${touchlessScore}x). Also offers: ${foundNegativeKeywords.join(", ")} (${notTouchlessScore}x). Has touchless option available.`;
      } else {
        notes = `Found touchless keywords: ${foundKeywords.join(", ")}. Mentioned ${touchlessScore} time(s).`;
      }
    } else if (notTouchlessScore > 0 && touchlessScore === 0) {
      isTouchless = false;
      confidence = "high";
      notes = `Only found brush/manual wash keywords: ${foundNegativeKeywords.join(", ")} (${notTouchlessScore}x). No touchless indicators.`;
    } else {
      isTouchless = null;
      confidence = "unknown";
      notes = "No clear touchless or brush wash indicators found on website. Manual verification needed.";
    }

    const updatePayload: Record<string, unknown> = {
      is_touchless: isTouchless,
      touchless_confidence: confidence,
      crawl_status: "crawled",
      crawl_notes: notes,
      touchless_evidence: evidenceSnippets.filter(e => e.type === "touchless"),
      crawl_snapshot: firecrawlData,
      last_crawled_at: new Date().toISOString(),
    };

    if (extractedPhotos.length > 0) {
      const rehostedPhotos = await rehostPhotos(supabase, listingId, extractedPhotos);
      updatePayload.photos = rehostedPhotos;
    }

    await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", listingId);

    return new Response(
      JSON.stringify({
        success: true,
        listing: {
          id: listingId,
          name: listing.name,
          is_touchless: isTouchless,
          confidence: confidence,
          notes: notes,
          photos_found: extractedPhotos.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error verifying listing:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to verify listing"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
