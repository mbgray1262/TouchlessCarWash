import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── helpers ──────────────────────────────────────────────────────────
async function getSecret(
  supabaseUrl: string,
  serviceKey: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      apikey: serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Touchless review classifier ──────────────────────────────────────
// Mirrors scripts/enrich-listing-gemini.mjs. We pull up to 5 reviews per
// listing from Google Place Details (free, inside the Maps tier); this flags
// the ones that are genuine customer confirmations of a touchless/brushless/
// laser wash, so "one or two touchless snippets if available" surface at $0.
const TOUCHLESS_POSITIVE =
  /\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b/gi;
const NEGATIVE_CONTEXT =
  /\b(?:not|isn[’']?t|wasn[’']?t|aren[’']?t|don[’']?t|doesn[’']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)/i;
const STRONG_NEGATIVE =
  /\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b/i;

function classifyTouchlessReview(
  text: string,
): { evidence: boolean; keywords: string[] } | null {
  if (!text || text.length < 10) return null;
  if (STRONG_NEGATIVE.test(text)) {
    return { evidence: false, keywords: ['negative:brushes-touched'] };
  }
  const positives = [...text.matchAll(TOUCHLESS_POSITIVE)];
  if (positives.length === 0) return null;
  for (const m of positives) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + m[0].length + 60);
    if (NEGATIVE_CONTEXT.test(text.slice(start, end))) {
      return { evidence: false, keywords: ['negative-context'] };
    }
  }
  return {
    evidence: true,
    keywords: [...new Set(positives.map((m) => m[0].toLowerCase()))],
  };
}

// ── Google Places API v1 types ───────────────────────────────────────
interface PlaceResult {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  types?: string[];
  primaryType?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  editorialSummary?: { text: string };
  priceLevel?: string;
  paymentOptions?: Record<string, boolean>;
  reviews?: Array<{
    name?: string;
    relativePublishTimeDescription?: string;
    rating?: number;
    text?: { text: string; languageCode?: string };
    authorAttribution?: { displayName?: string; uri?: string };
    publishTime?: string;
  }>;
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
}

interface Listing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  google_place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  review_count: number | null;
}

// ── Google Places API calls ──────────────────────────────────────────
const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.types',
  'places.primaryType',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'businessStatus',
  'googleMapsUri',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'types',
  'primaryType',
  'photos',
  'editorialSummary',
  'priceLevel',
  'paymentOptions',
  'reviews',
].join(',');

