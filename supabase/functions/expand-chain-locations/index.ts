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

async function scrapeWithFirecrawl(url: string, apiKey: string, formats: string[], waitFor?: number): Promise<{ markdown: string; links: string[] }> {
  const body: Record<string, unknown> = { url, formats, onlyMainContent: false };
  if (waitFor) body.waitFor = waitFor;
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { markdown: "", links: [] };
  const data = await response.json();
  return {
    markdown: data.data?.markdown || "",
    links: data.data?.links || [],
  };
}

async function findLocationsPageUrl(
  anthropicKey: string,
  rootUrl: string,
  pageMarkdown: string,
  links: string[]
): Promise<string | null> {
  if (links.length === 0) return null;

  const linkList = links.slice(0, 100).join("\n");

  const prompt = `You are helping find the "locations" or "find a store" page for a car wash chain website.

Root URL: ${rootUrl}

Here are all the links found on the page:
${linkList}

Here is the page content (truncated):
${pageMarkdown.substring(0, 3000)}

Which single link URL is most likely the page that lists ALL physical locations / branches / stores for this car wash chain?
Look for links whose URL path or surrounding context suggests: locations, stores, find us, our washes, where to find us, car wash locations, etc.

Respond with ONLY the full URL string, nothing else. If you cannot identify any such link, respond with the single word: none`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const answer: string = (data.content[0].text || "").trim();
  if (!answer || answer.toLowerCase() === "none") return null;

  if (answer.startsWith("http")) return answer;
  return `${rootUrl.replace(/\/$/, "")}${answer.startsWith("/") ? answer : `/${answer}`}`;
}

