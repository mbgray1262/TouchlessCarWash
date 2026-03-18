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
    if (buffer.byteLength < 5000) return null;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch (err) {
    console.error(`Image fetch error: ${url.slice(0, 80)} — ${err}`);
    return null;
  }
}

// Known model names per brand → normalized values for dropdown matching
const KNOWN_MODELS: Record<string, string[]> = {
  pdq: ['LaserWash 360', 'LaserWash 360 Plus', 'LaserWash 4000', 'LaserWash G5', 'LaserWash M5', 'LaserWash Sentry', 'ProTouch', 'Tandem Surfline', 'Access'],
  washworld: ['Razor', 'Razor Edge', 'Razor Touch', 'Razor XR', 'Profile'],
  belanger: ['Kondor', 'Eclipse', 'FreeStyler', 'SpinLite', 'Vector'],
  ryko: ['SoftGloss', 'SoftGloss Maxx', 'Radius'],
  istobal: ["M'NEX 22", "M'NEX 25", "M'NEX 32", 'ISTOBAL 1900'],
  ds: ['IQ 2.0 Touch Free', 'Carwash Systems'],
  petit: ['Accutrac 360i', 'Accutrac 360t', 'Accutrac Mini'],
  oasis: ['Typhoon', 'XR-1000'],
  mark_vii: ['ChoiceWash XT', 'ChoiceWash CT', 'AquaJet', 'SoftLine'],
  karcher: ['CWB 3', 'CB 1/28', 'CB 2/28', 'CB 3/32'],
  autec: ['Evolution', 'EV-1 Evolution', 'AES-425', 'Express Automatic'],
  hydrospray: ['In Bay Automatic (IBA)'],
  dencar: ['Dynawash Express'],
  super_wash: ['Supermatic', 'Supermatic II'],
};

/** Try to match the AI's model string to a known model for the brand */
function normalizeModel(brand: string, modelRaw: string): string | null {
  if (!modelRaw || modelRaw.toUpperCase() === 'NONE') return null;
  const models = KNOWN_MODELS[brand];
  if (!models || models.length === 0) return modelRaw;

  const modelLower = modelRaw.toLowerCase().replace(/[^a-z0-9 ]/g, '');

  // Try exact match first (case-insensitive)
  for (const known of models) {
    if (known.toLowerCase() === modelRaw.toLowerCase()) return known;
  }

  // Try partial match — does AI response contain a known model name?
  for (const known of models) {
    const knownLower = known.toLowerCase();
    if (modelLower.includes(knownLower) || knownLower.includes(modelLower)) return known;
  }

  // If AI just said the brand name as model (e.g. "LaserWash" for PDQ), return null
  // so it doesn't create a bogus "Other" model entry
  const brandAliases: Record<string, string[]> = {
    pdq: ['laserwash', 'laser wash', 'pdq'],
    washworld: ['washworld', 'wash world'],
    belanger: ['belanger'],
    ryko: ['ryko'],
    istobal: ['istobal'],
    super_wash: ['super wash', 'supermatic'],
  };
  const aliases = brandAliases[brand] ?? [];
  if (aliases.some(a => modelLower === a || modelLower === a.replace(/\s/g, ''))) return null;

  return modelRaw;
}

// Known equipment brand keywords → normalized values
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
  'razor': 'washworld',
  'maxar': 'maxar',
  'washman': 'washman',
  'hydro-spray': 'hydrospray',
  'hydrospray': 'hydrospray',
  'dencar': 'dencar',
  'ns corporation': 'ns_corp',
  'ns wash': 'ns_corp',
  'super wash': 'super_wash',
  'superwash': 'super_wash',
  'supermatic': 'super_wash',
};

function confidenceToInt(confidence: string): number {
  if (confidence === 'high') return 90;
  if (confidence === 'medium') return 70;
  return 40; // low
}

function normalizeBrand(brandRaw: string): string {
  const brandLower = brandRaw.toLowerCase();
  for (const [keyword, value] of Object.entries(BRAND_MAP)) {
    if (brandLower.includes(keyword)) return value;
  }
  return 'other';
}

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

