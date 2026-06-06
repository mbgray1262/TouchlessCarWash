#!/usr/bin/env node
/**
 * One-listing enrichment pipeline using Gemini (free tier, ~$0.003/listing)
 *
 * Usage: node scripts/enrich-listing-gemini.mjs <slug-or-id>
 *
 * Pipeline:
 *  1. Read listing from Supabase
 *  2. Gemini 2.5 Flash with Google Search grounding → business data
 *     (hours, phone, rating, review count, Google description, amenities,
 *      sample reviews, top photo hints if any)
 *  3. Gemini 2.5 Flash Vision on existing photos → score each, pick hero
 *  4. Gemini 2.5 Flash → generate AI marketing description
 *  5. Update listing in Supabase
 *  6. Print before/after summary
 *
 * Designed to be ported to a Supabase edge function once validated.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import crypto from 'crypto';

// ----- Env -----
const env = readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAztKcb7YXWl0qtlxVL35oBJM9doM1Jaho';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_MAPS_API_KEY = env.GOOGLE_PLACES_API_KEY;
const GOOGLE_URL_SIGNING_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const SERPAPI_KEY = env.SERPAPI_KEY;
// LLM: Gemini key was deactivated ("reported as leaked"); route LLM calls to Claude.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Touchless review classifier (mirrors scripts/backfill-reviews-thin-listings.mjs)
const TOUCHLESS_POSITIVE = /\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b/gi;
const NEGATIVE_CONTEXT = /\b(?:not|isn[’']?t|wasn[’']?t|aren[’']?t|don[’']?t|doesn[’']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)/i;
const STRONG_NEGATIVE = /\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b/i;

function classifyTouchlessReview(text) {
  if (!text || text.length < 10) return null;
  if (STRONG_NEGATIVE.test(text)) return { evidence: false, keywords: ['negative:brushes-touched'] };
  const positives = [...text.matchAll(TOUCHLESS_POSITIVE)];
  if (positives.length === 0) return null;
  for (const m of positives) {
    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 60);
    if (NEGATIVE_CONTEXT.test(text.slice(start, end))) return { evidence: false, keywords: ['negative-context'] };
  }
  return { evidence: true, keywords: [...new Set(positives.map(m => m[0].toLowerCase()))] };
}

async function fetchSerpApiReviews(placeId, keyword = 'touchless') {
  if (!SERPAPI_KEY || !placeId) return [];
  let url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(placeId)}&num=20&api_key=${SERPAPI_KEY}`;
  if (keyword) url += `&query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ⚠ SerpAPI HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  if (data.error) {
    console.warn(`  ⚠ SerpAPI: ${data.error}`);
    return [];
  }
  return data.reviews || [];
}
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ----- CLI -----
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/enrich-listing-gemini.mjs <slug-or-id>');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');

// ----- Helpers -----
function stripJsonFence(s) {
  return s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function callGemini({ prompt, useSearch = false, imageUrls = [], temperature = 0.2 }) {
  // NOTE: routed to Claude (Anthropic) — Gemini key was deactivated. `useSearch` is
  // ignored (Claude has no Google grounding here); callers ground via Places/SerpAPI data.
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing in env');
  const content = [];
  for (const url of imageUrls) {
    try {
      const r = await fetch(url);
      const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const buf = Buffer.from(await r.arrayBuffer());
      content.push({ type: 'image', source: { type: 'base64', media_type: ct, data: buf.toString('base64') } });
    } catch (e) {
      console.warn(`  ⚠ couldn't fetch image ${url}: ${e.message}`);
    }
  }
  content.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      temperature,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function findPlaceId(listing) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const parts = [listing.name, listing.address, listing.city, listing.state].filter(Boolean).join(' ').trim();
  const params = new URLSearchParams({
    input: parts,
    inputtype: 'textquery',
    fields: 'place_id',
    key: GOOGLE_MAPS_API_KEY,
  });
  if (listing.latitude && listing.longitude) {
    params.set('locationbias', `circle:5000@${listing.latitude},${listing.longitude}`);
  }
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`);
  const j = await r.json();
  return j.candidates?.[0]?.place_id || null;
}

async function fetchPlaceDetails(placeId) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const fields = [
    'name', 'business_status', 'types', 'formatted_address', 'geometry/location',
    'formatted_phone_number', 'website', 'editorial_summary',
    'rating', 'user_ratings_total', 'opening_hours', 'photos',
  ].join(',');
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_MAPS_API_KEY}`);
  const j = await r.json();
  return j.result || null;
}

function buildPhotoUrl(photoReference, maxwidth = 1600) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photo_reference=${photoReference}&key=${GOOGLE_MAPS_API_KEY}`;
}

function parseHoursFromWeekdayText(weekdayText) {
  if (!Array.isArray(weekdayText)) return null;
  const days = { Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday', Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday' };
  const out = {};
  for (const line of weekdayText) {
    const m = line.match(/^([A-Z][a-z]+):\s*(.+)$/);
    if (m && days[m[1]]) out[days[m[1]]] = m[2].toLowerCase();
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildStreetViewUrl(address, size = '800x600') {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const location = encodeURIComponent(address);
  const path = `/maps/api/streetview?size=${size}&location=${location}&fov=80&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;

  if (!GOOGLE_URL_SIGNING_SECRET) {
    // Unsigned URL — works but counts against quota differently
    return `https://maps.googleapis.com${path}`;
  }

  // Sign the URL per Google's spec
  const decoded = Buffer.from(GOOGLE_URL_SIGNING_SECRET.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const hmac = crypto.createHmac('sha1', decoded);
  hmac.update(path);
  const signature = hmac.digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
  return `https://maps.googleapis.com${path}&signature=${signature}`;
}

async function streetViewHasImage(address) {
  // Use unsigned metadata endpoint (signing is for image URL, not metadata).
  if (!GOOGLE_MAPS_API_KEY) return false;
  try {
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    return j.status === 'OK';
  } catch (e) {
    return false;
  }
}

// ----- Pipeline steps -----

async function step1_lookupBusiness(listing) {
  console.log('\n[1/4] Gemini grounded search for business data...');
  const prompt = `Search Google for "${listing.name}" at ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}${listing.website ? ` (website: ${listing.website})` : ''}.

Return ONLY a JSON object (no markdown fences, no commentary) with these exact fields. Use null for unknown:
{
  "phone": string,
  "rating": number,
  "review_count": number,
  "hours": {"monday": "8am-6pm", "tuesday": "...", "wednesday": "...", "thursday": "...", "friday": "...", "saturday": "...", "sunday": "..."},
  "google_description": "Short Google place description (1-3 sentences). Use Google's own description if available, otherwise summarize what Google shows.",
  "amenities_summary": [string],
  "google_maps_url": string,
  "top_reviews": [{"author": string, "rating": number, "text": string, "time_description": string}]
}

For top_reviews, include up to 5 recent reviews that mention the wash experience.`;

  const text = await callGemini({ prompt, useSearch: true });
  try {
    return JSON.parse(stripJsonFence(text));
  } catch (e) {
    console.warn('  ⚠ couldn\'t parse Gemini response as JSON, returning empty');
    console.warn('  Raw:', text.slice(0, 500));
    return {};
  }
}

async function step2_qaPhotos(photos) {
  console.log(`\n[2/4] Gemini Vision QA on ${photos.length} photos...`);
  if (photos.length === 0) return { hero: null, ranked: [] };

  const prompt = `You are picking a HERO IMAGE for a TOUCHLESS car wash directory listing. This image is the first thing a customer sees — it must show them WHAT THE WASH LOOKS LIKE.

For each of the ${photos.length} photos I'm showing you, first CLASSIFY the primary subject, then SCORE.

PRIMARY SUBJECT CATEGORIES (pick exactly one per photo):
- "building_exterior" — front/side of the car wash building, signage, drive-up entrance visible
- "wash_equipment" — touchless gantry, sprayer arm, dryer, foam applicator, wash bay equipment with NO car blocking it
- "wash_bay_empty" — interior of a wash bay with no car in it, equipment visible
- "car_in_wash" — a car is the primary subject (in a bay, going through wash, etc.) — REJECT for hero
- "car_closeup" — closeup of a car or car part (wheel, hood, windshield) — REJECT for hero
- "car_interior_view" — view from inside a car looking out — REJECT for hero
- "marketing_graphic" — text, logo, price chart, banner overlay — REJECT for hero
- "other" — anything else (people, parking lot far away, sky, etc.) — REJECT for hero

SCORING (0-10):
- 9-10: building_exterior with clear, well-framed shot
- 7-8: wash_equipment OR wash_bay_empty — clear, no cars blocking
- 4-6: building_exterior but partially obscured or distant
- 0-3: anything in REJECT categories above

HERO CANDIDATE RULE:
"is_hero_candidate": true ONLY IF the subject is building_exterior, wash_equipment, or wash_bay_empty AND score ≥ 6.
NEVER mark a car-focused or interior-view photo as a hero candidate, even if pretty.

Return ONLY a JSON array, one entry per photo in order. Example:
[
  {"index": 0, "subject": "building_exterior", "score": 9, "reason": "Clear front view of facility with signage", "is_hero_candidate": true},
  {"index": 1, "subject": "car_in_wash", "score": 2, "reason": "Car is primary subject", "is_hero_candidate": false}
]`;

  const text = await callGemini({ prompt, imageUrls: photos, temperature: 0.1 });
  try {
    const ranked = JSON.parse(stripJsonFence(text));
    // Pick hero — prefer building_exterior > wash_equipment > wash_bay_empty, then by score
    const subjectRank = { building_exterior: 3, wash_equipment: 2, wash_bay_empty: 1 };
    const candidates = ranked
      .filter(r => r.is_hero_candidate)
      .sort((a, b) => {
        const aR = subjectRank[a.subject] || 0;
        const bR = subjectRank[b.subject] || 0;
        if (aR !== bR) return bR - aR;
        return b.score - a.score;
      });
    const heroIdx = candidates[0]?.index ?? null;
    return {
      hero: heroIdx !== null ? photos[heroIdx] : null,
      ranked,
    };
  } catch (e) {
    console.warn('  ⚠ couldn\'t parse photo QA response, defaulting to first photo');
    return { hero: photos[0], ranked: [] };
  }
}

async function step3_generateDescription(listing, businessData) {
  console.log('\n[3/4] Gemini Flash → AI marketing description...');

  const context = {
    name: listing.name,
    city: listing.city,
    state: listing.state,
    address: listing.address,
    website: listing.website,
    hours: businessData.hours || listing.hours,
    amenities: listing.amenities || [],
    wash_packages: listing.wash_packages || [],
    rating: businessData.rating,
    review_count: businessData.review_count,
    google_description: businessData.google_description,
    top_reviews: businessData.top_reviews || [],
    is_touchless: listing.is_touchless,
    equipment_brand: listing.equipment_brand,
    equipment_model: listing.equipment_model,
  };

  const prompt = `Write a helpful, factual 2-3 paragraph description for this car wash listing. Aim for ~150-220 words.

Context:
${JSON.stringify(context, null, 2)}

Rules:
- Write in third person, friendly but factual tone
- Lead with what makes this wash useful (touchless? unlimited club? open 24h?)
- Mention specific wash packages/prices if available
- Mention notable amenities (foam cannons, free vacuums, etc.) — pick the 2-3 most useful
- If reviews mention specific positives (clean, fast, friendly staff), reference them naturally
- DO NOT use marketing hype ("the best", "ultimate") — be measured
- DO NOT make up facts not in the context
- DO NOT mention rating numbers
- End with a concrete action like address or hours

Return ONLY the description text — no headings, no quotes, no JSON.`;

  const text = await callGemini({ prompt, temperature: 0.4 });
  return text.trim();
}

async function step4_updateListing(listingId, updates) {
  console.log('\n[4/4] Writing updates to Supabase...');
  if (DRY_RUN) {
    console.log('  [DRY-RUN] would update:');
    for (const [k, v] of Object.entries(updates)) {
      const display = typeof v === 'string' ? `${v.slice(0, 80)}...` : JSON.stringify(v).slice(0, 80);
      console.log(`    ${k}: ${display}`);
    }
    return;
  }
  const { error } = await supabase.from('listings').update(updates).eq('id', listingId);
  if (error) throw new Error(`Update failed: ${error.message}`);
  console.log(`  ✓ Updated listing ${listingId}`);
}

// ----- Main -----
async function main() {
  console.log(`\n=== Enriching listing: ${arg} ===\n`);
  if (DRY_RUN) console.log('(DRY-RUN — no DB changes)\n');

  // Look up listing
  let query = supabase.from('listings').select('*');
  if (arg.length === 36 && arg.includes('-')) {
    query = query.eq('id', arg);
  } else {
    query = query.eq('slug', arg);
  }
  const { data: listing, error } = await query.single();
  if (error || !listing) {
    console.error('Listing not found:', error?.message);
    process.exit(1);
  }

  console.log(`Listing: ${listing.name} (${listing.id})`);
  console.log(`Address: ${listing.address}, ${listing.city}, ${listing.state}`);
  console.log(`Current state: hero=${listing.hero_image ? 'yes' : 'NO'}, desc=${listing.description ? 'yes' : 'NO'}, rating=${listing.rating}, reviews=${listing.review_count}, photos=${(listing.photos || []).length}`);

  const t0 = Date.now();

  // Step 0: Google Places — get real photos + place data
  console.log('\n[0/4] Google Places API → place_id, real photos, hours...');
  let placeData = null;
  let googlePhotos = [];
  let placeId = listing.google_place_id;

  if (!placeId) {
    placeId = await findPlaceId(listing);
    console.log(`  Found place_id: ${placeId ? placeId.slice(0, 30) + '...' : 'NONE'}`);
  } else {
    console.log(`  Using existing place_id: ${placeId.slice(0, 30)}...`);
  }

  if (placeId) {
    placeData = await fetchPlaceDetails(placeId);
    if (placeData) {
      const photoRefs = (placeData.photos || []).slice(0, 10);
      googlePhotos = photoRefs.map(p => buildPhotoUrl(p.photo_reference, 1600));
      console.log(`  Google photos: ${googlePhotos.length}`);
      console.log(`  Google rating: ${placeData.rating} (${placeData.user_ratings_total} reviews)`);
      console.log(`  Hours: ${placeData.opening_hours?.weekday_text ? 'yes' : 'no'}`);
      console.log(`  Lat/Lng: ${placeData.geometry?.location?.lat}, ${placeData.geometry?.location?.lng}`);
    }
  }

  // Step 0.5: SerpAPI touchless review mining (only if we have a place_id)
  let serpapiReviews = [];
  if (placeId) {
    console.log('\n[0.5/4] SerpAPI → mining touchless-mentioning reviews...');
    serpapiReviews = await fetchSerpApiReviews(placeId, 'touchless');
    console.log(`  Fetched ${serpapiReviews.length} reviews (filtered server-side by query=touchless)`);
  }

  // Step 1: synthesize business data from GROUNDED sources (Places + SerpAPI),
  // not LLM grounding — Gemini search is unavailable and Claude would hallucinate.
  console.log('\n[1/4] Building business data from Google Places + SerpAPI (grounded)...');
  const businessData = {
    phone: placeData?.formatted_phone_number || null,
    rating: typeof placeData?.rating === 'number' ? placeData.rating : null,
    review_count: typeof placeData?.user_ratings_total === 'number' ? placeData.user_ratings_total : null,
    hours: parseHoursFromWeekdayText(placeData?.opening_hours?.weekday_text) || null,
    google_description: placeData?.editorial_summary?.overview || null,
    amenities_summary: [],
    google_maps_url: placeData?.url || null,
    top_reviews: (serpapiReviews || []).slice(0, 6).map(r => ({
      author: r.user?.name || null,
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: r.snippet || r.extracted_snippet?.original || '',
      time_description: r.date || null,
    })).filter(x => x.text && x.text.length > 10),
  };
  console.log(`  Phone: ${businessData.phone}`);
  console.log(`  Rating: ${businessData.rating} (${businessData.review_count} reviews)`);
  console.log(`  Hours: ${businessData.hours ? Object.keys(businessData.hours).length + ' days' : 'none'}`);
  console.log(`  Google description: ${businessData.google_description ? businessData.google_description.slice(0, 100) + '...' : 'none'}`);
  console.log(`  Top reviews: ${businessData.top_reviews?.length || 0}`);

  // Step 2: Photo QA + hero pick
  // If Google Places returned fresh photos, use ONLY those (stale Google URLs from prior
  // runs have rotated photo_references and would create duplicates).
  // If Google failed, fall back to existing photos.
  const isGoogleUrl = (url) => url && url.includes('maps.googleapis.com/maps/api/place/photo');
  const nonGooglePhotos = (listing.photos || []).filter(p => !isGoogleUrl(p));

  let photos;
  if (googlePhotos.length > 0) {
    photos = [...googlePhotos, ...nonGooglePhotos];
    console.log(`  Photo sources: ${googlePhotos.length} fresh from Google, ${nonGooglePhotos.length} non-Google preserved (replacing ${(listing.photos || []).length - nonGooglePhotos.length} stale Google URLs)`);
  } else {
    photos = listing.photos || [];
    console.log(`  Photo sources: 0 from Google (using ${photos.length} existing)`);
  }
  const { hero: photoHero, ranked } = await step2_qaPhotos(photos);
  if (ranked.length > 0) {
    console.log('  Photo scores:');
    ranked.forEach(r => console.log(`    #${r.index}: [${r.subject || '?'}] ${r.score}/10 — ${r.reason}${r.is_hero_candidate ? ' ✓ candidate' : ''}`));
  }

  // Track non-hero photos as "bad photos" to filter from gallery
  const badPhotoIndices = ranked.filter(r => r.score <= 3).map(r => r.index);
  const goodPhotos = photos.filter((_, i) => !badPhotoIndices.includes(i));

  let hero = photoHero;
  let heroSource = 'photo';
  let streetViewUrl = null;

  if (!hero) {
    // Fallback to Street View
    console.log('  No good photos — trying Street View fallback...');
    const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
    streetViewUrl = buildStreetViewUrl(fullAddress);
    if (streetViewUrl && await streetViewHasImage(fullAddress)) {
      hero = streetViewUrl;
      heroSource = 'street_view';
      console.log(`  ✓ Street View hero: ${streetViewUrl.slice(0, 120)}...`);
    } else {
      console.log('  ⚠ Street View not available for this address');
    }
  }
  console.log(`  Hero pick: ${hero ? `from ${heroSource}` : 'NONE'}`);
  console.log(`  Gallery: keeping ${goodPhotos.length} of ${photos.length} photos (rejected ${badPhotoIndices.length} junk photos)`);

  // Step 3: AI description
  const description = await step3_generateDescription(listing, businessData);
  console.log(`  Description: ${description.length} chars`);
  console.log(`  Preview: "${description.slice(0, 200)}..."`);

  // Step 4: Update DB
  const updates = {
    description,
    description_generated_at: new Date().toISOString(),
  };
  if (businessData.phone && !listing.phone) updates.phone = businessData.phone;
  if (typeof businessData.rating === 'number' && businessData.rating > 0) updates.rating = businessData.rating;
  if (typeof businessData.review_count === 'number' && businessData.review_count > 0) updates.review_count = businessData.review_count;
  if (businessData.hours && Object.keys(businessData.hours).length > 0) updates.hours = businessData.hours;
  if (businessData.google_description) updates.google_description = businessData.google_description;
  if (businessData.google_maps_url) updates.google_maps_url = businessData.google_maps_url;
  if (hero) updates.hero_image = hero;
  if (streetViewUrl) updates.street_view_url = streetViewUrl;
  // Replace gallery with QA-passed photos
  if (photos.length > 0) {
    updates.photos = goodPhotos;
    if (badPhotoIndices.length > 0) {
      updates.blocked_photos = [...(listing.blocked_photos || []), ...badPhotoIndices.map(i => photos[i])];
    }
  }
  // Google Places data
  if (placeId && !listing.google_place_id) updates.google_place_id = placeId;
  if (placeData) {
    if (placeData.geometry?.location?.lat && !listing.latitude) updates.latitude = placeData.geometry.location.lat;
    if (placeData.geometry?.location?.lng && !listing.longitude) updates.longitude = placeData.geometry.location.lng;
    if (typeof placeData.rating === 'number' && placeData.rating > 0) updates.rating = placeData.rating;
    if (typeof placeData.user_ratings_total === 'number' && placeData.user_ratings_total > 0) updates.review_count = placeData.user_ratings_total;
    if (placeData.business_status) updates.business_status = placeData.business_status;
    if (placeData.types?.[0]) updates.google_category = placeData.types[0];
    if (placeData.editorial_summary?.overview && !updates.google_description) updates.google_description = placeData.editorial_summary.overview;
    const placeHours = parseHoursFromWeekdayText(placeData.opening_hours?.weekday_text);
    if (placeHours && Object.keys(placeHours).length > 0) updates.hours = placeHours;
    if (googlePhotos.length > 0) updates.google_photos_count = googlePhotos.length;
    if (googlePhotos.length > 0) updates.google_photo_url = googlePhotos[0];
  }

  // Step 3b: amenities — grounded ONLY in Places signals + mined review text.
  if (!Array.isArray(listing.amenities) || listing.amenities.length === 0) {
    const amenContext = {
      google_category: placeData?.types || [],
      google_description: businessData.google_description,
      hours: businessData.hours,
      review_snippets: (serpapiReviews || []).map(r => r.snippet || r.extracted_snippet?.original).filter(Boolean).slice(0, 15),
    };
    const amenPrompt = `From the GROUNDED context below for a car wash, return a JSON array of short amenity labels (2-4 words each) that are EXPLICITLY supported by the text. Do NOT invent amenities. Choose only from this vocabulary when supported: "Touch-free automatic wash", "Self-serve wash bays", "Free vacuums", "Open 24 hours", "Unlimited wash club", "Credit cards accepted", "Vending services", "Spot-free rinse", "Undercarriage wash", "Pet/dog wash", "Detailing services". Return [] if none are clearly supported. Context:\n${JSON.stringify(amenContext, null, 2)}\n\nReturn ONLY a JSON array.`;
    try {
      const amenText = await callGemini({ prompt: amenPrompt, temperature: 0 });
      const amen = JSON.parse(stripJsonFence(amenText));
      if (Array.isArray(amen) && amen.length > 0) updates.amenities = [...new Set(amen.map(String))].slice(0, 8);
      console.log(`  Amenities: ${(updates.amenities || []).join(', ') || '(none derived)'}`);
    } catch (e) {
      console.warn(`  ⚠ amenities step skipped: ${e.message}`);
    }
  }

  // Completeness-gated auto-approve (no-partial-listings rule):
  // hero + hours + amenities + AI description + reviews all present.
  const finalHours = updates.hours || listing.hours;
  const finalAmen = updates.amenities || listing.amenities || [];
  const finalReviews = updates.review_count || listing.review_count || 0;
  const complete = !!hero && !!finalHours && Array.isArray(finalAmen) && finalAmen.length > 0
    && !!description && description.length > 50 && finalReviews > 0;
  if (process.argv.includes('--approve')) {
    if (complete) {
      updates.is_approved = true;
      updates.reviewed_at = new Date().toISOString();
      console.log('  ✓ Completeness gate PASSED → is_approved=true');
    } else {
      console.log(`  ⚠ Completeness gate FAILED → left UNAPPROVED (hero=${!!hero} hours=${!!finalHours} amenities=${finalAmen.length} desc=${description.length} reviews=${finalReviews})`);
    }
  }

  await step4_updateListing(listing.id, updates);

  // Insert review snippets (idempotent — skip duplicates by review_text)
  // Combine: SerpAPI touchless reviews (high signal) + Gemini grounded reviews (low signal)
  if (!DRY_RUN) {
    // Get existing review texts to skip duplicates
    const { data: existing } = await supabase
      .from('review_snippets')
      .select('review_text')
      .eq('listing_id', listing.id);
    const existingTexts = new Set((existing || []).map(r => (r.review_text || '').trim().toLowerCase()));

    const allCandidates = [];

    // SerpAPI reviews (preferred — high signal, server-side filtered for touchless)
    for (const r of serpapiReviews) {
      const text = r.snippet || r.extracted_snippet?.original;
      if (!text || text.length < 10) continue;
      const cls = classifyTouchlessReview(text);
      if (!cls) continue; // skip if no touchless keywords (server should have filtered, but double-check)
      allCandidates.push({
        listing_id: listing.id,
        reviewer_name: r.user?.name || null,
        rating: typeof r.rating === 'number' ? r.rating : null,
        review_text: text,
        review_date: r.date || null,
        iso_date: r.iso_date || null,
        review_id: r.review_id || null,
        touchless_keywords: cls.keywords,
        is_touchless_evidence: cls.evidence,
        source: 'serpapi',
      });
    }

    // Gemini reviews as supplementary — but only keep touchless-related
    // (matches the convention in backfill-reviews-thin-listings.mjs:
    //  review_snippets is for touchless evidence only, not generic reviews)
    for (const r of (businessData.top_reviews || [])) {
      if (!r.text || r.text.length < 10) continue;
      const cls = classifyTouchlessReview(r.text);
      if (!cls) continue; // skip if no touchless keywords
      allCandidates.push({
        listing_id: listing.id,
        reviewer_name: r.author || null,
        rating: typeof r.rating === 'number' ? r.rating : null,
        review_text: r.text,
        review_date: r.time_description || null,
        touchless_keywords: cls.keywords,
        is_touchless_evidence: cls.evidence,
        source: 'gemini_grounded',
      });
    }

    // Dedupe within this batch + against existing
    const seen = new Set();
    const snippetRows = allCandidates.filter(r => {
      const key = (r.review_text || '').trim().toLowerCase();
      if (existingTexts.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const touchlessCount = snippetRows.filter(r => r.is_touchless_evidence).length;
    console.log(`\n  Reviews — SerpAPI: ${serpapiReviews.length}, Gemini: ${businessData.top_reviews?.length || 0}, new unique: ${snippetRows.length} (${touchlessCount} touchless-evidence)`);

    if (snippetRows.length > 0) {
      const { error: snipErr } = await supabase.from('review_snippets').insert(snippetRows);
      if (snipErr) {
        console.warn(`  ⚠ review_snippets insert failed: ${snipErr.message}`);
      } else {
        console.log(`  ✓ Inserted ${snippetRows.length} new review snippets`);
      }
    }
  }

  console.log(`\n=== Done in ${((Date.now() - t0) / 1000).toFixed(1)}s ===\n`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
