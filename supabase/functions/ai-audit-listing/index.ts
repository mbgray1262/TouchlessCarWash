// AI audit of a single listing using Gemini 2.5 Flash (multimodal).
//
// Input: listing_id
// Work:
//   1. Load listing + review_snippets
//   2. Build text evidence bundle
//   3. Fetch up to 3 photos (hero, google, street view)
//   4. Call Gemini with text + images
//   5. Parse verdict JSON
//   6. Save to ai_audits table (create if not exists)
//
// This runs as a Supabase edge function so we get the Gemini API key from
// env (same one the description generator uses) without having to pass it
// to local scripts. Call it from a local driver loop.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_name: name }),
    });
    if (!r.ok) return undefined;
    const j = await r.json() as string;
    return j;
  } catch { return undefined; }
}

async function fetchImageAsBase64(url: string, maxBytes = 4_000_000): Promise<{ data: string; mimeType: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const mimeType = r.headers.get('content-type') || 'image/jpeg';
    const buf = await r.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;  // skip huge images
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { data: btoa(binary), mimeType };
  } catch { return null; }
}

interface Listing {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  parent_chain: string | null;
  google_category: string | null;
  google_subtypes: string | null;
  amenities: string[] | null;
  touchless_wash_types: string[] | null;
  hero_image: string | null;
  google_photo_url: string | null;
  street_view_url: string | null;
  rating: number | null;
  review_count: number | null;
  crawl_snapshot: { markdown?: string } | null;
}

interface ReviewSnippet {
  review_text: string;
  is_touchless_evidence: boolean | null;
  sentiment: string | null;
  touchless_keywords: string[] | null;
}