async function textSearch(
  apiKey: string,
  query: string,
): Promise<PlaceResult[]> {
  const res = await fetch(
    'https://places.googleapis.com/v1/places:searchText',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': SEARCH_FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
        languageCode: 'en',
      }),
    },
  );
  if (!res.ok) {
    console.error(`Text search failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  return data.places || [];
}

async function getPlaceDetails(
  apiKey: string,
  placeId: string,
): Promise<PlaceResult | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAIL_FIELDS,
      },
    },
  );
  if (!res.ok) {
    console.error(`Place details failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return await res.json();
}

// ── Address matching ─────────────────────────────────────────────────
function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#\-]/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bparkway\b/g, 'pkwy')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's')
    .replace(/\beast\b/g, 'e')
    .replace(/\bwest\b/g, 'w')
    .replace(/\bsuite\b/g, 'ste')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStreetNumber(addr: string): string {
  const m = addr.match(/^\d+/);
  return m ? m[0] : '';
}

function addressMatch(
  listing: Listing,
  googleAddr: string | undefined,
): boolean {
  if (!googleAddr) return false;
  const norm = normalizeAddress(googleAddr);
  const listingNum = extractStreetNumber(listing.address);
  const listingCity = listing.city.toLowerCase();

  // Must contain the street number and city
  if (listingNum && !norm.includes(listingNum)) return false;
  if (!norm.includes(listingCity)) return false;
  return true;
}

// ── Hours conversion ─────────────────────────────────────────────────
function convertHours(
  openingHours: PlaceResult['regularOpeningHours'],
): Record<string, string> | null {
  if (!openingHours?.weekdayDescriptions) return null;
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const hours: Record<string, string> = {};
  for (const desc of openingHours.weekdayDescriptions) {
    // Format: "Monday: 8:00 AM – 9:00 PM"
    const colonIdx = desc.indexOf(':');
    if (colonIdx === -1) continue;
    const day = desc.slice(0, colonIdx).trim().toLowerCase();
    const time = desc.slice(colonIdx + 1).trim();
    if (days.includes(day)) {
      hours[day] = time;
    }
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

// ── Build Street View URL ────────────────────────────────────────────
function buildStreetViewUrl(lat: number, lng: number): string {
  return `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${lat},${lng}&fov=90&heading=0&pitch=10`;
}

// ── Enrich a single listing ──────────────────────────────────────────
async function enrichListing(
  supabase: ReturnType<typeof createClient>,
  listing: Listing,
  apiKey: string,
  force: boolean,
  fillMissing = false,
): Promise<{
  id: string;
  status: 'ok' | 'no_match' | 'error';
  detail: string;
}> {
  try {
    // Determine the Google Place id. Reuse the one we already have; otherwise
    // text-search to find it. With neither force nor fillMissing, a listing
    // that already has a place_id is left untouched (the cheap default path).
    // fillMissing re-fetches details for an existing place_id and fills ONLY
    // empty fields (reviews, google_maps_url, hours, photos) without clobbering
    // anything already set — unlike force, which overwrites.
    let placeId = listing.google_place_id;

    if (!placeId) {
      // Step 1: Text search to find the Google Place
      const query = `${listing.name} ${listing.address} ${listing.city} ${listing.state}`;
      const results = await textSearch(apiKey, query);

      if (results.length === 0) {
        return { id: listing.id, status: 'no_match', detail: 'no results' };
      }

      // Find best match by address
      let bestMatch = results.find((r) => addressMatch(listing, r.formattedAddress));
      if (!bestMatch) {
        // Fall back to first result if name matches
        const nameLower = listing.name.toLowerCase();
        bestMatch = results.find(
          (r) =>
            r.displayName?.text?.toLowerCase().includes(nameLower) ||
            nameLower.includes(r.displayName?.text?.toLowerCase() ?? '___'),
        );
      }
      if (!bestMatch) {
        // Last resort: use first result if it contains the city
        const cityLower = listing.city.toLowerCase();
        bestMatch = results.find((r) =>
          r.formattedAddress?.toLowerCase().includes(cityLower),
        );
      }
      if (!bestMatch) {
        return {
          id: listing.id,
          status: 'no_match',
          detail: `no address match in ${results.length} results`,
        };
      }
      placeId = bestMatch.id;
    } else if (!force && !fillMissing) {
      return {
        id: listing.id,
        status: 'ok',
        detail: 'already has google_place_id',
      };
    }

    // Step 2: Get full place details
    const details = await getPlaceDetails(apiKey, placeId);
    if (!details) {
      return {
        id: listing.id,
        status: 'error',
        detail: 'place details fetch failed',
      };
    }

    // Step 3: Build update payload (only null/empty fields unless force)
    const lat = details.location?.latitude ?? null;
    const lng = details.location?.longitude ?? null;

    // deno-lint-ignore no-explicit-any
    const update: Record<string, any> = {};

    const setIfEmpty = (col: string, val: unknown) => {
      if (val === null || val === undefined) return;
      if (force) {
        update[col] = val;
      } else if (
        (listing as Record<string, unknown>)[col] === null ||
        (listing as Record<string, unknown>)[col] === undefined ||
        (listing as Record<string, unknown>)[col] === '' ||
        (listing as Record<string, unknown>)[col] === 0
      ) {
        update[col] = val;
      }
    };

    // Always set google_place_id (it's the key identifier)
    update.google_place_id = details.id;

    setIfEmpty('latitude', lat);
    setIfEmpty('longitude', lng);
    setIfEmpty('rating', details.rating ?? null);
    setIfEmpty('review_count', details.userRatingCount ?? null);
    setIfEmpty('google_maps_url', details.googleMapsUri ?? null);
    setIfEmpty('business_status', details.businessStatus ?? null);
    setIfEmpty('google_category', details.primaryType ?? null);
    setIfEmpty(
      'google_description',
      details.editorialSummary?.text ?? null,
    );
    setIfEmpty('is_google_verified', true);

    // Phone — only fill if listing has no phone
    if (!listing.phone && details.nationalPhoneNumber) {
      update.phone = details.nationalPhoneNumber;
    }

    // Hours
    const hours = convertHours(details.regularOpeningHours);
    if (hours) setIfEmpty('hours', hours);

    // Google About (types, price level, payment options)
    const about: Record<string, unknown> = {};
    if (details.types) about.types = details.types;
    if (details.priceLevel) about.price_level = details.priceLevel;
    if (details.paymentOptions) about.payment_options = details.paymentOptions;
    if (Object.keys(about).length > 0) setIfEmpty('google_about', about);

    // Google subtypes
    if (details.types && details.types.length > 0) {
      setIfEmpty('google_subtypes', details.types.join(', '));
    }

    // Street view URL
    if (lat && lng) {
      setIfEmpty('street_view_url', buildStreetViewUrl(lat, lng));
    }

    // First Google photo URL
    if (details.photos && details.photos.length > 0) {
      const photoName = details.photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${apiKey}`;
      setIfEmpty('google_photo_url', photoUrl);
    }

    // Google photos count
    if (details.photos) {
      update.google_photos_count = details.photos.length;
    }

    // Step 4: Update listing
    if (Object.keys(update).length > 0) {
      const { error: updateErr } = await supabase
        .from('listings')
        .update(update)
        .eq('id', listing.id);

      if (updateErr) {
        return {
          id: listing.id,
          status: 'error',
          detail: `DB update failed: ${updateErr.message}`,
        };
      }
    }

    // Step 5: Insert review snippets
    if (details.reviews && details.reviews.length > 0) {
      const snippets = details.reviews
        .filter((r) => r.text?.text)
        .map((r) => {
          const reviewText = r.text!.text;
          const cls = classifyTouchlessReview(reviewText);
          return {
            listing_id: listing.id,
            reviewer_name:
              r.authorAttribution?.displayName ?? 'Google User',
            rating: r.rating ?? null,
            review_text: reviewText,
            review_date:
              r.relativePublishTimeDescription ?? null,
            review_id: r.name
              ? `google_places_${listing.id}_${r.name.replace(/\//g, '_')}`
              : `google_places_${listing.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            source: 'google_places_api',
            // Flag genuine touchless confirmations; keep keywords for evidence.
            is_touchless_evidence: cls?.evidence === true,
            touchless_keywords: cls?.keywords ?? null,
          };
        });

      if (snippets.length > 0) {
        const { error: snippetErr } = await supabase
          .from('review_snippets')
          .upsert(snippets, { onConflict: 'review_id', ignoreDuplicates: true });

        if (snippetErr) {
          console.error(
            `Review snippets insert failed for ${listing.id}: ${snippetErr.message}`,
          );
        }
      }
    }

    const fields = Object.keys(update).length;
    const reviews = details.reviews?.length ?? 0;
    return {
      id: listing.id,
      status: 'ok',
      detail: `updated ${fields} fields, ${reviews} reviews. rating=${details.rating ?? 'n/a'}, place_id=${details.id}`,
    };
  } catch (err) {
    return {
      id: listing.id,
      status: 'error',
      detail: String(err),
    };
  }
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const googleApiKey =
      Deno.env.get('GOOGLE_PLACES_API_KEY') ??
      (await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY'));
    if (!googleApiKey) {
      return json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? 'enrich_batch';

    // ── STATUS action ──
    if (action === 'status') {
      const { count: total } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true });

      const { count: withPlace } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .not('google_place_id', 'is', null);

      const { count: withRating } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .gt('rating', 0);

      const { count: withHours } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .not('hours', 'is', null);

      return json({
        total,
        with_google_place_id: withPlace,
        without_google_place_id: (total ?? 0) - (withPlace ?? 0),
        with_rating: withRating,
        with_hours: withHours,
      });
    }

    // ── ENRICH_BATCH action ──
    if (action === 'enrich_batch') {
      const listingIds: string[] = body.listing_ids ?? [];
      const force: boolean = body.force === true;
      // fill_missing: re-fetch details for listings that already have a
      // place_id and fill ONLY their empty fields (reviews, maps_url, hours).
      const fillMissing: boolean = body.fill_missing === true;
      const batchPaceMs: number = body.pace_ms ?? 250;

      if (!listingIds.length) {
        return json({ error: 'listing_ids array is required' }, 400);
      }

      // Fetch listings
      const { data: listings, error: listErr } = await supabase
        .from('listings')
        .select(
          'id, name, address, city, state, zip, phone, google_place_id, latitude, longitude, rating, review_count',
        )
        .in('id', listingIds);

      if (listErr) return json({ error: listErr.message }, 500);
      if (!listings || listings.length === 0) {
        return json({ error: 'no listings found for given IDs' }, 404);
      }

      // Process up to 25 in this invocation (60s edge function timeout)
      const CHUNK_SIZE = 25;
      const chunk = (listings as Listing[]).slice(0, CHUNK_SIZE);
      const remaining = (listings as Listing[]).slice(CHUNK_SIZE);

      const results: Awaited<ReturnType<typeof enrichListing>>[] = [];

      for (const listing of chunk) {
        const result = await enrichListing(
          supabase,
          listing,
          googleApiKey,
          force,
          fillMissing,
        );
        results.push(result);
        console.log(
          `[google-enrich] ${listing.name} (${listing.city}, ${listing.state}): ${result.status} — ${result.detail}`,
        );
        if (chunk.indexOf(listing) < chunk.length - 1) {
          await delay(batchPaceMs);
        }
      }

      // Self-chain for remaining listings
      if (remaining.length > 0) {
        const remainingIds = remaining.map((l) => l.id);
        console.log(
          `[google-enrich] Self-chaining for ${remainingIds.length} remaining listings`,
        );
        // @ts-ignore: Deno edge runtime API
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/google-enrich`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              apikey: serviceKey,
            },
            body: JSON.stringify({
              action: 'enrich_batch',
              listing_ids: remainingIds,
              force,
              fill_missing: fillMissing,
              pace_ms: batchPaceMs,
            }),
          }),
        );
      }

      const ok = results.filter((r) => r.status === 'ok').length;
      const noMatch = results.filter((r) => r.status === 'no_match').length;
      const errors = results.filter((r) => r.status === 'error').length;

      return json({
        processed: results.length,
        ok,
        no_match: noMatch,
        errors,
        remaining: remaining.length,
        results,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[google-enrich] Fatal error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
