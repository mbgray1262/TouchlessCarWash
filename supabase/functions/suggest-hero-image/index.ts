import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SuggestRequest {
  listing_id: string;
  photos: string[];
  listing_name: string;
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

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.split(";")[0].trim();
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { base64, mediaType };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { listing_id, photos, listing_name }: SuggestRequest = await req.json();

    if (!listing_id || !photos || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "listing_id and photos are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anthropicKey = await getAnthropicKey(supabaseUrl, supabaseKey);

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const MAX_IMAGES = 12;
    const photosToAnalyze = photos.slice(0, MAX_IMAGES);

    const imageResults = await Promise.all(
      photosToAnalyze.map((url) => fetchImageAsBase64(url))
    );

    const validImages: Array<{ index: number; url: string; base64: string; mediaType: string }> = [];
    for (let i = 0; i < photosToAnalyze.length; i++) {
      const result = imageResults[i];
      if (result) {
        validImages.push({ index: i, url: photosToAnalyze[i], base64: result.base64, mediaType: result.mediaType });
      }
    }

    if (validImages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, no_good_photos: true, reason: "Could not load any photos." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageContentBlocks = validImages.flatMap(({ index, base64, mediaType }) => [
      {
        type: "text",
        text: `Image ${index + 1} (index ${index}):`,
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      },
    ]);

    const prompt = `You are a strict photo quality-control AI for a car wash business directory site called TouchlessCarWash.com.

The business is called: "${listing_name}"

You have been given ${validImages.length} photo(s) to review (indices: ${validImages.map(v => v.index).join(", ")}).

## GOLDEN RULE — WHEN IN DOUBT, BLOCK IT

An image is only APPROVED if ALL three conditions are simultaneously true:
  1. It is a REAL PHOTOGRAPH taken by a physical camera (not a digital illustration, render, or design file).
  2. It shows a real physical location connected to this car wash.
  3. The primary visible subject is the car wash building exterior, a car inside the wash tunnel/bay, wash equipment in action, or the surrounding property/lot.

If ANY condition fails, the image is BLOCKED — no exceptions.

## ALWAYS BLOCK — zero tolerance, no exceptions:

### Logos & Brand Graphics (BLOCK ALL)
  - Any image that is primarily a logo, wordmark, brand badge, or brand icon
  - Business name text styled as a graphic or badge (e.g. "Car Wash Queen" in decorative font on a plain/transparent background)
  - Shield shapes, diamond shapes, oval shapes, or any graphic frame containing business name or crown/star graphics
  - Crown icons, star bursts, sparkle graphics, or decorative flourishes on their own or as part of a logo
  - Any graphic where text + decorative element IS the primary content

### Illustrations & Clip Art (BLOCK ALL)
  - Vector-style line art of any subject (cars, buildings, equipment, people, objects)
  - Clip art, icon graphics, flat design illustrations, or cartoon-style artwork
  - Any image that looks like it was created in a design tool (Adobe Illustrator, Canva) rather than photographed
  - Images with flat colors, crisp geometric outlines, or no photographic depth/texture

### Other blocked types
  - Abstract patterns, solid color backgrounds, gradient images
  - Maps, location pins, geographic graphics
  - Promotional banners, advertisement graphics, pricing menus, text-heavy images
  - People portraits, selfies, group photos where car wash is not the primary subject
  - Animals, mascots, random objects
  - Screenshots of websites, apps, or social media
  - Images of physical-contact wash equipment: brushes, mops, cloth strips, wash mitts, rollers
  - Dark, blurry, very low resolution, or corrupt images

## For APPROVED real photographs, pick the single best hero:
  - Prefer: daytime exterior shot of the car wash building or a car actively going through the touchless wash tunnel
  - Prefer wide/landscape orientation that works well as a banner
  - Prefer good lighting, sharp focus, and professional appearance

## Output
Respond ONLY with valid JSON in this exact format:
{
  "suggested_index": 0,
  "blocked_indices": [1, 2, 3, 4],
  "no_good_photos": false,
  "reason": "Brief explanation"
}

- "suggested_index": 0-based index of the best approved photo. Set to -1 if no_good_photos is true.
- "blocked_indices": 0-based indices of ALL blocked photos. When in doubt, BLOCK IT.
- "no_good_photos": true if every photo should be blocked (no real car wash photos exist).
- "reason": one sentence explaining your hero choice and what types of images were blocked.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              ...imageContentBlocks,
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      throw new Error(`Anthropic API error: ${errorText}`);
    }

    const anthropicData = await anthropicResponse.json();
    const responseText = anthropicData.content[0].text;

    let suggestion: {
      suggested_index: number;
      blocked_indices: number[];
      no_good_photos: boolean;
      reason: string;
    };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      suggestion = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch {
      suggestion = {
        suggested_index: 0,
        blocked_indices: [],
        no_good_photos: false,
        reason: "Could not parse AI suggestion, defaulting to first photo.",
      };
    }

    const blockedIndices: number[] = (suggestion.blocked_indices || []).filter(
      (i) => typeof i === "number" && i >= 0 && i < photos.length
    );
    const blockedUrls = blockedIndices.map((i) => photos[i]);

    const allBlocked = suggestion.no_good_photos === true ||
      blockedIndices.length >= validImages.length;

    if (allBlocked) {
      return new Response(
        JSON.stringify({
          success: true,
          no_good_photos: true,
          suggested_url: null,
          suggested_index: -1,
          blocked_urls: photos,
          reason: suggestion.reason,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clampedIndex = Math.max(0, Math.min(suggestion.suggested_index, photos.length - 1));
    const suggestedUrl = photos[clampedIndex];

    return new Response(
      JSON.stringify({
        success: true,
        no_good_photos: false,
        suggested_url: suggestedUrl,
        suggested_index: clampedIndex,
        blocked_urls: blockedUrls,
        reason: suggestion.reason,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error suggesting hero image:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
