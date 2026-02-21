import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BulkClassifyRequest {
  listingIds: string[];
  applyToChain?: boolean;
}

interface ClassificationResult {
  touchless_classification: "confirmed_touchless" | "likely_touchless" | "not_touchless" | "uncertain";
  confidence: number;
  evidence: string[];
  amenities: string[];
  hero_image_url: string | null;
  logo_url: string | null;
  blocked_images: string[];
  image_scores: Array<{ url: string; score: number; reason: string }>;
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

function extractPhotosFromSnapshot(snapshot: Record<string, unknown>): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();

  const isValid = (url: string) => {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("data:")) return false;
    if (!url.startsWith("http")) return false;
    const lower = url.toLowerCase();
    return !lower.includes("favicon") && !lower.includes(".gif") &&
           !lower.includes("recaptcha") && !lower.includes("gravatar");
  };

  const data = snapshot.data as Record<string, unknown> | undefined;
  if (!data) return photos;

  if (Array.isArray(data.images)) {
    for (const url of data.images as string[]) {
      if (isValid(url) && !seen.has(url)) { seen.add(url); photos.push(url); }
    }
  }

  const meta = data.metadata as Record<string, unknown> | undefined;
  if (meta) {
    for (const field of ["ogImage", "og:image", "twitterImage", "twitter:image"]) {
      const val = meta[field];
      if (typeof val === "string" && isValid(val) && !seen.has(val)) { seen.add(val); photos.push(val); }
    }
  }

  return photos.slice(0, 40);
}

