import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.error(`Image fetch failed (${res.status}): ${url.slice(0, 80)}`);
      return null;
    }
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return null; // skip tiny images
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch (err) {
    console.error(`Image fetch error: ${url.slice(0, 80)} — ${err}`);
    return null;
  }
}

// Known equipment brand keywords to look for
const BRAND_MAP: Record<string, string> = {
  'laserwash': 'pdq',
  'laser wash': 'pdq',
  'pdq': 'pdq',
  'pdqinc': 'pdq',
  'washworld': 'washworld',
  'wash world': 'washworld',
  'belanger': 'belanger',
  'ryko': 'ryko',
  'istobal': 'istobal',
  'petit': 'petit',
  'petit autowash': 'petit',
  'oasis': 'oasis',
  'mark vii': 'mark_vii',
  'markvii': 'mark_vii',
  'karcher': 'karcher',
  'kärcher': 'karcher',
  'autec': 'autec',
  'saber': 'saber',
  'd&s': 'ds',
  'broadway': 'broadway',
  'razor': 'washworld', // Razor is a WashWorld product
  'maxar': 'maxar',
  'washman': 'washman',
  'hydro-spray': 'hydrospray',
  'dencar': 'dencar',
  'ns corporation': 'ns_corp',
};

interface DetectionResult {
  brand: string | null;
  model: string | null;
  confidence: 'high' | 'medium' | 'low';
  source_image: string;
  raw_text: string;
}

interface DetectionAttempt {
  result: DetectionResult | null;
  raw_ai_response: string;
  image_bytes: number;
  error?: string;
}

