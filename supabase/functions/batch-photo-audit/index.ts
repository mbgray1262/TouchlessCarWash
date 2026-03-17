import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MAX_GALLERY_PHOTOS = 5;

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
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return null;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mediaType };
  } catch {
    return null;
  }
}

// ---- Google Photo Enrichment utilities (from gallery-backfill) ----

async function fetchGooglePlacePhotoUrls(
  placeId: string,
  googleApiKey: string,
  existingPhotos: string[],
  maxFetch: number,
): Promise<string[]> {
  const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${googleApiKey}`;
  const res = await fetch(detailsUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = await res.json() as {
    photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  };

  const photos = data.photos ?? [];
  if (photos.length === 0) return [];

  const urls: string[] = [];
  for (const photo of photos) {
    if (urls.length >= maxFetch) break;
    const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=1600&maxWidthPx=1600&key=${googleApiKey}`;
    const mediaRes = await fetch(mediaUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!mediaRes.ok) continue;
    const finalUrl = mediaRes.url;
    if (!finalUrl) continue;
    if (existingPhotos.includes(finalUrl)) continue;
    urls.push(finalUrl);
  }

  return urls;
}

async function classifyPhotoWithClaude(
  imageUrl: string,
  apiKey: string,
  approvedUrls: string[] = [],
): Promise<{ verdict: 'GOOD_EQUIPMENT' | 'GOOD' | 'BAD_CONTACT' | 'BAD_OTHER'; reason: string }> {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image' };

  const refImages = (await Promise.all(
    approvedUrls.slice(0, 3).map(u => fetchImageAsBase64(u))
  )).filter((x): x is { base64: string; mediaType: string } => x !== null);

  const dedupClause = refImages.length > 0
    ? '\nAlso reject this photo (as BAD_OTHER) if it shows essentially the same view as any of the already-approved photos shown above — we want visual variety, not multiple shots of the same angle.'
    : '';

  const prompt = `You are selecting photos for a TOUCHLESS car wash directory listing. Be GENEROUS — having some photos is much better than having none.

GOOD_EQUIPMENT — Use this verdict (highest priority!) if you can see touchless car wash equipment:
- Overhead wash gantries, arches, or spray arms (PDQ LaserWash, WashWorld Razor, Belanger, Ryko, etc.)
- Visible manufacturer branding/logos on equipment (NOT the business sign)
- A car inside a touchless wash bay with nozzles/spray arches visible
- Close-up of touchless wash equipment showing identifiable features
This is the MOST VALUABLE type of photo for our directory.

GOOD — Accept if ANY of these are true:
- A car wash building, bay, tunnel, canopy, or sign is visible anywhere in the photo (it does NOT need to be the main subject)
- The photo is taken from a road or parking lot but you can see a car wash business in the scene
- A car is entering, inside, or exiting a wash bay
- A car wash sign, menu board, or price sign is shown
- The photo shows the exterior of a business that is clearly a car wash
When in doubt, lean toward GOOD. A mediocre photo of the right place is better than no photo.

BAD_CONTACT — Reject ONLY if you can clearly see brushes, cloth strips, foam rollers, or spinning mops physically making contact with a car's surface.

BAD_OTHER — Reject ONLY if:
- The photo has absolutely nothing to do with a car wash (food, random products, landscapes with no business)
- It is a close-up of a car body (hood, bumper, wheel) with NO car wash facility visible at all
- Interior of a car (dashboard, seats) with no wash visible
- A selfie or group photo with no car wash visible
- A logo, graphic, clip art, or promotional flyer (not a real photograph)
- So blurry or dark that you cannot tell what is in the photo at all${dedupClause}

Reply with ONLY: VERDICT: one-sentence reason`;

  const refBlocks = refImages.flatMap((r, i) => [
    { type: 'text' as const, text: `Already-approved photo ${i + 1}:` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: r.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: r.base64 } },
  ]);

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            ...refBlocks,
            { type: 'text', text: refImages.length > 0 ? 'Now evaluate this new candidate photo:' : '' },
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
            { type: 'text', text: prompt },
          ].filter(b => b.type !== 'text' || (b as {type: string; text: string}).text !== ''),
        }],
      }),
    });

    if (res.status === 529 || res.status === 503 || res.status === 429) {
      if (attempt < maxAttempts) {
        const delay = 2000 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { verdict: 'BAD_OTHER', reason: 'Claude overloaded' };
    }

    if (!res.ok) return { verdict: 'BAD_OTHER', reason: `Claude error ${res.status}` };
    const data = await res.json() as { content: Array<{ text: string }> };
    const text = (data.content?.[0]?.text ?? '').trim();
    const clean = text.replace(/^VERDICT:\s*/i, '').trim();

    if (clean.startsWith('GOOD_EQUIPMENT')) return { verdict: 'GOOD_EQUIPMENT', reason: clean.replace(/^GOOD_EQUIPMENT[:\s-]*/i, '').trim() };
    if (clean.startsWith('GOOD')) return { verdict: 'GOOD', reason: clean.replace(/^GOOD[:\s-]*/i, '').trim() };
    if (clean.startsWith('BAD_CONTACT')) return { verdict: 'BAD_CONTACT', reason: clean.replace(/^BAD_CONTACT[:\s-]*/i, '').trim() };
    return { verdict: 'BAD_OTHER', reason: clean.replace(/^BAD_OTHER[:\s-]*/i, '').trim() };
  }

  return { verdict: 'BAD_OTHER', reason: 'Max retries exceeded' };
}