interface ExtractedLocation {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  location_page_url: string | null;
  hours: Record<string, string> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { listingId }: { listingId: string } = await req.json();

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: "listingId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listing.website && !listing.crawl_snapshot) {
      return new Response(
        JSON.stringify({ error: "Listing has no website or crawl snapshot to analyze" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rootUrl: string = listing.website || "";
    let markdownToAnalyze = "";
    let sourceDescription = "";
    let usedSnapshot = false;

    const snapshotMarkdown: string = listing.crawl_snapshot?.data?.markdown || "";
    const snapshotLinks: string[] = listing.crawl_snapshot?.data?.links || [];
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (snapshotMarkdown) {
      // Ask Claude to identify which link (if any) leads to a dedicated locations page
      const locationsPageUrl = await findLocationsPageUrl(anthropicKey, rootUrl, snapshotMarkdown, snapshotLinks);

      if (locationsPageUrl && firecrawlApiKey) {
        let locResult = await scrapeWithFirecrawl(locationsPageUrl, firecrawlApiKey, ["markdown"]);
        if (locResult.markdown.length < 500) {
          locResult = await scrapeWithFirecrawl(locationsPageUrl, firecrawlApiKey, ["markdown"], 3000);
        }
        markdownToAnalyze = locResult.markdown.length >= 500 ? locResult.markdown : snapshotMarkdown;
        sourceDescription = locationsPageUrl;
        usedSnapshot = locResult.markdown.length < 500;
      } else {
        markdownToAnalyze = snapshotMarkdown;
        sourceDescription = rootUrl || "existing snapshot";
        usedSnapshot = true;
      }
    } else if (rootUrl) {
      if (!firecrawlApiKey) {
        return new Response(
          JSON.stringify({ error: "No crawl snapshot available and FIRECRAWL_API_KEY is not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // No snapshot — scrape root page first, then find the locations sub-page
      const rootResult = await scrapeWithFirecrawl(rootUrl, firecrawlApiKey, ["markdown", "links"]);
      const locationsPageUrl = await findLocationsPageUrl(anthropicKey, rootUrl, rootResult.markdown, rootResult.links);

      if (locationsPageUrl) {
        let locResult = await scrapeWithFirecrawl(locationsPageUrl, firecrawlApiKey, ["markdown"]);
        if (locResult.markdown.length < 500) {
          locResult = await scrapeWithFirecrawl(locationsPageUrl, firecrawlApiKey, ["markdown"], 3000);
        }
        markdownToAnalyze = locResult.markdown.length >= 500 ? locResult.markdown : rootResult.markdown;
        sourceDescription = locationsPageUrl;
      } else {
        markdownToAnalyze = rootResult.markdown;
        sourceDescription = rootUrl;
      }

      if (!markdownToAnalyze) {
        return new Response(
          JSON.stringify({ error: "Failed to scrape website — no content returned" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Ask Claude to extract all locations from the content
    const chainName = listing.parent_chain || listing.name;
    const extractPrompt = `You are extracting location data for a car wash chain called "${chainName}" from their website.

Website: ${sourceDescription}

Page content (markdown):
${markdownToAnalyze.substring(0, 20000)}

Your task: Find ALL individual physical locations listed on this page. Each location should have a distinct address.

Respond with ONLY valid JSON — no commentary, no markdown code blocks:
{
  "chain_name": "The canonical brand/chain name (e.g. 'Posh Wash Car Wash')",
  "locations": [
    {
      "name": "Full business name including location identifier if any (e.g. 'Posh Wash Car Wash - Taunton')",
      "address": "Street address only (e.g. '540 Winthrop St')",
      "city": "City name",
      "state": "2-letter state code (e.g. MA)",
      "zip": "5-digit zip code",
      "phone": "Phone number or null",
      "location_page_url": "URL to this specific location's page if available, or null",
      "hours": {
        "monday": "24 hours",
        "tuesday": "24 hours"
      }
    }
  ]
}

Rules:
- Only include locations with a real street address
- If hours say "Open 24/7" or "Open 24 hours", set all days to "24 hours"
- location_page_url should be a fully qualified URL if shown, otherwise null
- If you can only find one location, return an array with that one location
- Do NOT include a location if it has no address
- The chain_name should be the clean brand name without location suffixes`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
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
    const extractedText: string = anthropicData.content[0].text;

    let extracted: { chain_name: string; locations: ExtractedLocation[] };
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : extractedText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude response", raw: extractedText.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const locations: ExtractedLocation[] = extracted.locations || [];
    const canonicalChainName: string = extracted.chain_name || chainName;

    if (locations.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No locations found on page",
          debug: {
            source: sourceDescription,
            used_snapshot: usedSnapshot,
            content_length: markdownToAnalyze.length,
            content_preview: markdownToAnalyze.substring(0, 800),
            claude_raw: extractedText.substring(0, 800),
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Update the original listing with chain name
    await supabase
      .from("listings")
      .update({ parent_chain: canonicalChainName })
      .eq("id", listingId);

    for (const loc of locations) {
      if (!loc.address || !loc.city || !loc.state) {
        skipped.push(`${loc.name || "unknown"} — missing address`);
        continue;
      }

      // Check if a listing with this address already exists
      const { data: existing } = await supabase
        .from("listings")
        .select("id, name")
        .ilike("address", loc.address.trim())
        .ilike("city", loc.city.trim())
        .ilike("state", loc.state.trim())
        .maybeSingle();

      if (existing) {
        await supabase
          .from("listings")
          .update({
            parent_chain: canonicalChainName,
            ...(loc.location_page_url ? { location_page_url: loc.location_page_url } : {}),
          })
          .eq("id", existing.id);
        skipped.push(`${loc.name} — already exists (updated chain info)`);
        continue;
      }

      const locationName = loc.name || `${canonicalChainName} - ${loc.city}`;
      const slug = await makeUniqueSlug(supabase, locationName);

      const newListing: Record<string, unknown> = {
        slug,
        name: locationName,
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zip: loc.zip || "",
        phone: loc.phone || null,
        website: rootUrl,
        location_page_url: loc.location_page_url || null,
        parent_chain: canonicalChainName,
        hours: loc.hours || {},
        wash_packages: listing.wash_packages || [],
        amenities: listing.amenities || [],
        rating: 0,
        review_count: 0,
        latitude: null,
        longitude: null,
        is_touchless: listing.is_touchless,
        touchless_confidence: listing.touchless_confidence,
        crawl_status: "pending",
        crawl_notes: `Location imported from chain expansion of "${canonicalChainName}". Needs individual verification.`,
        touchless_evidence: [],
        is_approved: true,
        is_featured: false,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("listings")
        .insert(newListing)
        .select("id, name")
        .single();

      if (insertError) {
        errors.push(`${locationName}: ${insertError.message}`);
      } else {
        created.push(inserted.name);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        chain_name: canonicalChainName,
        source: usedSnapshot ? "snapshot" : "live_scrape",
        locations_found: locations.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
        created_names: created,
        skipped_names: skipped,
        error_details: errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in expand-chain-locations:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
