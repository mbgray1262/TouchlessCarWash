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

// Brand normalization from detect-equipment
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
  // Fetch all images as base64
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
          model: 'claude-sonnet-4-5-20241022',
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

      // Parse JSON from response
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

  // Fetch untagged touchless listings with images
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, name, hero_image, photos, google_photo_url, street_view_url, equipment_brand, blocked_photos')
    .eq('is_touchless', true)
    .is('equipment_brand', null)
    .not('hero_image', 'is', null)
    .order('photo_enrichment_attempted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  console.log(`Processing ${listings.length} listings (limit=${limit}, offset=${offset}, dryRun=${dryRun})`);

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
  }> = [];

  let processed = 0;
  let equipmentDetected = 0;
  let heroReplaced = 0;
  let photosRemoved = 0;
  let autoApplied = 0;

  for (const listing of listings) {
    processed++;

    // Collect all photos: hero first (index 0), then gallery, then google photo
    const photoUrls: string[] = [];
    const blockedSet = new Set((listing.blocked_photos as string[]) ?? []);

    if (listing.hero_image) photoUrls.push(listing.hero_image as string);

    const gallery = ((listing.photos as string[]) ?? []).filter(
      (p: string) => p && !photoUrls.includes(p) && !blockedSet.has(p)
    );
    photoUrls.push(...gallery.slice(0, 8)); // Cap gallery at 8

    if (listing.google_photo_url && !photoUrls.includes(listing.google_photo_url as string)) {
      photoUrls.push(listing.google_photo_url as string);
    }

    // Cap total at 12 photos
    const photosToAudit = photoUrls.slice(0, 12);

    if (photosToAudit.length === 0) continue;

    const result = await auditListing(photosToAudit, listing.name, anthropicKey);

    if (!result) {
      console.log(`[${processed}/${listings.length}] ${listing.name} — audit failed`);
      continue;
    }

    // Normalize equipment brand
    let normalizedBrand: string | null = null;
    let model = result.equipment.model;
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
      });
    }

    // AUTO-APPLY: High confidence equipment
    let didAutoApply = false;
    if (!dryRun && normalizedBrand && result.equipment.confidence === 'high') {
      // Only auto-apply if brand is in known BRAND_MAP
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
      // Replace hero image
      const oldHero = listing.hero_image as string;
      const currentPhotos = (listing.photos as string[]) ?? [];

      // Add old hero to gallery if not already there
      const newPhotos = [...currentPhotos];
      if (oldHero && !newPhotos.includes(oldHero)) {
        newPhotos.unshift(oldHero);
      }
      // Remove new hero from gallery (it's becoming the hero)
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

      // Don't remove the current hero
      removeSet.delete(listing.hero_image as string);
      // Don't remove the suggested hero
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
    });

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${listings.length} | equipment: ${equipmentDetected} | heroes replaced: ${heroReplaced} | photos removed: ${photosRemoved}`);
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
    dry_run: dryRun,
    results: results.slice(0, 100), // Cap response size
  };

  console.log(`Done! ${processed} listings | ${equipmentDetected} equipment | ${heroReplaced} heroes | ${photosRemoved} photos removed | ${autoApplied} auto-applied`);

  return Response.json(summary, { headers: corsHeaders });
});