async function rehostToStorage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  listingId: string,
  slot: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 1000) return null;
    const path = `listings/${listingId}/${slot}.${ext}`;
    const { error } = await supabase.storage.from('listing-photos').upload(path, buffer, {
      contentType: mediaType,
      upsert: true,
    });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('listing-photos').getPublicUrl(path);
    return publicUrl;
  } catch {
    return null;
  }
}

// ---- Equipment brand normalization ----

const BRAND_MAP: Record<string, string> = {
  'laserwash': 'pdq', 'laser wash': 'pdq', 'pdq': 'pdq', 'pdqinc': 'pdq',
  'washworld': 'washworld', 'wash world': 'washworld',
  'belanger': 'belanger', 'ryko': 'ryko', 'istobal': 'istobal',
  'petit': 'petit', 'petit autowash': 'petit',
  'oasis': 'oasis', 'mark vii': 'mark_vii', 'markvii': 'mark_vii',
  'karcher': 'karcher', 'kärcher': 'karcher', 'autec': 'autec',
  'saber': 'saber', 'd&s': 'ds', 'broadway': 'broadway',
  'razor': 'washworld', 'hydro-spray': 'hydrospray', 'hydrospray': 'hydrospray',
  'dencar': 'dencar', 'ns corp': 'ns_corp', 'econocraft': 'econocraft',
  'shinewash': 'shinewash', 'super wash': 'super_wash',
  'delta sonic': 'delta_sonic', 'superior': 'superior',
};

function normalizeBrand(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  for (const [keyword, value] of Object.entries(BRAND_MAP)) {
    if (lower.includes(keyword)) return value;
  }
  return null;
}

// ---- Sonnet audit prompt and function ----