async function classifyWithClaude(
  anthropicKey: string,
  listing: { name: string; website: string | null },
  content: string,
  imageUrls: string[]
): Promise<ClassificationResult> {
  const imageList = imageUrls.slice(0, 20).map((u, i) => `${i + 1}. ${u}`).join("\n");

  const prompt = `You are analyzing a car wash business website to extract structured data. Analyze the content below and return a JSON object with ALL of the following fields.

Business: ${listing.name}
Website: ${listing.website || "unknown"}

=== WEBSITE CONTENT ===
${content.slice(0, 12000)}

=== IMAGE URLS FOUND ON PAGE ===
${imageList || "None found"}

=== INSTRUCTIONS ===

1. TOUCHLESS CLASSIFICATION
Determine if this car wash uses touchless/brush-free technology.
- Look for: touchless, touch-free, brushless, laser wash, no-touch, contactless, scratch-free, friction-free, soft-cloth alternatives
- "confirmed_touchless": multiple strong keywords, clear primary service
- "likely_touchless": one or two keywords, or implied but not explicit
- "not_touchless": brush wash, hand wash, friction wash, foam brush explicitly mentioned as primary
- "uncertain": no clear indicators either way

2. AMENITIES EXTRACTION
List all services and features mentioned: payment methods, wash options (basic/deluxe/premium), vacuum stations, air dryers, spot-free rinse, tire shine, undercarriage wash, mat cleaners, vending, etc.

3. IMAGE ANALYSIS
From the image URLs listed above:
- hero_image_url: best exterior building shot, car being washed, or facility photo. Prefer large landscape images. Avoid logos, icons, banners, stock photos.
- logo_url: the business logo — typically small, often square/rectangular, appears in header/nav area, contains business name. Look for URLs containing "logo", "brand", "icon" in the path, or images that are clearly a logo by their URL pattern.
- blocked_images: URLs that are clearly low-quality, irrelevant, stock photos, tiny icons, or spam.
- image_scores: score each image 0-100 for quality as a hero image.

Return ONLY valid JSON, no explanation:
{
  "touchless_classification": "confirmed_touchless" | "likely_touchless" | "not_touchless" | "uncertain",
  "confidence": 0-100,
  "evidence": ["phrase1", "phrase2"],
  "amenities": ["amenity1", "amenity2"],
  "hero_image_url": "url or null",
  "logo_url": "url or null",
  "blocked_images": ["url1"],
  "image_scores": [{"url": "url", "score": 85, "reason": "exterior building shot"}]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text) as ClassificationResult;
  } catch {
    return {
      touchless_classification: "uncertain",
      confidence: 0,
      evidence: [],
      amenities: [],
      hero_image_url: null,
      logo_url: null,
      blocked_images: [],
      image_scores: [],
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { listingIds, applyToChain = true }: BulkClassifyRequest = await req.json();

    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "listingIds array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listings, error: fetchError } = await supabase
      .from("listings")
      .select("id, name, website, parent_chain, crawl_snapshot")
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
      status: "classified" | "failed" | "no_snapshot";
      classification?: string;
      confidence?: number;
      chain_applied_to?: number;
      error?: string;
    }> = [];

    for (const listing of listings) {
      if (!listing.crawl_snapshot) {
        results.push({ id: listing.id, name: listing.name, status: "no_snapshot" });
        continue;
      }

      try {
        const snapshot = listing.crawl_snapshot as Record<string, unknown>;
        const snapshotData = snapshot.data as Record<string, unknown> | undefined;
        const content = (snapshotData?.markdown as string) || (snapshotData?.html as string) || "";
        const imageUrls = extractPhotosFromSnapshot(snapshot);

        const classification = await classifyWithClaude(anthropicKey, listing, content, imageUrls);

        const isTouchless =
          classification.touchless_classification === "confirmed_touchless" ||
          classification.touchless_classification === "likely_touchless"
            ? true
            : classification.touchless_classification === "not_touchless"
            ? false
            : null;

        const updatePayload: Record<string, unknown> = {
          is_touchless: isTouchless,
          crawl_status: "classified",
          touchless_confidence: classification.confidence > 66
            ? "high"
            : classification.confidence > 33
            ? "medium"
            : "low",
          classification_confidence: classification.confidence,
          classification_source: "direct",
          verification_status: "auto_classified",
          amenities: classification.amenities,
          hero_image: classification.hero_image_url,
          logo_url: classification.logo_url,
          blocked_photos: classification.blocked_images,
          touchless_evidence: classification.evidence.map(e => ({ keyword: e, snippet: e, type: "touchless" })),
          crawl_notes: `Claude: ${classification.touchless_classification} (${classification.confidence}% confidence)`,
          extracted_at: new Date().toISOString(),
        };

        if (classification.image_scores.length > 0) {
          const sortedPhotos = [...imageUrls].sort((a, b) => {
            const sa = classification.image_scores.find(s => s.url === a)?.score ?? 0;
            const sb = classification.image_scores.find(s => s.url === b)?.score ?? 0;
            return sb - sa;
          });
          updatePayload.photos = sortedPhotos;
        }

        await supabase.from("listings").update(updatePayload).eq("id", listing.id);

        let chainAppliedCount = 0;

        if (applyToChain && listing.parent_chain) {
          const chainUpdate: Record<string, unknown> = {
            is_touchless: isTouchless,
            touchless_confidence: updatePayload.touchless_confidence,
            classification_confidence: classification.confidence,
            classification_source: "chain_inferred",
            verification_status: "auto_classified",
            amenities: classification.amenities,
            touchless_evidence: updatePayload.touchless_evidence,
            crawl_notes: `Chain-inferred from ${listing.name}: ${classification.touchless_classification} (${classification.confidence}%)`,
            extracted_at: new Date().toISOString(),
          };

          const { count } = await supabase
            .from("listings")
            .update(chainUpdate)
            .eq("parent_chain", listing.parent_chain)
            .neq("id", listing.id)
            .is("crawl_snapshot", null)
            .select("id", { count: "exact", head: true });

          chainAppliedCount = count ?? 0;
        }

        results.push({
          id: listing.id,
          name: listing.name,
          status: "classified",
          classification: classification.touchless_classification,
          confidence: classification.confidence,
          chain_applied_to: chainAppliedCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: listing.id, name: listing.name, status: "failed", error: msg.slice(0, 200) });
      }
    }

    const summary = {
      total: results.length,
      classified: results.filter(r => r.status === "classified").length,
      failed: results.filter(r => r.status === "failed").length,
      no_snapshot: results.filter(r => r.status === "no_snapshot").length,
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