function buildPrompt(listing: Listing, snippets: ReviewSnippet[]): string {
  const parts: string[] = [];
  parts.push('You are auditing a car wash listing on a consumer directory for TOUCHLESS (brushless, automatic) car washes.');
  parts.push('');
  parts.push('STRICT definition of touchless for this directory:');
  parts.push('  ✓ TOUCHLESS = automatic in-bay or conveyor wash using only high-pressure water + chemistry. No physical contact with the vehicle surface.');
  parts.push('  ✗ NOT touchless: soft-cloth tunnels, foam pad washes, rotating brush tunnels, hand washes, detailers, self-serve wand bays (user holds the wand).');
  parts.push('');
  parts.push('Note: "Touch-free" and "brushless" in marketing usually mean touchless — but verify against actual equipment/review descriptions. Self-serve wand bays are brushless but NOT touchless for our directory.');
  parts.push('');
  parts.push('EVIDENCE:');
  parts.push(`  Business name: ${listing.name}`);
  parts.push(`  Address: ${listing.address ?? '(unknown)'}, ${listing.city ?? ''}, ${listing.state ?? ''}`);
  if (listing.parent_chain) parts.push(`  Parent chain: ${listing.parent_chain}`);
  if (listing.google_category) parts.push(`  Google category: ${listing.google_category}`);
  if (listing.google_subtypes) parts.push(`  Google subtypes: ${listing.google_subtypes}`);
  if (listing.amenities?.length) parts.push(`  Amenities: ${listing.amenities.join(', ')}`);
  if (listing.touchless_wash_types?.length) parts.push(`  Touchless wash types claimed: ${listing.touchless_wash_types.join(', ')}`);
  if (listing.rating != null && listing.review_count != null && listing.review_count > 0) {
    parts.push(`  Google rating: ${listing.rating} (${listing.review_count} reviews)`);
  }
  if (listing.website) parts.push(`  Website URL: ${listing.website}`);

  // Chain tunnel-chain blocklist awareness
  const tunnelChains = ['Tidal Wave', 'Mister Car Wash', 'Take 5', 'Quick Quack', "Tommy's Express", 'Zips', 'Whistle Express', 'Tsunami', 'WhiteWater Express', 'Caliber Car Wash', 'LUV Car Wash', 'Club Car Wash', 'Super Star Car Wash', 'Delta Sonic'];
  const blocklisted = tunnelChains.find(c => listing.name?.includes(c) || listing.parent_chain?.includes(c));
  if (blocklisted) parts.push(`  ⚠️  NOTE: This is a "${blocklisted}" location. That chain is documented as soft-cloth/tunnel, NOT touchless. Only classify as touchless if customer reviews explicitly describe a touchless bay at this specific location (2+ positive reviews).`);

  // Website text excerpt
  const snapshot = listing.crawl_snapshot?.markdown || '';
  if (snapshot) {
    parts.push('');
    parts.push('WEBSITE TEXT (excerpt, up to 2000 chars):');
    parts.push(snapshot.slice(0, 2000));
  }

  // Reviews
  if (snippets.length > 0) {
    parts.push('');
    parts.push(`CUSTOMER REVIEW SNIPPETS (${snippets.length}):`);
    for (const s of snippets.slice(0, 15)) {
      const marker = s.is_touchless_evidence === true ? '✓+' : s.is_touchless_evidence === false ? '✗-' : '?';
      parts.push(`  ${marker} [${s.sentiment ?? '?'}] "${(s.review_text || '').slice(0, 400)}"`);
    }
  } else {
    parts.push('');
    parts.push('CUSTOMER REVIEW SNIPPETS: none available.');
  }

  parts.push('');
  parts.push('PHOTOS: I am attaching up to 3 photos — the FIRST photo is the listing\'s HERO image (what users see first on the listing page).');
  parts.push('');
  parts.push('For each photo: does the equipment shown match a touchless automatic wash, a soft-cloth tunnel, a self-serve wand bay, a detailer bay, or a gas station with no wash visible?');
  parts.push('');
  parts.push('Also SPECIFICALLY evaluate the HERO image (first photo) for quality:');
  parts.push('  GOOD: shows the actual facility exterior/building, OR genuine TOUCHLESS equipment (high-pressure nozzles, spray arches, water-only spray bars), OR legitimate brand logo/storefront');
  parts.push('  OK: shows related but generic content (e.g. exterior street view, adjacent signage, parking lot)');
  parts.push('  BAD — mark BAD if the hero shows ANY of the following:');
  parts.push('    • Soft-cloth curtains, cloth drapes, mitter curtains (red/blue/multicolor strips hanging from above)');
  parts.push('    • Rotating brushes, spinning brushes, wheel scrubbers, foam brushes (any brush making contact)');
  parts.push('    • "Soft Touch" signage on equipment (even if facility also has touchless)');
  parts.push('    • Self-serve wand bay (human holding wand/hose)');
  parts.push('    • Hand-wash, hand-dry, hand-detail, or ANY attendant/employee touching a vehicle (drying, buffing, waxing, vacuuming the exterior, polishing)');
  parts.push('    • "Courtesy drying", "hand dry", "free towel dry" signage or scene');
  parts.push('    • Tunnel conveyor with visible cloth/brush equipment');
  parts.push('    • Stock images, wrong business, receipts, car interiors, food/drinks, text overlays, cartoon art');
  parts.push('    • LOW QUALITY: obviously pixelated, grainy, low-resolution (looks sub-800px wide), blurry, dark/underexposed, or compressed with JPEG artifacts');
  parts.push('    • POOR COMPOSITION: facility is tiny and lost in the frame (>60% sky or parking lot with no subject), heavily tilted/crooked, or the main subject is cut off at an awkward edge');
  parts.push('    • Self-serve wand bay structures visible from outside (open covered bays with pay meters/wands — hallmark of self-serve, not touchless)');
  parts.push('  CRITICAL: This is a TOUCHLESS directory. The hero must not depict ANY human-vehicle contact or cloth/brush contact equipment — even if the facility also offers touchless. Showing contact imagery contradicts the "no touch" promise and misleads users. When in doubt between GOOD and BAD, choose BAD.');
  parts.push('');
  parts.push('Respond ONLY with a single JSON object (no markdown, no code fence):');
  parts.push(`{
  "verdict": "TOUCHLESS_CONFIRMED" | "TOUCHLESS_PROBABLE" | "UNCERTAIN" | "NOT_TOUCHLESS",
  "confidence": 0-100 integer,
  "reasoning": "2-4 sentence explanation citing specific evidence",
  "photo_analysis": "1-2 sentences on what the photos show, or 'no-photos' if none analyzed",
  "flags": [ "tunnel-chain", "soft-cloth-website", "self-serve-photos", "detailer-amenities", "no-evidence", "mixed-facility" etc. ],
  "recommendation": "keep" | "hold" | "revert",
  "hero_image_quality": "GOOD" | "OK" | "BAD" | "NO_IMAGE",
  "hero_image_reasoning": "1 sentence on what the hero shows (e.g. 'storefront photo of the facility', 'generic stock image of a sports car', 'hand wash detailing')",
  "hero_image_recommendation": "keep" | "replace" | "use-chain-brand-fallback"
}`);

  return parts.join('\n');
}