const AUDIT_PROMPT = `You are auditing photos for a touchless car wash directory listing. You will see multiple photos from the same listing. Analyze ALL of them and provide a structured assessment.

## TASK 1: Equipment Identification
Look at ALL photos for visible car wash equipment branding, logos, or text. Look specifically for:
- Text/logos on the wash gantry, arch, or spray arms (NOT the business sign)
- Manufacturer names: LaserWash, PDQ, WashWorld, Razor, Belanger, Ryko, Istobal, D&S, Petit, Oasis, Mark VII, Karcher, Autec, Saber, Broadway, Hydro-Spray, Dencar, NS Corporation, Econocraft, Shinewash

VISUAL IDENTIFICATION GUIDE (when text is not readable):
- PDQ LaserWash 360 Plus: Overhead arch with LED light strips (LaserGlow feature), modern curved design, often blue/purple LED glow
- PDQ LaserWash 360: Similar arch but NO LED strips, older/blockier design
- PDQ LaserWash G5: Compact gantry, lower profile than 360 series
- PDQ LaserWash M5: Mid-range gantry, between G5 and 360 in size
- WashWorld Razor: Distinctive T-bar spray arm system that circles the vehicle, blue LED lighting common
- WashWorld Razor Edge: Similar to Razor but more compact/modern
- D&S IQ 2.0: Green branding, "IQ 2.0" prominently on header panel
- Belanger Kondor: Large overhead gantry with distinctive wing-like spray arms
- Petit Accutrac: Track-based system with equipment moving on rails
- Mark VII ChoiceWash: Compact gantry design, often in smaller bays

## TASK 2: Hero Image Quality
Photo at index 0 is the current hero image. Rate it:
- "good": Clear photo where the car wash facility is the main subject (building exterior, car in wash bay, tunnel interior)
- "acceptable": Shows the car wash but not ideal (distant shot, partially obscured, dark but identifiable)
- "poor": Does NOT show the car wash well (logo/graphic, close-up of car, blurry, wrong business, self-serve wand bay, clip art)

If the hero is poor, identify which other photo (if any) would make a better hero.
HERO PREFERENCE ORDER: (1) A clear photo showing identifiable touchless equipment is the BEST hero — it serves double duty as both an attractive hero AND equipment identification. (2) A clear daytime exterior shot of the car wash facility. (3) Any other clear photo of the business.

## TASK 3: Photo Quality Assessment
For EACH photo, determine if it should be kept or removed:
- KEEP: Real photographs of the car wash facility, equipment, building, or cars being washed
- REMOVE: Logos, graphics, illustrations, clip art, blurry/dark images, photos of wrong business, duplicate angles of same view, extremely low quality

Respond ONLY with valid JSON in this exact format:
{
  "equipment": {
    "brand": "PDQ" or null,
    "model": "LaserWash 360 Plus" or null,
    "confidence": "high" or "medium" or "low",
    "source_photo_index": 2,
    "visible_text": "text seen on equipment" or null
  },
  "hero_assessment": {
    "current_hero_quality": "good" or "acceptable" or "poor",
    "best_photo_index": 0,
    "reason": "one sentence explanation"
  },
  "photo_verdicts": [
    {"index": 0, "keep": true, "reason": "brief reason"},
    {"index": 1, "keep": false, "reason": "brief reason"}
  ]
}

Rules:
- If no equipment is identifiable in ANY photo, set equipment.brand to null
- Do NOT guess equipment based on the business name
- "confidence" should be "high" only when you can clearly read brand/model text or see highly distinctive equipment features
- For hero assessment, prefer daytime exterior building shots or clear in-bay equipment photos
- Photo verdicts MUST include one entry per photo`;

interface AuditResult {
  equipment: {
    brand: string | null;
    model: string | null;
    confidence: string;
    source_photo_index: number | null;
    visible_text: string | null;
  };
  hero_assessment: {
    current_hero_quality: string;
    best_photo_index: number;
    reason: string;
  };
  photo_verdicts: Array<{
    index: number;
    keep: boolean;
    reason: string;
  }>;
}

