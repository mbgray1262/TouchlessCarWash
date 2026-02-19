import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UploadPhoto {
  index: number;
  data: string;
  contentType: string;
}

interface RehostRequest {
  listing_id: string;
  photos: UploadPhoto[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { listing_id, photos }: RehostRequest = await req.json();

    if (!listing_id || !photos || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "listing_id and photos are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const rehostedUrls: { index: number; url: string }[] = [];

    for (const photo of photos) {
      const ext = photo.contentType === "image/png" ? "png" : "jpg";
      const storagePath = `${listing_id}/${photo.index}.${ext}`;

      const base64Data = photo.data.includes(",") ? photo.data.split(",")[1] : photo.data;

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from("listing-photos")
        .upload(storagePath, bytes, {
          contentType: photo.contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`Failed to upload photo ${photo.index}:`, uploadError.message);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("listing-photos")
        .getPublicUrl(storagePath);

      rehostedUrls.push({ index: photo.index, url: publicUrlData.publicUrl });
    }

    return new Response(
      JSON.stringify({ success: true, uploaded: rehostedUrls }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error rehosting photos:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