const EQUIPMENT_PROMPT = `You are an expert at identifying touchless and automatic car wash equipment manufacturers from photos.

Identify the WASH EQUIPMENT manufacturer and model visible in this car wash photo.

CRITICAL RULES — READ CAREFULLY:
- You MUST be able to clearly see the wash equipment (gantry, spray arms, boom arms) in the photo to make any identification.
- If the photo only shows the EXTERIOR of a building, a parking lot, a sign, or is too far away to see equipment details, respond with BRAND: NONE.
- NEVER guess based on the business name, signage, or what brand is "most common." Only identify what you can ACTUALLY SEE in the image.
- If you can see equipment but cannot read any branding or confidently match its design to a known manufacturer, use LOW confidence.
- HIGH confidence requires: you can ACTUALLY READ text/branding on the equipment in this specific photo. Do NOT claim you can read text that is not clearly legible.
- MEDIUM confidence requires: the equipment gantry/arch is clearly visible at close range with distinctive design features that strongly suggest a specific brand.
- LOW confidence: you can see equipment but identification is uncertain — use this freely when unsure.
- NEVER fabricate or hallucinate text — if you cannot clearly read text in the image, do not claim it is there.

IDENTIFICATION METHODS (in priority order):
1. Direct branding: Text/logos on the wash gantry, spray arms, side booms, or control panel (STRONGEST evidence)
2. Integrated component branding: "MaxAir" dryer = WashWorld, "PDQ" on any component = PDQ, website URLs on signs
3. Visual design recognition: ONLY when equipment is clearly visible and has distinctive, unmistakable features

KNOWN MANUFACTURERS, MODELS, AND VISUAL IDENTIFICATION:
- PDQ: Models: LaserWash 360, LaserWash 360 Plus, LaserWash 4000, LaserWash G5, LaserWash M5, LaserWash Sentry, ProTouch, Tandem Surfline, Access. Silver/gray gantry, distinctive curved top arch, "LaserWash" text usually on front. IMPORTANT: Do NOT just say "LaserWash" — specify which model (360, G5, M5, etc). If you can't tell, say NONE for MODEL.
- WashWorld: Models: Razor, Razor Edge, Razor Touch, Razor XR, Profile. Blue and silver T-bar header, blue protective shrouds on spray arms, L-arm design, MaxAir integrated dryer.
- Belanger: Models: Kondor, Eclipse, FreeStyler, SpinLite, Vector. Sleek modern design, often white/gray.
- Ryko: Models: SoftGloss, SoftGloss Maxx, Radius. Rounded gantry design.
- Istobal: Models: M'NEX 22, M'NEX 25, M'NEX 32, ISTOBAL 1900. European design, often blue/white.
- D&S: Models: IQ 2.0 Touch Free, Carwash Systems. Green branding, "IQ 2.0" on header.
- Petit AutoWash: Models: Accutrac 360i, Accutrac 360t, Accutrac Mini. Track-based system on rails.
- Mark VII: Models: ChoiceWash XT, ChoiceWash CT, AquaJet, SoftLine. Distinctive overhead design.
- Kärcher: Models: CWB 3, CB 1/28, CB 2/28, CB 3/32. German engineering, yellow/black branding.
- Autec: Models: Evolution, EV-1 Evolution, AES-425, Express Automatic. "Evolution" text on vertical towers.
- Super Wash: Models: Supermatic, Supermatic II. "SUPER WASH" text on gantry header.
- Also: Saber, Broadway, NS Corporation, Oasis, Washman, MAXAR, Delta Sonic

CRITICAL RULES:
- SELF-SERVE BAYS are NOT touchless automatics. If you see a manual spray wand/gun, coin-operated controls on the wall, or an open bay with no overhead gantry/arch — this is a self-serve bay. Respond BRAND: NONE.
- TUNNEL/CONVEYOR washes with brushes, wraps, or cloth strips are NOT touchless. Respond BRAND: NONE.
- Only identify touchless IN-BAY AUTOMATIC equipment — these have a motorized gantry or arch that moves over a stationary car.
- Do NOT confuse the business/franchise name with the equipment manufacturer
- Car wash businesses often paint their own name on equipment — look past that
- An exterior-only photo with no visible equipment = BRAND: NONE
- A photo where equipment is too small or blurry to identify = BRAND: NONE
- When in doubt, use LOW confidence or NONE — do NOT guess
- A photo of a car being washed by water jets does NOT mean you can identify the equipment brand

Respond in this exact format:
BRAND: [manufacturer name, or NONE]
MODEL: [model name if identifiable, or NONE]
CONFIDENCE: [HIGH, MEDIUM, or LOW]
TEXT: [specific visual evidence you used — cite readable text, specific design features, or explain why you chose NONE]

If you cannot clearly see wash equipment in the photo, respond:
BRAND: NONE
MODEL: NONE
CONFIDENCE: LOW
TEXT: [explain what you see instead — exterior only, too far away, etc.]`;