async function auditListing(
  photoUrls: string[],
  listingName: string,
  anthropicKey: string,
): Promise<AuditResult | null> {
  const images = await Promise.all(photoUrls.map(u => fetchImageAsBase64(u)));
  const validImages = images.map((img, i) => ({ img, i })).filter(({ img }) => img !== null);

  if (validImages.length === 0) return null;

  const imageContentBlocks = validImages.flatMap(({ img, i }) => [
    { type: 'text' as const, text: `Photo ${i} (index ${i}):` },
    {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img!.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img!.base64,
      },
    },
  ]);

  const fullPrompt = `Business name: "${listingName}"\nTotal photos: ${validImages.length} (indices: ${validImages.map(v => v.i).join(', ')})\n\n${AUDIT_PROMPT}`;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              ...imageContentBlocks,
              { type: 'text', text: fullPrompt },
            ],
          }],
        }),
      });

      if (res.status === 529 || res.status === 503 || res.status === 429) {
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 15000 * attempt));
          continue;
        }
        console.error(`API overloaded after ${maxRetries} retries`);
        return null;
      }

      if (!res.ok) {
        console.error(`Anthropic API error: ${res.status}`);
        return null;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text ?? '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`Could not parse JSON from response: ${text.slice(0, 200)}`);
        return null;
      }

      return JSON.parse(jsonMatch[0]) as AuditResult;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
        continue;
      }
      console.error(`Audit error: ${err}`);
      return null;
    }
  }
  return null;
}

// ---- Google photo enrichment for a single listing ----

async function enrichListingWithGooglePhotos(
  supabase: ReturnType<typeof createClient>,
  listing: {
    id: string;
    photos: string[] | null;
    hero_image: string | null;
    blocked_photos: string[] | null;
    google_place_id: string;
  },
  anthropicKey: string,
  googleApiKey: string,
): Promise<{ photosAdded: number; photosScreened: number; updatedPhotos: string[]; updatedHero: string | null }> {
  const currentPhotos: string[] = (listing.photos as string[]) ?? [];
  const heroImage: string | null = (listing.hero_image as string | null) ?? null;
  const blockedPhotos: string[] = (listing.blocked_photos as string[]) ?? [];

  const heroNeedsUpgrade = !heroImage
    || heroImage.includes('streetviewpixels')
    || heroImage.includes('street_view');

  const existingUrls = [...currentPhotos, ...(heroImage ? [heroImage] : []), ...blockedPhotos];

  const needed = MAX_GALLERY_PHOTOS - currentPhotos.length;
  if (needed <= 0 && !heroNeedsUpgrade) {
    return { photosAdded: 0, photosScreened: 0, updatedPhotos: currentPhotos, updatedHero: null };
  }

  const fetchCount = Math.min(15, needed + 2);
  const placePhotoUrls = await fetchGooglePlacePhotoUrls(
    listing.google_place_id,
    googleApiKey,
    existingUrls,
    fetchCount,
  );

  if (placePhotoUrls.length === 0) {
    return { photosAdded: 0, photosScreened: 0, updatedPhotos: currentPhotos, updatedHero: null };
  }

  let photosScreened = 0;
  const newApprovedEquipment: string[] = [];
  const newApprovedOther: string[] = [];

  for (const url of placePhotoUrls) {
    if (currentPhotos.length + newApprovedEquipment.length + newApprovedOther.length >= MAX_GALLERY_PHOTOS) break;
    photosScreened++;
    try {
      const result = await classifyPhotoWithClaude(url, anthropicKey, [...currentPhotos, ...newApprovedEquipment, ...newApprovedOther]);
      if (result.verdict === 'GOOD_EQUIPMENT' || result.verdict === 'GOOD') {
        const slot = `gallery_bp_${currentPhotos.length + newApprovedEquipment.length + newApprovedOther.length}_${Date.now()}`;
        const rehosted = await rehostToStorage(supabase, url, listing.id, slot);
        const finalUrl = rehosted ?? url;
        if (result.verdict === 'GOOD_EQUIPMENT') {
          newApprovedEquipment.push(finalUrl);
        } else {
          newApprovedOther.push(finalUrl);
        }
      }
    } catch {
      // skip on error
    }
  }

  const photosAdded = newApprovedEquipment.length + newApprovedOther.length;
  let updatedHero: string | null = null;

  if (photosAdded > 0) {
    // Equipment photos at front of gallery
    const updatedPhotos = [...newApprovedEquipment, ...currentPhotos, ...newApprovedOther];
    const updatePayload: Record<string, unknown> = {
      photos: updatedPhotos,
      photo_enrichment_attempted_at: new Date().toISOString(),
    };

    if (heroNeedsUpgrade) {
      updatedHero = newApprovedEquipment.length > 0 ? newApprovedEquipment[0] : newApprovedEquipment.concat(newApprovedOther)[0];
      updatePayload.hero_image = updatedHero;
    }

    await supabase.from('listings').update(updatePayload).eq('id', listing.id);

    return { photosAdded, photosScreened, updatedPhotos, updatedHero };
  } else {
    // No photos passed screening — still mark as attempted
    await supabase.from('listings').update({
      photo_enrichment_attempted_at: new Date().toISOString(),
    }).eq('id', listing.id);

    // If hero needs upgrade and we have existing gallery photos, promote one
    if (heroNeedsUpgrade && currentPhotos.length > 0) {
      updatedHero = currentPhotos[0];
      await supabase.from('listings').update({ hero_image: currentPhotos[0] }).eq('id', listing.id);
    }

    return { photosAdded: 0, photosScreened, updatedPhotos: currentPhotos, updatedHero };
  }
}

