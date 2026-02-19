import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!firecrawlApiKey) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { listing_id } = await req.json();

    if (!listing_id) {
      return new Response(
        JSON.stringify({ error: "listing_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, name, website")
      .eq("id", listing_id)
      .maybeSingle();

    if (fetchError || !listing) {
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listing.website) {
      return new Response(
        JSON.stringify({ error: "Listing has no website to screenshot" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scrapeResponse = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: listing.website,
        formats: [{ type: "screenshot", fullPage: false }],
        waitFor: 2000,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      throw new Error(`Firecrawl screenshot error: ${errorText}`);
    }

    const scrapeData = await scrapeResponse.json();

    const screenshotUrl: string | undefined =
      scrapeData.data?.actions?.screenshots?.[0] ||
      scrapeData.data?.screenshot;

    if (!screenshotUrl) {
      throw new Error("No screenshot returned from Firecrawl");
    }

    const imageResponse = await fetch(screenshotUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to download screenshot image");
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);

    const fileName = `${listing_id}/screenshot-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("listing-photos")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload screenshot: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("listing-photos")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    const { data: currentListing, error: fetchListingError } = await supabase
      .from("listings")
      .select("photos")
      .eq("id", listing_id)
      .maybeSingle();

    if (fetchListingError) {
      throw new Error(`Failed to fetch listing photos: ${fetchListingError.message}`);
    }

    const existingPhotos: string[] = Array.isArray(currentListing?.photos) ? currentListing.photos : [];
    const updatedPhotos = existingPhotos.includes(publicUrl)
      ? existingPhotos
      : [...existingPhotos, publicUrl];

    const { error: updateError } = await supabase
      .from("listings")
      .update({ photos: updatedPhotos })
      .eq("id", listing_id);

    if (updateError) {
      throw new Error(`Failed to update listing: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, screenshot_url: publicUrl, photos: updatedPhotos }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error taking screenshot:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to take screenshot" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