// ── Gemini-based detection ──────────────────────────────────────
async function detectWithGemini(
  imageUrls: string[],
  geminiKey: string,
): Promise<DetectionAttempt> {
  // Fetch all images as base64 in parallel for speed
  const imageBlocks: Array<{ inline_data: { mime_type: string; data: string } }> = [];
  let totalBytes = 0;

  const results = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
  for (const img of results) {
    if (img) {
      imageBlocks.push({ inline_data: { mime_type: img.mediaType, data: img.base64 } });
      totalBytes += Math.ceil(img.base64.length * 3 / 4);
    }
  }

  if (imageBlocks.length === 0) {
    return { result: null, raw_ai_response: '', image_bytes: 0, error: 'no_images_loaded' };
  }

  try {
    // Send ALL images in a single request for better context
    const parts = [
      ...imageBlocks,
      { text: imageBlocks.length > 1
        ? `Here are ${imageBlocks.length} photos of the same car wash location. ${EQUIPMENT_PROMPT}`
        : EQUIPMENT_PROMPT
      },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 500,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gemini API error: ${res.status} — ${errText.slice(0, 300)}`);
      return { result: null, raw_ai_response: `HTTP ${res.status}: ${errText.slice(0, 300)}`, image_bytes: totalBytes, error: `gemini_api_error_${res.status}` };
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log(`Gemini response: ${text.slice(0, 200)}`);

    return parseDetectionResponse(text, imageUrls[0], totalBytes);
  } catch (err) {
    console.error(`Gemini detection error:`, err);
    return { result: null, raw_ai_response: '', image_bytes: totalBytes, error: String(err) };
  }
}

// ── Claude-based detection (for batch mode fallback) ─────────────
async function detectWithClaude(
  imageUrl: string,
  anthropicKey: string,
  modelId: string = 'claude-haiku-4-5-20251001',
): Promise<DetectionAttempt> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { result: null, raw_ai_response: '', image_bytes: 0, error: 'image_fetch_failed' };

  const imageBytes = Math.ceil(img.base64.length * 3 / 4);

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
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
            { type: 'text', text: EQUIPMENT_PROMPT },
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
    console.log(`Claude response for ${imageUrl.slice(-40)}: ${text.slice(0, 200)}`);

    return parseDetectionResponse(text, imageUrl, imageBytes);
  } catch (err) {
    console.error(`Claude detection error for ${imageUrl}:`, err);
    return { result: null, raw_ai_response: '', image_bytes: imageBytes, error: String(err) };
  }
}

// ── Shared response parser ──────────────────────────────────────
function parseDetectionResponse(text: string, sourceImage: string, imageBytes: number): DetectionAttempt {
  const brandMatch = text.match(/BRAND:\s*(.+)/i);
  const modelMatch = text.match(/MODEL:\s*(.+)/i);
  const confMatch = text.match(/CONFIDENCE:\s*(.+)/i);
  const rawMatch = text.match(/TEXT:\s*(.+)/im);

  const brandRaw = brandMatch?.[1]?.trim() ?? '';
  if (!brandRaw || brandRaw.toUpperCase() === 'NONE') {
    return { result: null, raw_ai_response: text, image_bytes: imageBytes };
  }

  const modelRaw = modelMatch?.[1]?.trim() ?? '';
  const confidence = (confMatch?.[1]?.trim()?.toLowerCase() ?? 'low') as 'high' | 'medium' | 'low';
  const rawText = rawMatch?.[1]?.trim() ?? brandRaw;

  const normalizedBrand = normalizeBrand(brandRaw);
  const normalizedModel = normalizeModel(normalizedBrand, modelRaw);

  const result: DetectionResult = {
    brand: normalizedBrand,
    model: normalizedModel,
    confidence,
    source_image: sourceImage,
    raw_text: rawText,
  };

  return { result, raw_ai_response: text, image_bytes: imageBytes };
}

// ── Main handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GEMINI_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');

  if (!geminiKey && !anthropicKey) {
    return new Response(JSON.stringify({ error: 'No AI API key configured (need GEMINI_API_KEY or ANTHROPIC_API_KEY)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const listingId = body.listing_id ?? null;
  const limit = body.limit ?? 500;
  const offset = body.offset ?? 0;
  const dryRun = body.dry_run ?? false;
  const skipExisting = body.skip_existing ?? true;
  const reclassify = body.reclassify ?? false;
  const reclassifyAll = body.reclassify_all ?? false;

  // ── Reclassify mode: re-run classifications through Gemini ──
  if ((reclassify || reclassifyAll) && geminiKey) {
    const batchLimit = body.limit ?? 50;
    let query = supabase
      .from('listings')
      .select('id, name, hero_image')
      .eq('is_touchless', true)
      .not('hero_image', 'is', null);

    if (!reclassifyAll) {
      // Only reclassify old Claude results
      query = query.eq('classification_source', 'claude');
    }

    const { data: listings, error } = await query
      .order('name')
      .range(offset, offset + batchLimit - 1);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ message: 'No more listings to reclassify', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let updated = 0;
    let failed = 0;
    const results: Array<{ id: string; name: string; old_brand?: string; new_brand?: string; new_model?: string; confidence?: string; status: string }> = [];

    for (const listing of listings) {
      processed++;
      try {
        const imageUrls = listing.hero_image ? [listing.hero_image] : [];
        if (imageUrls.length === 0) {
          results.push({ id: listing.id, name: listing.name, status: 'skipped_no_hero' });
          continue;
        }

        const attempt = await detectWithGemini(imageUrls, geminiKey);
        if (attempt.result && (attempt.result.confidence === 'high')) {
          if (!dryRun) {
            await supabase
              .from('listings')
              .update({
                equipment_brand: attempt.result.brand,
                equipment_model: attempt.result.model,
                classification_source: 'gemini',
                classification_confidence: confidenceToInt(attempt.result.confidence),
              })
              .eq('id', listing.id);
          }
          updated++;
          results.push({
            id: listing.id,
            name: listing.name,
            new_brand: attempt.result.brand,
            new_model: attempt.result.model,
            confidence: attempt.result.confidence,
            status: 'reclassified',
          });
        } else {
          // No detection or low/medium confidence — clear brand/model to remove hallucinations
          if (!dryRun) {
            await supabase
              .from('listings')
              .update({
                equipment_brand: null,
                equipment_model: null,
                classification_source: 'gemini_attempted',
                classification_confidence: attempt.result ? confidenceToInt(attempt.result.confidence) : null,
              })
              .eq('id', listing.id);
          }
          results.push({ id: listing.id, name: listing.name, status: 'cleared_no_confident_detection' });
        }
      } catch (err) {
        failed++;
        results.push({ id: listing.id, name: listing.name, status: `error: ${err.message}` });
      }

      // Small delay to avoid rate limiting
      if (processed < listings.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('classification_source', 'claude')
      .eq('is_touchless', true)
      .not('hero_image', 'is', null);

    return new Response(JSON.stringify({
      mode: 'reclassify',
      processed,
      updated,
      failed,
      remaining: (remaining ?? 0) - updated,
      dry_run: dryRun,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Single-listing mode (uses Gemini with all images) ────────
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

    // Only classify the hero image — the user has already selected the best equipment shot
    const imageUrls: string[] = [];
    if (single.hero_image) imageUrls.push(single.hero_image);

    // Use Gemini (preferred) or fall back to Claude
    let attempt: DetectionAttempt;
    let engine = 'gemini';

    if (geminiKey) {
      attempt = await detectWithGemini(imageUrls, geminiKey);
    } else {
      engine = 'claude';
      // Fall back: try each image with Claude
      let bestAttempt: DetectionAttempt = { result: null, raw_ai_response: '', image_bytes: 0 };
      for (const url of imageUrls) {
        const a = await detectWithClaude(url, anthropicKey!);
        if (a.result && (!bestAttempt.result ||
            (a.result.confidence === 'high' && bestAttempt.result?.confidence !== 'high'))) {
          bestAttempt = a;
          if (a.result.confidence === 'high') break;
        }
        if (!bestAttempt.raw_ai_response && a.raw_ai_response) bestAttempt = a;
        await new Promise(r => setTimeout(r, 200));
      }
      attempt = bestAttempt;
    }

    const bestResult = attempt.result;

    if (bestResult && !dryRun && (bestResult.confidence === 'high')) {
      await supabase
        .from('listings')
        .update({
          equipment_brand: bestResult.brand,
          equipment_model: bestResult.model,
          classification_source: 'gemini',
          classification_confidence: confidenceToInt(bestResult.confidence),
        })
        .eq('id', single.id);
    }

    return new Response(JSON.stringify({
      listing_id: single.id,
      name: single.name,
      engine,
      images_scanned: imageUrls.length,
      image_urls: imageUrls,
      diagnostics: [{
        status: attempt.result ? 'detected' : (attempt.error ?? 'no_detection'),
        raw_ai_response: attempt.raw_ai_response,
        image_bytes: attempt.image_bytes,
        detail: attempt.result ? `${attempt.result.brand}/${attempt.result.model} [${attempt.result.confidence}]` : undefined,
      }],
      detection: bestResult ? {
        brand: bestResult.brand,
        model: bestResult.model,
        confidence: bestResult.confidence,
        source_image: bestResult.source_image,
        raw_text: bestResult.raw_text,
      } : null,
      saved: bestResult && !dryRun && (bestResult.confidence === 'high'),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Batch mode (uses Claude Haiku for cost efficiency) ────────
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'Batch mode requires ANTHROPIC_API_KEY' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  let processed = 0;
  let imagesScanned = 0;
  let detected = 0;

  for (const listing of listings) {
    processed++;

    const imageUrls: string[] = [];
    if (listing.hero_image) imageUrls.push(listing.hero_image);
    if (listing.google_photo_url && listing.google_photo_url !== listing.hero_image) {
      imageUrls.push(listing.google_photo_url);
    }
    if (listing.street_view_url && !imageUrls.includes(listing.street_view_url)) {
      imageUrls.push(listing.street_view_url);
    }
    const gallery = (listing.photos ?? []).filter((p: string) => !imageUrls.includes(p));
    imageUrls.push(...gallery.slice(0, 3));

    let bestResult: DetectionResult | null = null;

    for (const url of imageUrls) {
      imagesScanned++;
      const attempt = await detectWithClaude(url, anthropicKey);

      if (attempt.result) {
        if (!bestResult ||
            (attempt.result.confidence === 'high' && bestResult.confidence !== 'high') ||
            (attempt.result.confidence === 'medium' && bestResult.confidence === 'low')) {
          bestResult = attempt.result;
        }
        if (attempt.result.confidence === 'high') break;
      }

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

      if (!dryRun && (bestResult.confidence === 'high')) {
        await supabase
          .from('listings')
          .update({
            equipment_brand: bestResult.brand,
            equipment_model: bestResult.model,
            classification_source: 'gemini',
            classification_confidence: confidenceToInt(bestResult.confidence),
          })
          .eq('id', listing.id);
      }
    }

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
  };

  console.log(`Done! ${detected}/${processed} listings had detectable equipment (${summary.detection_rate})`);

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