// ---- Main handler ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return Response.json({ error: 'No Anthropic API key' }, { status: 500, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const limit = body.limit ?? 50;
  const offset = body.offset ?? 0;
  const dryRun = body.dry_run ?? false;
  const includeGooglePhotos = body.include_google_photos ?? true;

  // Get Google API key if needed
  let googleApiKey = '';
  if (includeGooglePhotos) {
    googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY');
    if (!googleApiKey) {
      console.warn('Google Places API key not found — skipping photo enrichment');
    }
  }

  // Fetch touchless listings that haven't been audited yet
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, name, hero_image, photos, google_photo_url, street_view_url, equipment_brand, blocked_photos, google_place_id, photo_enrichment_attempted_at')
    .eq('is_touchless', true)
    .is('photo_audited_at', null)
    .not('hero_image', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  console.log(`Processing ${listings.length} listings (limit=${limit}, offset=${offset}, dryRun=${dryRun}, googlePhotos=${includeGooglePhotos})`);

  const results: Array<{
    listing_id: string;
    name: string;
    equipment_brand: string | null;
    equipment_model: string | null;
    equipment_confidence: string;
    hero_quality: string;
    suggested_hero: string | null;
    photos_to_remove: number;
    auto_applied: boolean;
    google_photos_added: number;
    google_photos_screened: number;
  }> = [];

  let processed = 0;
  let equipmentDetected = 0;
  let heroReplaced = 0;
  let photosRemoved = 0;
  let autoApplied = 0;
  let totalGooglePhotosAdded = 0;
  let totalGooglePhotosScreened = 0;

  for (const listing of listings) {
    // Wall-clock timeout guard — stop before Edge Function limit
    if (Date.now() - startTime > 340_000) {
      console.log('Approaching timeout, stopping batch early');
      break;
    }

    processed++;
    let googlePhotosAdded = 0;
    let googlePhotosScreened = 0;

    // ---- STEP 1: Google Photo Enrichment (if enabled) ----
    // Enrich if: never attempted, OR previously attempted but still very few photos (retry)
    const currentPhotoCount = ((listing.photos as string[]) ?? []).length;
    const shouldEnrich = includeGooglePhotos && googleApiKey && !dryRun && listing.google_place_id &&
      ((!listing.photo_enrichment_attempted_at && currentPhotoCount < 3) ||
       (listing.photo_enrichment_attempted_at && currentPhotoCount === 0));
    if (shouldEnrich) {
      console.log(`[${processed}/${listings.length}] ${listing.name} — enriching from Google Photos...`);
      try {
        const enrichResult = await enrichListingWithGooglePhotos(
          supabase,
          {
            id: listing.id,
            photos: listing.photos as string[] | null,
            hero_image: listing.hero_image as string | null,
            blocked_photos: listing.blocked_photos as string[] | null,
            google_place_id: listing.google_place_id as string,
          },
          anthropicKey,
          googleApiKey,
        );
        googlePhotosAdded = enrichResult.photosAdded;
        googlePhotosScreened = enrichResult.photosScreened;
        totalGooglePhotosAdded += googlePhotosAdded;
        totalGooglePhotosScreened += googlePhotosScreened;

        // Update our in-memory copy of the listing so the audit sees new photos
        if (enrichResult.photosAdded > 0) {
          (listing as Record<string, unknown>).photos = enrichResult.updatedPhotos;
        }
        if (enrichResult.updatedHero) {
          (listing as Record<string, unknown>).hero_image = enrichResult.updatedHero;
        }

        console.log(`  → Added ${googlePhotosAdded} photos (screened ${googlePhotosScreened})`);
      } catch (err) {
        console.error(`  → Enrichment error: ${(err as Error).message}`);
      }
    }

    // ---- STEP 2: Collect all photos for Sonnet audit ----
    const photoUrls: string[] = [];
    const blockedSet = new Set((listing.blocked_photos as string[]) ?? []);

    if (listing.hero_image) photoUrls.push(listing.hero_image as string);

    const gallery = ((listing.photos as string[]) ?? []).filter(
      (p: string) => p && !photoUrls.includes(p) && !blockedSet.has(p)
    );
    photoUrls.push(...gallery.slice(0, 8));

    if (listing.google_photo_url && !photoUrls.includes(listing.google_photo_url as string)) {
      photoUrls.push(listing.google_photo_url as string);
    }

    const photosToAudit = photoUrls.slice(0, 12);

    if (photosToAudit.length === 0) continue;

    // ---- STEP 3: Run Sonnet audit ----
    const result = await auditListing(photosToAudit, listing.name, anthropicKey);

    if (!result) {
      console.log(`[${processed}/${listings.length}] ${listing.name} — audit failed`);
      continue;
    }

    // Normalize equipment brand
    let normalizedBrand: string | null = null;
    const model = result.equipment.model;
    if (result.equipment.brand) {
      normalizedBrand = normalizeBrand(result.equipment.brand);
      if (!normalizedBrand) normalizedBrand = result.equipment.brand.toLowerCase().replace(/\s+/g, '_');
    }

    // Determine photos to remove
    const removeUrls = (result.photo_verdicts ?? [])
      .filter(v => !v.keep && v.index < photosToAudit.length)
      .map(v => photosToAudit[v.index]);

    // Determine suggested hero URL
    const bestIdx = result.hero_assessment?.best_photo_index;
    const suggestedHeroUrl = bestIdx != null && bestIdx > 0 && bestIdx < photosToAudit.length
      ? photosToAudit[bestIdx]
      : null;

    // Save to photo_audit_results
    if (!dryRun) {
      await supabase.from('photo_audit_results').insert({
        listing_id: listing.id,
        equipment_brand: normalizedBrand,
        equipment_model: model,
        equipment_confidence: result.equipment.confidence ?? 'low',
        equipment_source_photo: result.equipment.source_photo_index != null
          ? photosToAudit[result.equipment.source_photo_index] ?? null
          : null,
        hero_quality: result.hero_assessment?.current_hero_quality ?? 'acceptable',
        suggested_hero_url: suggestedHeroUrl,
        suggested_hero_reason: result.hero_assessment?.reason,
        photos_to_remove: removeUrls,
        raw_response: result,
        reviewed: false,
        applied: false,
        google_photos_added: googlePhotosAdded,
        google_photos_screened: googlePhotosScreened,
      });

      // Mark listing as audited so it won't be re-processed
      await supabase
        .from('listings')
        .update({ photo_audited_at: new Date().toISOString() })
        .eq('id', listing.id);
    }

    // AUTO-APPLY: High confidence equipment
    let didAutoApply = false;
    if (!dryRun && normalizedBrand && result.equipment.confidence === 'high') {
      const isKnownBrand = Object.values(BRAND_MAP).includes(normalizedBrand);
      if (isKnownBrand) {
        await supabase
          .from('listings')
          .update({
            equipment_brand: normalizedBrand,
            equipment_model: model,
          })
          .eq('id', listing.id);
        didAutoApply = true;
        autoApplied++;
        equipmentDetected++;
      }
    } else if (normalizedBrand) {
      equipmentDetected++;
    }

    // AUTO-APPLY: Replace poor hero with better photo
    if (!dryRun && result.hero_assessment?.current_hero_quality === 'poor' && suggestedHeroUrl) {
      const oldHero = listing.hero_image as string;
      const currentPhotos = (listing.photos as string[]) ?? [];

      const newPhotos = [...currentPhotos];
      if (oldHero && !newPhotos.includes(oldHero)) {
        newPhotos.unshift(oldHero);
      }
      const filteredPhotos = newPhotos.filter(p => p !== suggestedHeroUrl);

      await supabase
        .from('listings')
        .update({
          hero_image: suggestedHeroUrl,
          hero_image_source: 'gallery',
          photos: filteredPhotos,
        })
        .eq('id', listing.id);

      heroReplaced++;
      didAutoApply = true;
    }

    // AUTO-APPLY: Remove obviously bad photos
    if (!dryRun && removeUrls.length > 0) {
      const currentPhotos = (listing.photos as string[]) ?? [];
      const currentBlocked = (listing.blocked_photos as string[]) ?? [];
      const removeSet = new Set(removeUrls);

      removeSet.delete(listing.hero_image as string);
      if (suggestedHeroUrl) removeSet.delete(suggestedHeroUrl);

      if (removeSet.size > 0) {
        const cleanedPhotos = currentPhotos.filter((p: string) => !removeSet.has(p));
        const newBlocked = [...currentBlocked, ...removeSet];

        await supabase
          .from('listings')
          .update({
            photos: cleanedPhotos,
            blocked_photos: newBlocked,
          })
          .eq('id', listing.id);

        photosRemoved += removeSet.size;
        didAutoApply = true;
      }
    }

    // Mark as applied if any auto-apply happened
    if (!dryRun && didAutoApply) {
      await supabase
        .from('photo_audit_results')
        .update({ applied: true })
        .eq('listing_id', listing.id)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    results.push({
      listing_id: listing.id,
      name: listing.name,
      equipment_brand: normalizedBrand,
      equipment_model: model,
      equipment_confidence: result.equipment.confidence ?? 'low',
      hero_quality: result.hero_assessment?.current_hero_quality ?? 'unknown',
      suggested_hero: suggestedHeroUrl,
      photos_to_remove: removeUrls.length,
      auto_applied: didAutoApply,
      google_photos_added: googlePhotosAdded,
      google_photos_screened: googlePhotosScreened,
    });

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${listings.length} | equipment: ${equipmentDetected} | heroes replaced: ${heroReplaced} | photos removed: ${photosRemoved} | google added: ${totalGooglePhotosAdded}`);
    }

    // Rate limit delay
    await new Promise(r => setTimeout(r, 200));
  }

  const summary = {
    listings_processed: processed,
    equipment_detected: equipmentDetected,
    heroes_replaced: heroReplaced,
    photos_removed: photosRemoved,
    auto_applied: autoApplied,
    google_photos_added: totalGooglePhotosAdded,
    google_photos_screened: totalGooglePhotosScreened,
    dry_run: dryRun,
    results: results.slice(0, 100),
  };

  console.log(`Done! ${processed} listings | ${equipmentDetected} equipment | ${heroReplaced} heroes | ${photosRemoved} photos removed | ${autoApplied} auto-applied | ${totalGooglePhotosAdded} google photos added`);

  return Response.json(summary, { headers: corsHeaders });
});