async function analyzeListing(listing: Listing, snippets: ReviewSnippet[], apiKey: string): Promise<unknown> {
  // Collect image URLs to attach (max 3)
  const photoUrls: string[] = [];
  if (listing.hero_image) photoUrls.push(listing.hero_image);
  if (listing.google_photo_url && !photoUrls.includes(listing.google_photo_url)) photoUrls.push(listing.google_photo_url);
  if (photoUrls.length < 3 && listing.street_view_url) photoUrls.push(listing.street_view_url);

  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  for (const url of photoUrls.slice(0, 3)) {
    const img = await fetchImageAsBase64(url);
    if (img) imageParts.push({ inlineData: img });
  }

  const prompt = buildPrompt(listing, snippets);
  const parts: Array<unknown> = [{ text: prompt }, ...imageParts];

  const res = await fetch(
    // Upgraded from gemini-2.5-flash to gemini-2.5-pro (2026-04-17) — Flash was
    // missing attendant-contact, mitter curtains, and low-res composition issues.
    // Pro catches those reliably. Cost ~5-10x higher but still pennies per listing.
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 3500,
          topP: 0.9,
          responseMimeType: 'application/json',
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    return JSON.parse(text);
  } catch {
    return { error: 'parse_failed', raw: text.slice(0, 600), photos_analyzed: imageParts.length };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? await getSecret(supabaseUrl, serviceKey, 'GEMINI_API_KEY');
    if (!geminiKey) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500, headers: corsHeaders });

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const listingId: string | undefined = body.listing_id;
    if (!listingId) return Response.json({ error: 'listing_id required' }, { status: 400, headers: corsHeaders });

    const { data: listing, error: lErr } = await supabase
      .from('listings')
      .select('id, name, address, city, state, website, parent_chain, google_category, google_subtypes, amenities, touchless_wash_types, hero_image, google_photo_url, street_view_url, rating, review_count, crawl_snapshot')
      .eq('id', listingId)
      .maybeSingle();
    if (lErr || !listing) return Response.json({ error: lErr?.message ?? 'Listing not found' }, { status: 404, headers: corsHeaders });

    const { data: snippets } = await supabase
      .from('review_snippets')
      .select('review_text, is_touchless_evidence, sentiment, touchless_keywords')
      .eq('listing_id', listingId);

    const verdict = await analyzeListing(listing as Listing, (snippets ?? []) as ReviewSnippet[], geminiKey);

    // Write to ai_audits table (upsert by listing_id so re-runs update)
    const v = verdict as Record<string, unknown>;
    const { error: aErr } = await supabase.from('ai_audits').upsert({
      listing_id: listingId,
      verdict: (v.verdict as string) ?? null,
      confidence: (v.confidence as number) ?? null,
      reasoning: (v.reasoning as string) ?? null,
      photo_analysis: (v.photo_analysis as string) ?? null,
      flags: (v.flags as string[]) ?? null,
      recommendation: (v.recommendation as string) ?? null,
      hero_image_quality: (v.hero_image_quality as string) ?? null,
      hero_image_reasoning: (v.hero_image_reasoning as string) ?? null,
      hero_image_recommendation: (v.hero_image_recommendation as string) ?? null,
      raw_response: verdict,
      audited_at: new Date().toISOString(),
    }, { onConflict: 'listing_id' });
    if (aErr) console.log('audit insert err:', aErr.message);

    return Response.json({ verdict, photos_analyzed: (verdict as { photos_analyzed?: number }).photos_analyzed ?? null }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
