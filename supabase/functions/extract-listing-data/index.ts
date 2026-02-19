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
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": url,
        },
      });
      if (!res.ok) {
        rehosted.push(url);
        continue;
      }
      const contentType = res.headers.get("content-type") || "";
      const baseType = contentType.split(";")[0].trim().toLowerCase();
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(baseType)) {
        console.log(`Skipping non-image content-type "${baseType}" for URL: ${url}`);
        continue;
      }
      const ext = baseType === "image/png" ? "png" : baseType === "image/webp" ? "webp" : "jpg";
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 1000) {
        console.log(`Skipping suspiciously small image (${bytes.length} bytes) for URL: ${url}`);
        continue;
      }
      const storagePath = `${listingId}/${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("listing-photos")
        .upload(storagePath, bytes, { contentType: baseType, upsert: true });

      if (uploadError) {
        console.error(`Failed to upload photo ${i}:`, uploadError.message);
        rehosted.push(url);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("listing-photos")
        .getPublicUrl(storagePath);

      rehosted.push(publicUrlData.publicUrl);
    } catch (err) {
      console.error(`Error rehosting photo ${i}:`, err);
      rehosted.push(url);
    }
  }

  return rehosted;
}

interface ExtractionRequest {
  listing_id: string;
}

interface ExtractedData {
  photos: string[];
  amenities: string[];
  hours: Record<string, string> | null;
}

function extractPhotosFromSnapshot(snapshot: Record<string, unknown>): string[] {
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

  const data = snapshot.data as Record<string, unknown> | undefined;
  if (data) {
    if (Array.isArray(data.images)) {
      (data.images as string[]).forEach(url => addPhoto(url));
    }
    const metadata = data.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      const ogImageFields = ["ogImage", "og:image", "twitterImage", "twitter:image", "og:image:url"];
      for (const field of ogImageFields) {
        const val = metadata[field];
        if (typeof val === "string") addPhoto(val);
        else if (Array.isArray(val)) (val as string[]).forEach(v => addPhoto(v));
      }
    }
  }

  return photos.slice(0, 30);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { listing_id }: ExtractionRequest = await req.json();

    if (!listing_id) {
      return new Response(
        JSON.stringify({ error: "listing_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const supabaseHeaders = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    const listingResponse = await fetch(
      `${supabaseUrl}/rest/v1/listings?id=eq.${listing_id}&select=*`,
      { headers: supabaseHeaders }
    );

    if (!listingResponse.ok) throw new Error("Failed to fetch listing");

    const listings = await listingResponse.json();

    if (!listings || listings.length === 0) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listing = listings[0];

    if (!listing.crawl_snapshot) {
      return new Response(
        JSON.stringify({ error: "No crawl snapshot available for this listing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const snapshot = listing.crawl_snapshot;
    const snapshotData = snapshot.data as Record<string, unknown> | undefined;
    const contentToAnalyze = (snapshotData?.markdown as string) || (snapshotData?.html as string) || (snapshot.markdown as string) || (snapshot.html as string) || "";

    const snapshotPhotos = extractPhotosFromSnapshot(snapshot);

    const prompt = `Analyze this car wash listing data and extract structured information. Focus on extracting:

1. AMENITIES: Extract specific amenities and features. For touchless car washes, look for:
   - Equipment type (touchless/automatic/self-service)
   - Payment methods (credit card, mobile pay, cash, etc.)
   - Services (vacuums, air compressors, mat cleaners, vending)
   - Wash options (basic, deluxe, premium, undercarriage, etc.)
   - Special features (heated bays, spot-free rinse, tire shine, etc.)
   - Accessibility features

2. HOURS: Extract operating hours in a structured format. Use day names as keys (monday, tuesday, etc.) and hour ranges as values (e.g., "6:00 AM - 10:00 PM" or "24 hours"). If 24/7, use "24 hours" for all days.

Content to analyze:
${contentToAnalyze.substring(0, 15000)}

Respond ONLY with valid JSON in this exact format:
{
  "amenities": ["amenity1", "amenity2"],
  "hours": {
    "monday": "6:00 AM - 10:00 PM",
    "tuesday": "6:00 AM - 10:00 PM"
  }
}

If no data is found for a field, use an empty array [] for amenities or null for hours.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      throw new Error(`Anthropic API error: ${errorText}`);
    }

    const anthropicData = await anthropicResponse.json();
    const extractedText = anthropicData.content[0].text;

    let claudeData: { amenities?: string[]; hours?: Record<string, string> | null };
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      claudeData = JSON.parse(jsonMatch ? jsonMatch[0] : extractedText);
    } catch {
      claudeData = { amenities: [], hours: null };
    }

    const rehostedPhotos = snapshotPhotos.length > 0
      ? await rehostPhotos(supabase, listing_id, snapshotPhotos)
      : [];

    const extractedData: ExtractedData = {
      photos: rehostedPhotos,
      amenities: claudeData.amenities || [],
      hours: claudeData.hours || null,
    };

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/listings?id=eq.${listing_id}`,
      {
        method: "PATCH",
        headers: supabaseHeaders,
        body: JSON.stringify({
          photos: extractedData.photos,
          amenities: extractedData.amenities,
          hours: extractedData.hours,
          extracted_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update listing: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true, listing_id, extracted: extractedData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error extracting listing data:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
