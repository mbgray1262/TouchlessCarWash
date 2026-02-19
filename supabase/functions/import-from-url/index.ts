import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function makeUniqueSlug(supabase: ReturnType<typeof createClient>, base: string): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data } = await supabase.from("listings").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    attempt++;
  }
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

function extractPhotosFromFirecrawl(firecrawlData: Record<string, unknown>): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();

  const isValid = (url: string): boolean => {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("data:")) return false;
    if (!url.startsWith("http")) return false;
    const lower = url.toLowerCase();
    if (lower.includes("favicon") || lower.includes(".gif")) return false;
    if (lower.includes("recaptcha") || lower.includes("gravatar")) return false;
    return true;
  };

  const add = (url: string) => {
    if (!isValid(url) || seen.has(url)) return;
    seen.add(url);
    photos.push(url);
  };

  const data = firecrawlData.data as Record<string, unknown> | undefined;
  if (!data) return photos;

  if (Array.isArray(data.images)) {
    (data.images as string[]).forEach(add);
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    for (const field of ["ogImage", "og:image", "twitterImage", "twitter:image", "og:image:url"]) {
      const val = metadata[field];
      if (typeof val === "string") add(val);
      else if (Array.isArray(val)) (val as string[]).forEach(v => add(v));
    }
  }

  return photos.slice(0, 30);
}

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
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; bot)",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (!res.ok) { rehosted.push(url); continue; }
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const baseType = contentType.split(";")[0].trim().toLowerCase();
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(baseType)) continue;
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 1000) continue;
      const ext = baseType === "image/png" ? "png" : baseType === "image/webp" ? "webp" : "jpg";
      const storagePath = `${listingId}/${i}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("listing-photos")
        .upload(storagePath, bytes, { contentType: baseType, upsert: true });
      if (uploadError) { rehosted.push(url); continue; }
      const { data: pub } = supabase.storage.from("listing-photos").getPublicUrl(storagePath);
      rehosted.push(pub.publicUrl);
    } catch {
      rehosted.push(url);
    }
  }
  return rehosted;
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
    const { url }: { url: string } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Scrape with Firecrawl
    const firecrawlResponse = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "images"],
        onlyMainContent: false,
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      return new Response(
        JSON.stringify({ error: `Firecrawl error: ${errorText.substring(0, 300)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    const markdown = firecrawlData.data?.markdown || "";
    const metadata = firecrawlData.data?.metadata || {};

    // Step 2: Claude extracts structured listing data
    const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractPrompt = `You are extracting structured data for a car wash business directory from a website page.

Page URL: ${url}
Page title: ${metadata.title || ""}
Page description: ${metadata.description || ""}

Page content (markdown):
${markdown.substring(0, 18000)}

Extract ONLY data that is clearly present on this page. Do NOT invent or guess data.

Respond with ONLY valid JSON — no commentary, no markdown code blocks:
{
  "name": "Business name (required)",
  "address": "Street address only (e.g. 123 Main St)",
  "city": "City name",
  "state": "2-letter state code (e.g. MA, CA)",
  "zip": "5-digit zip code",
  "phone": "Phone number as shown on site, or null",
  "website": "Homepage URL (not this specific page URL unless it is the homepage), or null",
  "hours": {
    "monday": "8:00 AM - 8:00 PM",
    "tuesday": "8:00 AM - 8:00 PM",
    "wednesday": "8:00 AM - 8:00 PM",
    "thursday": "8:00 AM - 8:00 PM",
    "friday": "8:00 AM - 8:00 PM",
    "saturday": "8:00 AM - 8:00 PM",
    "sunday": "9:00 AM - 6:00 PM"
  },
  "wash_packages": [
    { "name": "Package name", "price": "$X.XX", "description": "What's included" }
  ],
  "amenities": ["list of amenities like Touchless Automatic, Free Vacuums, Air Compressors, etc."],
  "rating": null,
  "review_count": 0,
  "latitude": null,
  "longitude": null
}

Rules:
- name is REQUIRED. If you can't find the name, derive it from the page title or URL.
- address, city, state, zip: extract only if clearly shown on the page
- For a chain with multiple locations, extract only THIS location's data
- amenities: be specific and descriptive. Include wash type (e.g. "Touchless Automatic", "Self-Serve Bays"), payment options, equipment, services
- wash_packages: extract service menu items with prices if available
- If hours say "Open 24 hours" or "24/7", use "24 hours" for all days
- Return null for any field you cannot find`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: extractPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({ error: `Claude API error: ${errorText.substring(0, 300)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const extractedText = anthropicData.content[0].text;

    let extracted: Record<string, unknown>;
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : extractedText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude response", raw: extractedText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const name = (extracted.name as string || "").trim();
    if (!name) {
      return new Response(
        JSON.stringify({ error: "Could not extract business name from page" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Touchless detection
    const textContent = markdown.toLowerCase();
    const definitiveTouchlessPhrases = [
      "touchless car wash", "touch-less car wash", "touchless automatic",
      "touchless wash", "no-touch wash", "no touch wash",
      "touchfree wash", "touch free wash", "touch free car wash",
      "touchfree car wash", "laser wash", "brushless wash",
      "brushless car wash", "touchless auto wash", "touchless automatic wash",
    ];
    const falsePositivePhrases = [
      "touchless drying", "touchless dryer", "touchless payment",
      "touchless pay", "touchless entry", "touchless exit",
    ];
    const notTouchlessKeywords = ["brush wash", "brushes", "hand wash", "manual wash", "foam brush"];

    let scoringText = textContent;
    for (const fp of falsePositivePhrases) {
      scoringText = scoringText.split(fp).join("");
    }

    let touchlessScore = 0;
    let notTouchlessScore = 0;
    const evidenceSnippets: Array<{ keyword: string; snippet: string; type: string }> = [];

    const extractSnippet = (text: string, keyword: string): string => {
      const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx === -1) return "";
      const start = Math.max(0, idx - 120);
      const end = Math.min(text.length, idx + keyword.length + 120);
      let snippet = text.substring(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < text.length) snippet += "...";
      return snippet.trim();
    };

    const foundKeywords: string[] = [];
    for (const phrase of definitiveTouchlessPhrases) {
      const regex = new RegExp(phrase.replace(/[-]/g, "[-\\s]?"), "gi");
      const matches = scoringText.match(regex);
      if (matches) {
        touchlessScore += matches.length;
        if (!foundKeywords.includes(phrase)) {
          foundKeywords.push(phrase);
          const snippet = extractSnippet(markdown, phrase);
          if (snippet) evidenceSnippets.push({ keyword: phrase, snippet, type: "touchless" });
        }
      }
    }

    for (const kw of notTouchlessKeywords) {
      const matches = textContent.match(new RegExp(kw, "gi"));
      if (matches) notTouchlessScore += matches.length;
    }

    let isTouchless: boolean | null = null;
    let confidence = "unknown";
    let crawlNotes = "";

    if (touchlessScore >= 1) {
      isTouchless = true;
      confidence = touchlessScore >= 5 ? "high" : touchlessScore >= 3 ? "medium" : "low";
      crawlNotes = `Found touchless keywords: ${foundKeywords.join(", ")} (${touchlessScore}x).`;
    } else if (notTouchlessScore > 0 && touchlessScore === 0) {
      isTouchless = false;
      confidence = "high";
      crawlNotes = `Only brush/manual wash indicators found (${notTouchlessScore}x). No touchless indicators.`;
    } else {
      isTouchless = null;
      confidence = "unknown";
      crawlNotes = "No clear touchless or brush wash indicators found. Manual verification needed.";
    }

    // Step 4: Extract and rehost photos
    const photoUrls = extractPhotosFromFirecrawl(firecrawlData);

    // Step 5: Build slug and insert listing
    const slug = await makeUniqueSlug(supabase, name);

    const listingData: Record<string, unknown> = {
      slug,
      name,
      address: extracted.address || "",
      city: extracted.city || "",
      state: extracted.state || "",
      zip: extracted.zip || "",
      phone: extracted.phone || null,
      website: extracted.website || null,
      hours: extracted.hours || {},
      wash_packages: extracted.wash_packages || [],
      amenities: extracted.amenities || [],
      rating: typeof extracted.rating === "number" ? extracted.rating : 0,
      review_count: typeof extracted.review_count === "number" ? extracted.review_count : 0,
      latitude: extracted.latitude || null,
      longitude: extracted.longitude || null,
      is_touchless: isTouchless,
      touchless_confidence: confidence,
      crawl_status: "crawled",
      crawl_notes: crawlNotes,
      touchless_evidence: evidenceSnippets,
      crawl_snapshot: firecrawlData,
      last_crawled_at: new Date().toISOString(),
      is_approved: true,
      is_featured: false,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("listings")
      .insert(listingData)
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Failed to insert listing: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 6: Rehost photos now that we have an ID
    let rehostedPhotos: string[] = [];
    if (photoUrls.length > 0) {
      rehostedPhotos = await rehostPhotos(supabase, inserted.id, photoUrls);
      await supabase.from("listings").update({ photos: rehostedPhotos, extracted_at: new Date().toISOString() }).eq("id", inserted.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        listing: {
          ...inserted,
          photos: rehostedPhotos,
        },
        stats: {
          touchless_score: touchlessScore,
          photos_found: photoUrls.length,
          photos_rehosted: rehostedPhotos.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in import-from-url:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
