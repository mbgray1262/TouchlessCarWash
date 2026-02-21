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

const SYSTEM_PROMPT = `You are classifying car wash businesses. Based on the website text provided, determine if this car wash offers TOUCHLESS (also called "touch-free" or "contactless") washing.

A touchless car wash uses only high-pressure water and chemicals — no brushes, cloth, or friction materials contact the vehicle.

CLASSIFY AS TOUCHLESS (is_touchless: true):
- Website explicitly mentions "touchless", "touch-free", "touch free", "contactless", "no-touch", "brushless", or "laser wash"
- Self-service car washes (wand/spray washes are touchless by definition)
- Washes that offer BOTH touchless and friction/soft-touch options (hybrid facilities)

CLASSIFY AS NOT TOUCHLESS (is_touchless: false) — THIS IS THE DEFAULT:
- Website describes wash packages, tunnel washes, express washes, or specific wash chemicals (triple foam, wheel cleaner, tire shine, ceramic coating, etc.) WITHOUT mentioning touchless/touch-free/contactless
- Website mentions soft-touch, friction, brush, foam brush, cloth, or conveyor wash
- Website has enough content about their wash services but no touchless language
- Businesses that are clearly not car washes (detail shops only, auto repair, etc.)

ONLY classify as UNKNOWN (is_touchless: null) when:
- The website has almost no content at all (just an address, phone number, and maybe a logo — no description of services)
- The page failed to load meaningful content

The overwhelming majority of car washes are friction/soft-touch. Do NOT default to unknown just because touchless isn't mentioned — if they describe their wash services without using touchless language, classify as NOT touchless.

Respond in this exact JSON format:
{"is_touchless": true/false/null, "evidence": "Brief 1-2 sentence explanation of what you found", "amenities": ["list", "of", "amenities", "mentioned"]}

For amenities, extract any of these if mentioned: free vacuum, unlimited wash club, membership program, self-serve bays, RV or oversized vehicle washing, interior cleaning, detailing, ceramic coating, wax, undercarriage wash, tire shine, air freshener, mat cleaner, dog wash.`;

async function classifyWithClaude(text: string, apiKey: string): Promise<{ is_touchless: boolean | null; evidence: string; amenities: string[] }> {
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
    const { listing_id } = body;

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

    if (listing.is_touchless !== null) {
      return Response.json({ status: "already_classified", is_touchless: listing.is_touchless }, { headers: corsHeaders });
    }

    if (!listing.website || listing.website.trim() === "") {
      await supabase.from("listings").update({ crawl_status: "no_website" }).eq("id", listing_id);
      return Response.json({ status: "no_website" }, { headers: corsHeaders });
    }

    const fetched = await fetchWebsite(listing.website);

    if (!fetched.ok || fetched.text.length < 50) {
      await supabase.from("listings").update({
        crawl_status: "failed",
        last_crawled_at: new Date().toISOString(),
      }).eq("id", listing_id);
      return Response.json({ status: "fetch_failed", error: fetched.error }, { headers: corsHeaders });
    }

    let classification: { is_touchless: boolean | null; evidence: string; amenities: string[] };
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

    const crawl_status = is_touchless === null ? "unknown" : "classified";

    const updatePayload: Record<string, unknown> = {
      is_touchless,
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
