import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function stripHtml(html: string): string {
  let text = html
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
    .trim();
  return text.slice(0, 8000);
}

async function fetchWebsite(url: string): Promise<{ text: string; ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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

const SYSTEM_PROMPT = `You are classifying car wash businesses for an AUTOMATED TOUCHLESS car wash directory. Your job is to determine whether this business offers an AUTOMATED drive-through touchless wash — and separately, whether it offers self-service wand bays.

DEFINITIONS:
- AUTOMATED TOUCHLESS: A drive-through tunnel or bay where the car moves through (or equipment moves around the car) using only high-pressure water jets, foam, and chemicals with NO brushes, cloth, or friction. Keywords: "touchless", "touch-free", "touch free", "contactless", "no-touch", "brushless", "laser wash", "automatic touchless".
- SELF-SERVICE: Coin-operated or pay-per-use open bays where the CUSTOMER operates a handheld wand or pressure washer themselves to wash their own car. This is NOT automated and should NOT be classified as touchless even though no brushes contact the car.

CLASSIFY is_touchless = true ONLY when:
- The business itself claims to offer "touchless", "touch-free", "contactless", "no-touch", "brushless", or "laser wash" as a service THEY provide
- This refers to an AUTOMATED service, not a self-service wand bay
- Hybrid facilities that offer BOTH automated touchless AND other wash types

CLASSIFY is_touchless = false (THIS IS THE DEFAULT) when:
- Website describes wash packages or tunnel washes WITHOUT touchless/touch-free/contactless language
- Website mentions soft-touch, friction, brush, foam brush, cloth, or conveyor wash
- Website describes ONLY self-service wand bays (customer uses wand themselves) — self-service is NEVER touchless for our directory
- Website mentions "self-serve bays", "self service", "wand", "spray bay", "coin-op", "coin operated" as their PRIMARY or ONLY offering
- The business is not a car wash (detail shop, auto repair, etc.)

CLASSIFY is_touchless = null ONLY when:
- The page has almost no content (just address/phone/logo, no service description)
- Page failed to load meaningful content

CLASSIFY is_self_service = true when:
- Website mentions self-service bays, wand bays, spray bays, coin-operated bays, or customers washing their own car

CRITICAL RULES — these are the most common classification errors:

1. IGNORE BOILERPLATE INDUSTRY COPY: Many websites (especially on platforms like edan.io, keeq.io, jany.io, lany.io, webbo.me) contain auto-generated "industry analysis", "industry overview", "expert analysis", or "comprehensive industry overview" sections that describe the car wash industry in general terms. These sections often mention touchless technology as an industry trend. This does NOT mean the specific business offers touchless washing. ONLY classify as touchless if the business is describing its own services.

2. SELF-SERVICE IS NEVER TOUCHLESS: Self-service wand bays are NOT automated touchless washes. Never reason that "self-service is touchless by definition." The customer operating a pressure wand does not make it an automated touchless facility. is_self_service = true means is_touchless should be false (unless there is also a separate automated touchless bay).

3. GENERIC MENTIONS DO NOT COUNT: Phrases like "we use state-of-the-art equipment such as touchless wash systems" appearing in generic/template copy do not count. Look for specific first-person service claims: "our touchless wash", "we offer touch-free", "2 touchless automatic bays", specific brand names (LaserWash, Razor®, Petit, etc.).

Respond in this exact JSON format:
{"is_touchless": true/false/null, "is_self_service": true/false, "evidence": "Brief 1-2 sentence explanation", "amenities": ["list", "of", "amenities"]}

For amenities, extract any mentioned: free vacuum, unlimited wash club, membership program, self-serve bays, RV or oversized vehicle washing, interior cleaning, detailing, ceramic coating, wax, undercarriage wash, tire shine, air freshener, mat cleaner, dog wash.`;

async function classifyWithClaude(text: string, apiKey: string): Promise<{ is_touchless: boolean | null; is_self_service: boolean; evidence: string; amenities: string[] }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
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

    const body = await req.json().catch(() => ({}));
    const { listing_id, force } = body;

    if (!listing_id) {
      return Response.json({ error: "listing_id required" }, { status: 400, headers: corsHeaders });
    }

    const { data: listing, error: listingErr } = await supabase
      .from("listings")
      .select("id, name, city, state, website, is_touchless")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingErr) return Response.json({ error: listingErr.message }, { status: 500, headers: corsHeaders });
    if (!listing) return Response.json({ error: "Listing not found" }, { status: 404, headers: corsHeaders });

    if (listing.is_touchless !== null && !force) {
      return Response.json({ status: "already_classified", is_touchless: listing.is_touchless }, { headers: corsHeaders });
    }

    if (!listing.website || listing.website.trim() === "") {
      await supabase.from("listings").update({ crawl_status: "no_website" }).eq("id", listing_id);
      return Response.json({ status: "no_website" }, { headers: corsHeaders });
    }

    const fetched = await fetchWebsite(listing.website);

    if (!fetched.ok || fetched.text.length < 50) {
      await supabase.from("listings").update({
        crawl_status: "fetch_failed",
        last_crawled_at: new Date().toISOString(),
      }).eq("id", listing_id);
      return Response.json({ status: "fetch_failed", error: fetched.error }, { headers: corsHeaders });
    }

    let classification: { is_touchless: boolean | null; is_self_service: boolean; evidence: string; amenities: string[] };
    try {
      classification = await classifyWithClaude(fetched.text, anthropicKey);
    } catch (e) {
      await supabase.from("listings").update({
        crawl_status: "classify_failed",
        touchless_evidence: (e as Error).message.slice(0, 500),
        last_crawled_at: new Date().toISOString(),
      }).eq("id", listing_id);
      return Response.json({ status: "classify_failed", error: (e as Error).message }, { headers: corsHeaders });
    }

    const is_touchless = classification.is_touchless === true
      ? true
      : classification.is_touchless === false
        ? false
        : null;

    const is_self_service = classification.is_self_service === true;

    const crawl_status = is_touchless === null ? "unknown" : "classified";

    const updatePayload: Record<string, unknown> = {
      is_touchless,
      is_self_service,
      crawl_status,
      touchless_evidence: classification.evidence ?? "",
      last_crawled_at: new Date().toISOString(),
    };

    if (classification.amenities && classification.amenities.length > 0) {
      updatePayload.amenities = classification.amenities;
    }

    const { error: updateError } = await supabase
      .from("listings")
      .update(updatePayload)
      .eq("id", listing_id);

    if (updateError) {
      return Response.json({
        status: "update_failed",
        error: updateError.message,
        is_touchless,
      }, { headers: corsHeaders });
    }

    return Response.json({
      status: "classified",
      is_touchless,
      evidence: classification.evidence,
    }, { headers: corsHeaders });

  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: corsHeaders });
  }
});