async function detectEquipmentInImage(
  imageUrl: string,
  anthropicKey: string,
  modelId: string = 'claude-haiku-4-5-20251001',
): Promise<DetectionAttempt> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { result: null, raw_ai_response: '', image_bytes: 0, error: 'image_fetch_failed' };

  const imageBytes = Math.ceil(img.base64.length * 3 / 4); // approximate decoded size

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
            },
            {
              type: 'text',
              text: `Look at this car wash photo carefully. Identify the WASH EQUIPMENT manufacturer — the machine that actually washes the car (the touchless gantry, spray arms, or friction wash arch).

IMPORTANT DISTINCTIONS:
- We want the WASH EQUIPMENT brand (the machine that sprays water/chemicals on the car)
- IGNORE drying equipment brands (like MaxAir, AirDry, etc.) — those are dryers, not wash equipment
- IGNORE business signs, building signs, or franchise names
- IGNORE fragrance/vending machine brands

Common wash equipment manufacturers:
LaserWash (by PDQ), PDQ, WashWorld, Razor (by WashWorld), Belanger, Ryko, Istobal, Petit AutoWash, Oasis, Mark VII, Kärcher, Autec, Saber, D&S, Broadway, NS Corporation, Washman, MAXAR

Look for branding text on:
- The main wash gantry/arch that moves over the car
- Side booms or spray arms
- The control panel or payment terminal
- Website URLs like pdqinc.com, washworldinc.com, etc.

Respond in this exact format:
BRAND: [wash equipment brand name, or NONE]
MODEL: [model name/number if visible, or NONE]
CONFIDENCE: [HIGH if text clearly readable, MEDIUM if partially visible, LOW if uncertain]
TEXT: [exact text you can read on the wash equipment]

If you cannot identify the WASH equipment brand (only see dryer brands, business signs, etc.), respond:
BRAND: NONE`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Anthropic API error: ${res.status} — ${errText.slice(0, 200)}`);
      return { result: null, raw_ai_response: `HTTP ${res.status}: ${errText.slice(0, 200)}`, image_bytes: imageBytes, error: `api_error_${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    console.log(`AI response for ${imageUrl.slice(-40)}: ${text.slice(0, 200)}`);

    // Parse response
    const brandMatch = text.match(/BRAND:\s*(.+)/i);
    const modelMatch = text.match(/MODEL:\s*(.+)/i);
    const confMatch = text.match(/CONFIDENCE:\s*(.+)/i);
    const rawMatch = text.match(/TEXT:\s*(.+)/i);

    const brandRaw = brandMatch?.[1]?.trim() ?? '';
    if (!brandRaw || brandRaw.toUpperCase() === 'NONE') {
      return { result: null, raw_ai_response: text, image_bytes: imageBytes };
    }

    const modelRaw = modelMatch?.[1]?.trim() ?? '';
    const confidence = (confMatch?.[1]?.trim()?.toLowerCase() ?? 'low') as 'high' | 'medium' | 'low';
    const rawText = rawMatch?.[1]?.trim() ?? brandRaw;

    // Normalize brand to our standard values
    let normalizedBrand: string | null = null;
    const brandLower = brandRaw.toLowerCase();
    for (const [keyword, value] of Object.entries(BRAND_MAP)) {
      if (brandLower.includes(keyword)) {
        normalizedBrand = value;
        break;
      }
    }

    if (!normalizedBrand) {
      normalizedBrand = 'other';
    }

    const result: DetectionResult = {
      brand: normalizedBrand,
      model: modelRaw && modelRaw.toUpperCase() !== 'NONE' ? modelRaw : null,
      confidence,
      source_image: imageUrl,
      raw_text: rawText,
    };

    return { result, raw_ai_response: text, image_bytes: imageBytes };
  } catch (err) {
    console.error(`Detection error for ${imageUrl}:`, err);
    return { result: null, raw_ai_response: '', image_bytes: imageBytes, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'No Anthropic API key' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const listingId = body.listing_id ?? null; // Single listing mode
  const limit = body.limit ?? 500;
  const offset = body.offset ?? 0;
  const dryRun = body.dry_run ?? false;
  const skipExisting = body.skip_existing ?? true;

  // ── Single-listing mode ────────────────────────────────────────
  if (listingId) {
    const { data: single, error: singleErr } = await supabase
      .from('listings')
      .select('id, name, hero_image, photos, google_photo_url, street_view_url, equipment_brand')
      .eq('id', listingId)
      .maybeSingle();

    if (singleErr || !single) {
      return new Response(JSON.stringify({ error: singleErr?.message ?? 'Listing not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all images
    const imageUrls: string[] = [];
    if (single.hero_image) imageUrls.push(single.hero_image);
    if (single.google_photo_url && single.google_photo_url !== single.hero_image) imageUrls.push(single.google_photo_url);
    if (single.street_view_url && !imageUrls.includes(single.street_view_url)) imageUrls.push(single.street_view_url);
    const gallery = (single.photos ?? []).filter((p: string) => !imageUrls.includes(p));
    imageUrls.push(...gallery.slice(0, 3));

    let bestResult: DetectionResult | null = null;
    // Use Sonnet for single-listing interactive mode (better accuracy, only 1-2 images)
    const singleModel = 'claude-sonnet-4-6';
    const diagnostics: Array<{ url: string; status: string; raw_ai_response: string; image_bytes: number; detail?: string }> = [];
    for (const url of imageUrls) {
      const attempt = await detectEquipmentInImage(url, anthropicKey, singleModel);
      if (attempt.result) {
        diagnostics.push({ url: url.slice(-80), status: 'detected', raw_ai_response: attempt.raw_ai_response, image_bytes: attempt.image_bytes, detail: `${attempt.result.brand}/${attempt.result.model} [${attempt.result.confidence}]` });
        if (!bestResult ||
            (attempt.result.confidence === 'high' && bestResult.confidence !== 'high') ||
            (attempt.result.confidence === 'medium' && bestResult.confidence === 'low')) {
          bestResult = attempt.result;
        }
        if (attempt.result.confidence === 'high') break;
      } else {
        diagnostics.push({ url: url.slice(-80), status: attempt.error ?? 'no_detection', raw_ai_response: attempt.raw_ai_response, image_bytes: attempt.image_bytes });
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (bestResult && !dryRun && (bestResult.confidence === 'high' || bestResult.confidence === 'medium')) {
      await supabase
        .from('listings')
        .update({ equipment_brand: bestResult.brand, equipment_model: bestResult.model })
        .eq('id', single.id);
    }

    return new Response(JSON.stringify({
      listing_id: single.id,
      name: single.name,
      images_scanned: imageUrls.length,
      image_urls: imageUrls,
      diagnostics,
      detection: bestResult ? {
        brand: bestResult.brand,
        model: bestResult.model,
        confidence: bestResult.confidence,
        source_image: bestResult.source_image,
        raw_text: bestResult.raw_text,
      } : null,
      saved: bestResult && !dryRun && (bestResult.confidence === 'high' || bestResult.confidence === 'medium'),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Batch mode (original behavior) ─────────────────────────────
  // Fetch touchless listings with images but no equipment_brand yet
  // Order by photo_enrichment_attempted_at DESC so we get the most photo-rich listings first
  let query = supabase
    .from('listings')
    .select('id, name, hero_image, photos, google_photo_url, street_view_url, equipment_brand')
    .eq('is_touchless', true)
    .not('hero_image', 'is', null)
    .order('photo_enrichment_attempted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (skipExisting) {
    query = query.is('equipment_brand', null);
  }

  const { data: listings, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Processing ${listings.length} listings (limit=${limit}, dryRun=${dryRun})`);

  const results: Array<{
    listing_id: string;
    name: string;
    brand: string;
    model: string | null;
    confidence: string;
    source_image: string;
    raw_text: string;
  }> = [];

  const debugResponses: Array<{ listing: string; image: string; response: string }> = [];

  let processed = 0;
  let imagesScanned = 0;
  let detected = 0;

  for (const listing of listings) {
    processed++;

    // Collect all images for this listing
    const imageUrls: string[] = [];
    if (listing.hero_image) imageUrls.push(listing.hero_image);
    if (listing.google_photo_url && listing.google_photo_url !== listing.hero_image) {
      imageUrls.push(listing.google_photo_url);
    }
    if (listing.street_view_url && !imageUrls.includes(listing.street_view_url)) {
      imageUrls.push(listing.street_view_url);
    }
    // Add gallery photos (up to 3 per listing to keep costs/memory down)
    const gallery = (listing.photos ?? []).filter((p: string) => !imageUrls.includes(p));
    imageUrls.push(...gallery.slice(0, 3));

    let bestResult: DetectionResult | null = null;

    for (const url of imageUrls) {
      imagesScanned++;
      const attempt = await detectEquipmentInImage(url, anthropicKey);

      // Capture debug info for first 5 listings
      if (processed <= 5) {
        debugResponses.push({
          listing: listing.name,
          image: url.slice(-60),
          response: attempt.result ? `${attempt.result.brand}/${attempt.result.model} [${attempt.result.confidence}]` : 'NONE',
        });
      }

      if (attempt.result) {
        // Keep highest confidence result
        if (!bestResult ||
            (attempt.result.confidence === 'high' && bestResult.confidence !== 'high') ||
            (attempt.result.confidence === 'medium' && bestResult.confidence === 'low')) {
          bestResult = attempt.result;
        }
        // If we found a high confidence match, no need to scan more images
        if (attempt.result.confidence === 'high') break;
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    if (bestResult) {
      detected++;
      results.push({
        listing_id: listing.id,
        name: listing.name,
        brand: bestResult.brand!,
        model: bestResult.model,
        confidence: bestResult.confidence,
        source_image: bestResult.source_image,
        raw_text: bestResult.raw_text,
      });

      // Only save high/medium confidence results, unless dry run
      if (!dryRun && (bestResult.confidence === 'high' || bestResult.confidence === 'medium')) {
        await supabase
          .from('listings')
          .update({
            equipment_brand: bestResult.brand,
            equipment_model: bestResult.model,
          })
          .eq('id', listing.id);
      }
    }

    // Log progress every 50 listings
    if (processed % 50 === 0) {
      console.log(`Progress: ${processed}/${listings.length} listings, ${imagesScanned} images scanned, ${detected} detections`);
    }
  }

  const summary = {
    listings_processed: processed,
    images_scanned: imagesScanned,
    equipment_detected: detected,
    detection_rate: `${((detected / processed) * 100).toFixed(1)}%`,
    dry_run: dryRun,
    detections: results,
    debug_responses: debugResponses.slice(0, 30),
  };

  console.log(`Done! ${detected}/${processed} listings had detectable equipment (${summary.detection_rate})`);

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
