import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function makeUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  base: string,
): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
    attempt++;
  }
}

// ---------------------------------------------------------------------------
// SerpAPI Types & Helpers
// ---------------------------------------------------------------------------

interface SerpApiReview {
  rating?: number;
  date?: string;
  iso_date?: string;
  snippet?: string;
  extracted_snippet?: { original: string };
  user?: { name: string; reviews?: number };
  review_id?: string;
}

interface SerpApiResponse {
  reviews?: SerpApiReview[];
  search_metadata?: {
    status?: string;
    total_results?: number;
  };
  serpapi_pagination?: {
    next_page_token?: string;
    next?: string;
  };
  error?: string;
}

/** Keywords that indicate touchless evidence in reviews. */
const REVIEW_TOUCHLESS_KEYWORDS = [
  'touchless', 'touch-free', 'touchfree', 'touch free', 'touch less',
  'brushless', 'brush-free', 'brushfree', 'brush free',
  'no brush', 'no-brush', 'no brushes',
  'laser wash', 'laserwash',
  'no-touch', 'no touch', 'notouch',
  'contactless', 'contact-free', 'contact free',
  'frictionless', 'friction-free',
];

/**
 * Patterns where "contactless" is used about PAYMENT, not wash type.
 * Reviews matching ONLY contactless keywords AND one of these patterns
 * should be rejected as false positives.
 */
const CONTACTLESS_PAYMENT_PATTERNS = [
  /contactless\s+pay/i,
  /contactless\s+card/i,
  /contactless\s+transaction/i,
  /contactless\s+tap/i,
  /contactless\s+credit/i,
  /contactless\s+debit/i,
  /pay\s+contactless/i,
  /tap\s+(?:to\s+)?pay/i,  // often co-occurs with contactless payment context
  /contact-?free\s+pay/i,
];

// ---------------------------------------------------------------------------
// AI Verification — use Claude Haiku to assess review context
// ---------------------------------------------------------------------------

/**
 * Use Claude AI to verify whether review evidence actually indicates a
 * touchless car wash, or if keywords appear in a negative context (e.g.,
 * "looking for brushless, go elsewhere" or "even a touchless wash is better").
 *
 * Returns { isTouchless, reasoning, sentiment } where reasoning explains the verdict
 * and sentiment is the overall touchless experience sentiment (positive/negative/neutral).
 * Falls back to keyword-only match (isTouchless=true) if AI is unavailable.
 */

async function verifyTouchlessWithAI(
  anthropicKey: string,
  carWashName: string,
  reviews: SerpApiReview[],
): Promise<{ isTouchless: boolean; reasoning: string; sentiment: 'positive' | 'negative' | 'neutral' | null }> {
  if (!anthropicKey) {
    return { isTouchless: true, reasoning: 'AI verification unavailable — no API key', sentiment: null };
  }

  const reviewTexts = reviews
    .map((r, i) => {
      const text = r.snippet || r.extracted_snippet?.original || '';
      return text ? `Review ${i + 1}: "${text}"` : null;
    })
    .filter(Boolean)
    .join('\n');

  if (!reviewTexts) {
    return { isTouchless: false, reasoning: 'No review text to evaluate' };
  }

  const prompt = `You are evaluating whether a car wash business actually offers touchless/brushless washing based on customer reviews.

Business name: "${carWashName}"

Reviews that mention touchless-related keywords:
${reviewTexts}

Does the evidence indicate this car wash actually HAS or OFFERS a touchless, brushless, or no-touch wash?

Rules:
- Say YES only if reviewers CLEARLY and EXPLICITLY describe THIS car wash AS being touchless/brushless/no-touch
- Say NO if reviewers are comparing to touchless elsewhere, wishing it was touchless, or saying it's NOT touchless
- Say NO if keywords appear in negative context ("go elsewhere for brushless", "even a touchless wash does better", "not touchless", "not touch free", "isn't touchless")
- CRITICAL: "Not touch free", "not touchless", "isn't brushless" etc. mean the car wash is NOT touchless — say NO
- Say NO if the review is a negative/complaint review that mentions touch-free only to deny it
- Say NO if the review describes the wash as having brushes or being a brush/friction wash
- CRITICAL: "Soft touch" or "soft-touch" means the wash uses soft cloth/foam BRUSHES — this is NOT touchless. Say NO if "soft touch" is the only evidence
- Say NO if the keyword is used to describe a different business or a general concept, not THIS car wash
- Say NO if the keyword appears only incidentally (e.g. "spotless", "untouched") and the review is just describing a general positive experience without specifically confirming touchless/brushless wash technology
- Say NO if the review is truncated and you cannot clearly confirm the keyword is used to describe the wash type
- When in doubt, say NO — it is better to miss a real touchless wash than to incorrectly label one

If YES, also assess the overall SENTIMENT of the touchless experience described in the reviews:
- POSITIVE: Reviewers are happy with the touchless wash quality, recommend it, or describe good results
- NEGATIVE: Reviewers complain about the touchless wash quality, describe damage, poor cleaning, or bad experience
- NEUTRAL: Mixed opinions, purely factual mentions, or not enough context to judge quality

Respond in this exact format:
TOUCHLESS: YES or NO
SENTIMENT: POSITIVE, NEGATIVE, or NEUTRAL (only if TOUCHLESS is YES)
REASON: [one brief sentence]`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Anthropic API error: ${res.status} ${errText}`);
      return { isTouchless: true, reasoning: 'AI verification failed — falling back to keyword match' };
    }

    const data = await res.json();
    const answer = (data.content?.[0]?.text || '').trim();

    // Parse response
    const touchlessMatch = answer.match(/TOUCHLESS:\s*(YES|NO)/i);
    const sentimentMatch = answer.match(/SENTIMENT:\s*(POSITIVE|NEGATIVE|NEUTRAL)/i);
    const reasonMatch = answer.match(/REASON:\s*(.+)/i);

    const isTouchless = touchlessMatch ? touchlessMatch[1].toUpperCase() === 'YES' : true;
    const reasoning = reasonMatch ? reasonMatch[1].trim() : answer.slice(0, 200);
    const sentiment = isTouchless && sentimentMatch
      ? sentimentMatch[1].toLowerCase() as 'positive' | 'negative' | 'neutral'
      : null;

    return { isTouchless, reasoning, sentiment };
  } catch (err) {
    console.error('AI verification failed:', err);
    return { isTouchless: true, reasoning: 'AI verification timed out — falling back to keyword match', sentiment: null };
  }
}

// ---------------------------------------------------------------------------
// Sentiment analysis (touchless-specific)
// ---------------------------------------------------------------------------

/**
 * Analyze touchless sentiment from existing review snippets using Claude Haiku.
 * Used for backfilling sentiment on listings that were already scanned.
 * Returns positive/negative/neutral based on how reviewers describe the touchless experience.
 */
async function analyzeTouchlessSentiment(
  anthropicKey: string,
  carWashName: string,
  snippetTexts: string[],
): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; reasoning: string } | null> {
  if (!anthropicKey || snippetTexts.length === 0) return null;

  const reviewTexts = snippetTexts
    .map((text, i) => `Review ${i + 1}: "${text}"`)
    .join('\n');

  const prompt = `You are evaluating the overall sentiment of the touchless car wash experience based on customer reviews.

Business name: "${carWashName}"

Reviews mentioning the touchless wash:
${reviewTexts}

What is the OVERALL sentiment about the TOUCHLESS wash experience specifically?

Classification rules:
- POSITIVE: The MAJORITY of reviews are happy with the touchless wash quality, recommend it, or describe good results. At most 1-2 minor complaints among mostly positive reviews.
- NEGATIVE: The MAJORITY of reviews complain about the touchless wash quality, describe damage, poor cleaning, or bad experience. At most 1-2 positive mentions among mostly negative reviews.
- NEUTRAL: There is a SIGNIFICANT MIX of both positive AND negative reviews. Use NEUTRAL whenever at least 30% of reviews are positive AND at least 30% are negative. Also use for purely factual mentions or not enough context.

IMPORTANT: When reviews are split (some positive, some negative), ALWAYS classify as NEUTRAL. Only use POSITIVE or NEGATIVE when sentiment clearly leans one way.

Respond in this exact format:
SENTIMENT: POSITIVE, NEGATIVE, or NEUTRAL
REASON: [one brief sentence]`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const answer = (data.content?.[0]?.text || '').trim();

    const sentimentMatch = answer.match(/SENTIMENT:\s*(POSITIVE|NEGATIVE|NEUTRAL)/i);
    const reasonMatch = answer.match(/REASON:\s*(.+)/i);

    if (!sentimentMatch) return null;

    return {
      sentiment: sentimentMatch[1].toLowerCase() as 'positive' | 'negative' | 'neutral',
      reasoning: reasonMatch ? reasonMatch[1].trim() : '',
    };
  } catch {
    return null;
  }
}

/**
 * Get total scanned counts via the review_mine_counts RPC.
 *
 * Uses a direct fetch with the ANON key (not service role key) because
 * the Supabase JS client with the service role key inexplicably returns
 * 0 for scanned_clean queries from within edge functions — even though
 * the same queries work from curl. The anon-key RPC call is verified
 * to return correct results both locally and from edge functions.
 */
async function getTotalScannedCount(
  supabase: ReturnType<typeof createClient>,
): Promise<{ scannedClean: number; touchlessFound: number; totalScanned: number; totalRemaining: number }> {
  const zeros = { scannedClean: 0, touchlessFound: 0, totalScanned: 0, totalRemaining: 0 };
  try {
    const { data, error } = await supabase.rpc('review_mine_counts');
    if (error) {
      console.error('[counts] RPC error:', error.message);
      return zeros;
    }

    const counts = data as Record<string, number> | null;
    return {
      scannedClean: counts?.scanned_clean ?? 0,
      touchlessFound: counts?.touchless_found ?? 0,
      totalScanned: counts?.total_scanned ?? 0,
      totalRemaining: counts?.total_remaining ?? 0,
    };
  } catch (err) {
    console.error('[counts] getTotalScannedCount failed:', err);
    return zeros;
  }
}

/**
 * Call SerpAPI Google Maps Reviews with keyword query.
 * Fetches up to 20 results per page (SerpAPI max) to minimize API calls.
 * Supports pagination via next_page_token; maxPages caps total API calls.
 */
async function searchReviews(
  serpApiKey: string,
  placeId: string,
  query: string,
  opts?: { sort_by?: string; maxPages?: number; num?: number },
): Promise<{ reviews: SerpApiReview[]; apiCalls: number; error?: string }> {
  const maxPages = opts?.maxPages ?? 1;
  const num = opts?.num ?? 20; // Max 20 per page — get the most per API call
  const allReviews: SerpApiReview[] = [];
  let apiCalls = 0;
  let nextPageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      engine: 'google_maps_reviews',
      place_id: placeId,
      api_key: serpApiKey,
      hl: 'en',
    });
    // num param only works when query, next_page_token, or topic_id is set
    if (query || nextPageToken) params.set('num', String(num));
    if (query) params.set('query', query);
    if (opts?.sort_by) params.set('sort_by', opts.sort_by);
    if (nextPageToken) params.set('next_page_token', nextPageToken);

    try {
      const res = await fetch(`https://serpapi.com/search.json?${params}`, {
        signal: AbortSignal.timeout(30000),
      });
      apiCalls++;

      if (!res.ok) {
        const errText = await res.text();
        console.error(`SerpAPI error for ${placeId}: ${res.status} ${errText}`);
        if (allReviews.length > 0) break; // Return what we have so far
        return { reviews: [], apiCalls, error: `HTTP ${res.status}: ${errText}` };
      }

      const data: SerpApiResponse = await res.json();

      if (data.error) {
        if (allReviews.length > 0) break;
        return { reviews: [], apiCalls, error: data.error };
      }

      const pageReviews = data.reviews || [];
      allReviews.push(...pageReviews);

      // Check for next page
      nextPageToken = data.serpapi_pagination?.next_page_token;
      if (!nextPageToken || pageReviews.length === 0) break;

      console.log(`[serpapi] Page ${page + 1}: got ${pageReviews.length} reviews, fetching next page...`);
    } catch (err) {
      console.error(`SerpAPI fetch failed for ${placeId} (page ${page + 1}):`, err);
      if (allReviews.length > 0) break;
      return { reviews: [], apiCalls, error: String(err) };
    }
  }

  return { reviews: allReviews, apiCalls };
}

/**
 * Search reviews for touchless-related keywords.
 *
 * Strategy:
 * 1. Query "touch" — one call catches touchless, no-touch, touch-free, soft-touch
 * 2. Query "brushless" — fallback only if "touch" found nothing (catches brushless, brush-free)
 *
 * Locally verifies every result against REVIEW_TOUCHLESS_KEYWORDS before accepting.
 */
async function searchReviewsMultiKeyword(
  serpApiKey: string,
  placeId: string,
): Promise<{ reviews: SerpApiReview[]; apiCalls: number; error?: string }> {
  // Single query using OR operator — searches for all touchless-related keywords.
  // 1 API call with num=20 captures up to 20 keyword-matched reviews.
  // "touch" catches: touchless, no-touch, touch-free, soft-touch, touch less
  // "brushless" catches: brushless, brush-free
  // "laser" catches: laser wash, laserwash
  // "contactless" catches: contactless, contact-free
  const result = await searchReviews(serpApiKey, placeId, 'touch OR brushless OR laser OR contactless');

  if (result.error) {
    return { reviews: [], apiCalls: result.apiCalls, error: result.error };
  }

  // Filter to only reviews that genuinely contain our exact keywords
  const verified = filterVerifiedReviews(result.reviews);
  console.log(`[multi-kw] ${result.reviews.length} raw → ${verified.length} verified (${result.apiCalls} API calls)`);
  return { reviews: verified, apiCalls: result.apiCalls };
}

/**
 * Extract keyword matches from a review text.
 * Filters out "contactless" when it only refers to payment, not wash type.
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const matches = REVIEW_TOUCHLESS_KEYWORDS.filter((kw) => lower.includes(kw));

  // If the only matched keywords are contactless-family, check for payment context
  const CONTACTLESS_FAMILY = ['contactless', 'contact-free', 'contact free'];
  const hasOnlyContactless = matches.length > 0 && matches.every((kw) => CONTACTLESS_FAMILY.includes(kw));

  if (hasOnlyContactless) {
    const isPaymentContext = CONTACTLESS_PAYMENT_PATTERNS.some((p) => p.test(text));
    if (isPaymentContext) {
      return []; // "contactless payment" — not about wash type
    }
  }

  return matches;
}

/**
 * Negation patterns that indicate the review is saying the wash is NOT touchless.
 * e.g. "Not touch free", "isn't touchless", "not a brushless wash"
 */
const NEGATION_PATTERNS = [
  /\bnot\s+touch\s*-?\s*(?:less|free)\b/i,
  /\bnot\s+brush\s*-?\s*(?:less|free)\b/i,
  /\bnot\s+(?:a\s+)?(?:touchless|brushless|touch-free|brush-free|laser\s*wash)\b/i,
  /\bisn'?t\s+(?:touchless|brushless|touch-free|brush-free|touch\s*free|(?:a\s+)?laser\s*wash)\b/i,
  /\bno(?:t|thing)\s+(?:touchless|touch-free|touch\s*free|laser\s*wash)\b/i,
  /\bwasn'?t\s+(?:touchless|brushless|touch-free|touch\s*free|(?:a\s+)?laser\s*wash)\b/i,
];

/**
 * Check if a review text negates the touchless keywords
 * (e.g., "Not touch free", "isn't touchless").
 */
function hasNegation(text: string): boolean {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Filter SerpAPI reviews to only those that genuinely contain touchless keywords
 * AND do not negate them (e.g., "not touch free" is rejected).
 * SerpAPI's query parameter does fuzzy matching, so many returned reviews
 * don't actually contain our keywords.
 */
function filterVerifiedReviews(reviews: SerpApiReview[]): SerpApiReview[] {
  return reviews.filter((r) => {
    const text = r.snippet || r.extracted_snippet?.original;
    if (!text) return false;
    if (extractKeywords(text).length === 0) return false;
    // Reject reviews that negate the keyword (e.g., "Not touch free")
    if (hasNegation(text)) {
      console.log(`[filter] Rejecting negated review: "${text.slice(0, 100)}"`);
      return false;
    }
    return true;
  });
}

/**
 * Insert SerpAPI review evidence into the review_snippets table.
 * ONLY inserts reviews that genuinely contain touchless keywords.
 */
async function insertSerpApiReviewSnippets(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  reviews: SerpApiReview[],
): Promise<number> {
  if (!reviews.length) return 0;

  const snippets: Array<Record<string, unknown>> = [];

  for (const review of reviews) {
    const text = review.snippet || review.extracted_snippet?.original;
    if (!text) continue;

    const matchedKeywords = extractKeywords(text);
    // ONLY insert reviews that actually contain touchless keywords
    if (matchedKeywords.length === 0) continue;

    snippets.push({
      listing_id: listingId,
      reviewer_name: review.user?.name || null,
      rating: review.rating || null,
      review_text: text.slice(0, 2000),
      review_date: review.date || null,
      iso_date: review.iso_date || null,
      review_id: review.review_id || null,
      touchless_keywords: matchedKeywords,
      is_touchless_evidence: true,
      source: 'serpapi',
    });
  }

  if (snippets.length === 0) return 0;

  // Use upsert with review_id to avoid duplicates on re-runs
  const { error } = await supabase
    .from('review_snippets')
    .upsert(snippets, { onConflict: 'review_id', ignoreDuplicates: true });

  if (error) {
    console.error('Failed to insert review snippets:', error.message);
    // Try insert without upsert (in case review_id is null)
    const { error: insertError } = await supabase.from('review_snippets').insert(snippets);
    if (insertError) {
      console.error('Insert fallback also failed:', insertError.message);
      return 0;
    }
  }

  return snippets.length;
}

// ---------------------------------------------------------------------------
// Google Places API helpers (for prospect action)
// ---------------------------------------------------------------------------

const SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.types',
  'places.primaryType',
].join(',');

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
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
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
  photos?: Array<{ name: string; widthPx: number; heightPx: number }>;
  editorialSummary?: { text: string; languageCode?: string };
  priceLevel?: string;
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  reviews?: Array<{
    text?: { text: string };
    rating?: number;
    originalText?: { text: string };
    authorAttribution?: { displayName: string };
  }>;
}

/** Google Places types that definitively mark a business as NOT a car wash. */
const EXCLUDE_PLACE_TYPES = new Set([
  'doctor', 'dentist', 'hospital', 'health', 'physiotherapist', 'dermatologist',
  'pharmacy', 'drugstore', 'spa', 'beauty_salon', 'hair_care', 'hair_salon',
  'veterinary_care', 'lawyer', 'accounting', 'insurance_agency', 'real_estate_agency',
  'restaurant', 'cafe', 'bar', 'bakery', 'meal_delivery', 'meal_takeaway', 'food',
  'school', 'university', 'primary_school', 'secondary_school',
  'church', 'mosque', 'synagogue', 'bank', 'finance',
  'clothing_store', 'shoe_store', 'jewelry_store',
  'electronics_store', 'furniture_store', 'home_goods_store',
  'gym', 'movie_theater', 'night_club', 'lodging', 'hotel', 'motel',
  'laundry', 'dry_cleaning', 'plumber', 'electrician', 'roofing_contractor', 'painter',
]);

const EXCLUDE_NAME_KEYWORDS = [
  'dermatology', 'derma', 'dental', 'dentist', 'medical', 'clinic', 'hospital',
  'surgery', 'surgeon', 'orthodont', 'chiropractic', 'physical therapy', 'optom',
  'pharmacy', 'veterinar', 'animal hospital',
  'salon', 'barbershop', 'barber', 'nail ', 'nails ', 'tattoo',
  'restaurant', 'pizza', 'burger', 'cafe', 'coffee', 'bakery', 'grill', 'bistro', 'diner',
  'church', 'school', 'university', 'academy',
  'law firm', 'attorney', 'legal service',
  'insurance', 'real estate', 'realty', 'hotel', 'motel',
  'gym', 'fitness', 'crossfit', 'yoga',
  'laundromat', 'dry clean', 'plumbing', 'electric', 'roofing', 'hvac',
  'pet grooming', 'dog grooming',
];

function isLikelyCarWash(place: PlaceResult): boolean {
  const types = new Set(place.types || []);
  if (types.has('car_wash')) return true;
  if (place.primaryType === 'car_wash') return true;
  if (place.primaryType && EXCLUDE_PLACE_TYPES.has(place.primaryType)) return false;
  for (const t of types) {
    if (EXCLUDE_PLACE_TYPES.has(t)) return false;
  }
  const lowerName = (place.displayName?.text || '').toLowerCase();
  for (const kw of EXCLUDE_NAME_KEYWORDS) {
    if (lowerName.includes(kw)) return false;
  }
  return true;
}

async function searchPlaces(
  googleApiKey: string,
  query: string,
): Promise<PlaceResult[]> {
  const allResults: PlaceResult[] = [];
  const seenIds = new Set<string>();

  // Search for car washes in the area
  const queries = [query.startsWith('touchless ') ? query : `car wash ${query}`];

  for (const q of queries) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': SEARCH_FIELDS,
        },
        body: JSON.stringify({
          textQuery: q,
          maxResultCount: 20,
          languageCode: 'en',
        }),
      });

      if (!res.ok) {
        console.error(`Places search error for "${q}": ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const place of data.places || []) {
        if (!seenIds.has(place.id)) {
          seenIds.add(place.id);
          allResults.push(place);
        }
      }
    } catch (err) {
      console.error(`Places search failed for "${q}":`, err);
    }
  }

  return allResults.filter(isLikelyCarWash);
}

async function getPlaceDetails(
  googleApiKey: string,
  placeId: string,
): Promise<PlaceResult | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': DETAIL_FIELDS,
        },
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function parseAddress(formatted: string): {
  address: string; city: string; state: string; zip: string;
} {
  const parts = formatted.split(',').map((s) => s.trim());
  if (parts.length >= 3) {
    const address = parts[0];
    const city = parts[1];
    const stateZipCountry = parts[2].trim();
    const stateZipMatch = stateZipCountry.match(/^([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);
    if (stateZipMatch) {
      return { address, city, state: stateZipMatch[1], zip: stateZipMatch[2] || '' };
    }
    return { address, city, state: stateZipCountry, zip: '' };
  }
  return { address: formatted, city: '', state: '', zip: '' };
}

function parseHours(
  openingHours?: { weekdayDescriptions?: string[] },
): Record<string, string> | null {
  if (!openingHours?.weekdayDescriptions?.length) return null;
  const hours: Record<string, string> = {};
  for (const desc of openingHours.weekdayDescriptions) {
    const colonIdx = desc.indexOf(':');
    if (colonIdx > 0) {
      const day = desc.substring(0, colonIdx).trim().toLowerCase();
      const time = desc.substring(colonIdx + 1).trim();
      hours[day] = time;
    }
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

function mapPriceLevel(level?: string): string | null {
  if (!level) return null;
  const map: Record<string, string> = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  return map[level] || null;
}

function inferAmenities(name: string, types: string[]): string[] {
  const amenities: string[] = [];
  const lower = name.toLowerCase();
  const typeSet = new Set(types);
  if (typeSet.has('gas_station')) amenities.push('Gas Station');
  if (typeSet.has('convenience_store')) amenities.push('Convenience Store');
  if (typeSet.has('atm')) amenities.push('ATM');
  if (lower.includes('vacuum') || lower.includes('vac')) amenities.push('Free Vacuum');
  if (lower.includes('detail')) amenities.push('Detailing Services');
  if (lower.includes('express')) amenities.push('Express Wash');
  if (lower.includes('unlimited') || lower.includes('membership')) amenities.push('Unlimited Wash Plans');
  return amenities;
}

function inferWashTypes(name: string): string[] {
  const types: string[] = [];
  const lower = name.toLowerCase();
  if (
    lower.includes('touchless') || lower.includes('touch-free') || lower.includes('touch free') ||
    lower.includes('brushless') || lower.includes('brush-free') || lower.includes('brush free') ||
    lower.includes('laser') || lower.includes('frictionless') || lower.includes('no-touch') ||
    lower.includes('no touch')
  ) {
    types.push('touchless_automatic');
  }
  return types;
}

function extractPaymentMethods(opts?: PlaceResult['paymentOptions']): string[] {
  if (!opts) return [];
  const methods: string[] = [];
  if (opts.acceptsCreditCards) methods.push('Credit Cards');
  if (opts.acceptsDebitCards) methods.push('Debit Cards');
  if (opts.acceptsCashOnly) methods.push('Cash Only');
  if (opts.acceptsNfc) methods.push('Contactless / NFC');
  return methods;
}

function extractReviewHighlights(reviews?: PlaceResult['reviews']): string[] {
  if (!reviews?.length) return [];
  return reviews
    .filter((r) => r.text?.text && (r.rating ?? 0) >= 4)
    .slice(0, 5)
    .map((r) => r.text!.text.slice(0, 200));
}

function getPhotoUrls(
  photos: Array<{ name: string; widthPx: number; heightPx: number }> | undefined,
  googleApiKey: string,
): string[] {
  if (!photos?.length) return [];
  return photos.slice(0, 10).map(
    (p) =>
      `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=800&maxWidthPx=1200&key=${googleApiKey}`,
  );
}

/**
 * Build a complete listing data object from Google Place details.
 * Used for the prospect action to create new listings.
 */
async function buildListingData(
  details: PlaceResult,
  googleApiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown> | null> {
  const status = details.businessStatus;
  if (status === 'CLOSED_PERMANENTLY' || status === 'CLOSED_TEMPORARILY') {
    return null;
  }

  const name = details.displayName?.text || 'Unknown Car Wash';

  let address = '';
  let city = '';
  let state = '';
  let zip = '';

  if (details.addressComponents?.length) {
    const comps = details.addressComponents;
    const findComp = (type: string) => comps.find((c) => c.types?.includes(type));
    const streetNumber = findComp('street_number')?.longText || '';
    const route = findComp('route')?.longText || '';
    address = [streetNumber, route].filter(Boolean).join(' ');
    city = findComp('locality')?.longText || findComp('sublocality')?.longText || '';
    state = findComp('administrative_area_level_1')?.shortText || '';
    zip = findComp('postal_code')?.longText || '';
  } else if (details.formattedAddress) {
    const parsed = parseAddress(details.formattedAddress);
    address = parsed.address;
    city = parsed.city;
    state = parsed.state;
    zip = parsed.zip;
  }

  const hours = parseHours(details.regularOpeningHours);
  const slug = await makeUniqueSlug(supabase, name);
  const photoUrls = getPhotoUrls(details.photos, googleApiKey);
  const heroImage = photoUrls[0] || null;

  const lat = details.location?.latitude;
  const lng = details.location?.longitude;
  const streetViewUrl =
    lat && lng
      ? `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${lat},${lng}&key=${googleApiKey}`
      : null;

  const amenities = inferAmenities(name, details.types || []);
  const washTypes = inferWashTypes(name);
  // For review-mined listings, always include touchless_automatic
  if (!washTypes.includes('touchless_automatic')) {
    washTypes.push('touchless_automatic');
  }

  const paymentMethods = extractPaymentMethods(details.paymentOptions);
  const reviewHighlights = extractReviewHighlights(details.reviews);
  const priceRange = mapPriceLevel(details.priceLevel);

  const description = details.editorialSummary?.text ||
    `${name} is a touchless car wash located in ${city}, ${state}. Visit for a scratch-free, no-contact clean that protects your vehicle's finish.`;

  const extractedData: Record<string, unknown> = {};
  if (paymentMethods.length) extractedData.payment_methods = paymentMethods;
  if (reviewHighlights.length) extractedData.review_highlights = reviewHighlights;
  if (amenities.length) extractedData.amenities_detailed = amenities;

  return {
    slug,
    name,
    address,
    city,
    state,
    zip,
    phone: details.nationalPhoneNumber || details.internationalPhoneNumber || null,
    website: details.websiteUri || null,
    hours: hours || {},
    wash_packages: [],
    amenities,
    photos: photoUrls,
    hero_image: heroImage,
    google_photo_url: heroImage,
    google_photos_count: details.photos?.length || 0,
    street_view_url: streetViewUrl,
    rating: details.rating || 0,
    review_count: details.userRatingCount || 0,
    latitude: lat || null,
    longitude: lng || null,
    is_touchless: true,
    is_approved: true,
    is_featured: false,
    google_id: details.id,
    google_place_id: details.id?.replace(/^places\//, '') || null,
    google_maps_url: details.googleMapsUri || null,
    google_category: details.primaryType || null,
    google_subtypes: details.types?.join(', ') || null,
    business_status: details.businessStatus || null,
    google_description: details.editorialSummary?.text || null,
    description,
    description_generated_at: new Date().toISOString(),
    touchless_wash_types: washTypes,
    price_range: priceRange,
    extracted_data: Object.keys(extractedData).length > 0 ? extractedData : null,
    crawl_status: 'classified',
    crawl_notes: 'Imported via review mining — touchless evidence found in Google reviews.',
    review_mine_status: 'touchless_found',
  };
}

// ---------------------------------------------------------------------------
// Filter sync (reused from discover-touchless)
// ---------------------------------------------------------------------------

const AMENITY_TO_FILTER_SLUG: Record<string, string> = {
  'Free Vacuum': 'free-vacuum',
  'Free Vacuums': 'free-vacuum',
  'Vacuum': 'free-vacuum',
  'Unlimited Wash Club': 'unlimited-wash-club',
  'Membership': 'unlimited-wash-club',
  'Monthly Plan': 'unlimited-wash-club',
  'Unlimited': 'unlimited-wash-club',
  'Unlimited Wash Plans': 'unlimited-wash-club',
  'Express Wash': 'touchless-automatic',
  'RV Wash': 'rv-oversized',
  'Truck Wash': 'rv-oversized',
  'Oversized Vehicle': 'rv-oversized',
  'RV/Truck Wash': 'rv-oversized',
};

type FilterMap = Record<string, number>;

async function syncFiltersForListing(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  isTouchless: boolean | null,
  amenities: string[],
  filterMap: FilterMap,
): Promise<void> {
  const inserts: { listing_id: string; filter_id: number }[] = [];
  if (isTouchless === true && filterMap['touchless-automatic']) {
    inserts.push({ listing_id: listingId, filter_id: filterMap['touchless-automatic'] });
  }
  for (const amenity of amenities) {
    const slug = AMENITY_TO_FILTER_SLUG[amenity];
    if (slug && filterMap[slug]) {
      inserts.push({ listing_id: listingId, filter_id: filterMap[slug] });
    }
  }
  if (inserts.length > 0) {
    await supabase.from('listing_filters').upsert(inserts, { onConflict: 'listing_id,filter_id' });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get SerpAPI key
    const serpApiKey =
      Deno.env.get('SERPAPI_KEY') ??
      (await getSecret(supabaseUrl, serviceKey, 'SERPAPI_KEY'));

    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ error: 'SerpAPI key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get Anthropic API key for AI verification (optional — falls back to keyword-only)
    const anthropicKey =
      Deno.env.get('ANTHROPIC_API_KEY') ??
      (await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY'));

    const body = await req.json();
    const action = body.action as string;

    // -----------------------------------------------------------------------
    // ACTION: scan_batch — scan existing non-touchless car wash listings
    // -----------------------------------------------------------------------
    if (action === 'scan_batch') {
      const batchSize = Math.min(body.batch_size || 50, 100);

      // Fetch car wash listings that haven't been scanned yet (review_mine_status IS NULL).
      // Includes both previously-touchless and unclassified listings so re-scans work correctly.
      const { data: listings, error: fetchError } = await supabase
        .from('listings')
        .select('id, name, slug, google_place_id, google_maps_url, city, state, rating, review_count, is_touchless')
        .is('review_mine_status', null)
        .not('google_place_id', 'is', null)
        .or('google_category.in.("Car wash","car_wash","Self service car wash"),and(google_category.is.null,name.ilike.%car wash%),and(google_category.is.null,name.ilike.%carwash%)')
        .order('review_count', { ascending: false, nullsFirst: false }) // Prioritize listings with more reviews, NULLs last
        .limit(batchSize);

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch listings', details: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!listings?.length) {
        const counts = await getTotalScannedCount(supabase);

        return new Response(
          JSON.stringify({
            message: 'No more listings to scan',
            scanned_this_batch: 0,
            found_touchless: 0,
            total_scanned: counts.totalScanned,
            total_touchless_found: counts.touchlessFound,
            complete: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Load filter map for filter sync
      const { data: filters } = await supabase
        .from('filters')
        .select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of filters || []) {
        filterMap[f.slug] = f.id;
      }

      const results: Array<{
        id: string;
        name: string;
        city: string;
        state: string;
        slug: string;
        google_place_id: string;
        google_maps_url: string | null;
        status: string;
        reviewCount: number;
        apiCalls: number;
        aiVerdict?: string;
        reviews: Array<{ text: string; rating: number | null; reviewer: string | null; keywords: string[] }>;
      }> = [];

      let scanned = 0;
      let foundTouchless = 0;
      let totalApiCalls = 0;
      let aiRejected = 0;

      for (const listing of listings) {
        scanned++;

        const { reviews, apiCalls, error } = await searchReviewsMultiKeyword(
          serpApiKey,
          listing.google_place_id,
        );
        totalApiCalls += apiCalls;

        if (error) {
          // SerpAPI error — still mark as scanned_clean so it doesn't get retried endlessly
          console.error(`Error scanning ${listing.name}: ${error}`);
          await supabase.from('listings').update({
            review_mine_status: 'scanned_clean',
            crawl_notes: `Review mine SerpAPI error: ${error}`,
          }).eq('id', listing.id);

          results.push({
            id: listing.id,
            name: listing.name,
            city: listing.city,
            state: listing.state,
            slug: listing.slug,
            google_place_id: listing.google_place_id,
            google_maps_url: listing.google_maps_url,
            status: 'error',
            reviewCount: 0,
            apiCalls,
            reviews: [],
          });
          continue;
        }

        if (reviews.length > 0) {
          // Keywords found — now verify with AI that context is actually positive
          const aiResult = await verifyTouchlessWithAI(
            anthropicKey,
            listing.name,
            reviews,
          );

          const reviewMapped = reviews.map((r) => ({
            text: r.snippet || r.extracted_snippet?.original || '',
            rating: r.rating ?? null,
            reviewer: r.user?.name ?? null,
            keywords: extractKeywords(r.snippet || r.extracted_snippet?.original || ''),
          }));

          if (aiResult.isTouchless) {
            // AI confirmed — reclassify as touchless!
            foundTouchless++;

            const snippetCount = await insertSerpApiReviewSnippets(supabase, listing.id, reviews);

            await supabase.from('listings').update({
              is_touchless: true,
              is_approved: true,
              review_mine_status: 'touchless_found',
              review_extract_status: 'extracted',
              touchless_review_count: snippetCount,
              touchless_sentiment: aiResult.sentiment,
              crawl_notes: `Reclassified as touchless via review mining (AI verified) — ${snippetCount} review(s). AI: ${aiResult.reasoning}`,
            }).eq('id', listing.id);

            await syncFiltersForListing(supabase, listing.id, true, [], filterMap);

            results.push({
              id: listing.id,
              name: listing.name,
              city: listing.city,
              state: listing.state,
              slug: listing.slug,
              google_place_id: listing.google_place_id,
              google_maps_url: listing.google_maps_url,
              status: 'touchless_found',
              reviewCount: snippetCount,
              apiCalls: apiCalls,
              aiVerdict: `✅ ${aiResult.reasoning}`,
              reviews: reviewMapped,
              touchlessSentiment: aiResult.sentiment,
            });
          } else {
            // AI rejected — keywords found but in negative context
            aiRejected++;

            await supabase.from('listings').update({
              review_mine_status: 'scanned_clean',
              crawl_notes: `Review mine AI rejected: ${aiResult.reasoning}`,
            }).eq('id', listing.id);

            results.push({
              id: listing.id,
              name: listing.name,
              city: listing.city,
              state: listing.state,
              slug: listing.slug,
              google_place_id: listing.google_place_id,
              google_maps_url: listing.google_maps_url,
              status: 'ai_rejected',
              reviewCount: 0,
              apiCalls,
              aiVerdict: `❌ ${aiResult.reasoning}`,
              reviews: reviewMapped,
            });
          }
        } else {
          // No keyword matches — mark as scanned clean
          await supabase.from('listings').update({
            review_mine_status: 'scanned_clean',
          }).eq('id', listing.id);

          results.push({
            id: listing.id,
            name: listing.name,
            city: listing.city,
            state: listing.state,
            slug: listing.slug,
            google_place_id: listing.google_place_id,
            google_maps_url: listing.google_maps_url,
            status: 'scanned_clean',
            reviewCount: 0,
            apiCalls,
            reviews: [],
          });
        }
      }

      // Get total progress
      const counts = await getTotalScannedCount(supabase);

      // Trigger full enrichment pipeline for newly reclassified listings
      // (crawl website → extract amenities/packages → generate AI description)
      const touchlessIds = results
        .filter((r: { status: string }) => r.status === 'touchless_found')
        .map((r: { id: string }) => r.id);

      if (touchlessIds.length > 0) {
        const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/discover-touchless`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnon}`,
            },
            body: JSON.stringify({
              action: 'enrich',
              listing_ids: touchlessIds,
            }),
          }).catch((err) => console.error('Failed to trigger enrichment pipeline:', err))
        );
      }

      return new Response(
        JSON.stringify({
          scanned_this_batch: scanned,
          found_touchless: foundTouchless,
          ai_rejected: aiRejected,
          api_calls_used: totalApiCalls,
          total_scanned: counts.totalScanned,
          total_remaining: counts.totalRemaining,
          total_touchless_found: counts.touchlessFound,
          complete: counts.totalRemaining === 0,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: scan_single — scan a single listing by ID
    // -----------------------------------------------------------------------
    if (action === 'scan_single') {
      const listingId = body.listing_id;
      if (!listingId) {
        return new Response(
          JSON.stringify({ error: 'listing_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: listing } = await supabase
        .from('listings')
        .select('id, name, google_place_id, city, state')
        .eq('id', listingId)
        .maybeSingle();

      if (!listing?.google_place_id) {
        return new Response(
          JSON.stringify({ error: 'Listing not found or missing google_place_id' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { reviews, apiCalls, error } = await searchReviewsMultiKeyword(
        serpApiKey,
        listing.google_place_id,
      );

      if (error) {
        return new Response(
          JSON.stringify({ error: `SerpAPI error: ${error}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (reviews.length > 0) {
        // AI verification step
        const aiResult = await verifyTouchlessWithAI(anthropicKey, listing.name, reviews);

        const reviewMapped = reviews.map((r) => ({
          text: r.snippet || r.extracted_snippet?.original || '',
          rating: r.rating,
          reviewer: r.user?.name,
          keywords: extractKeywords(r.snippet || r.extracted_snippet?.original || ''),
        }));

        if (aiResult.isTouchless) {
          const snippetCount = await insertSerpApiReviewSnippets(supabase, listing.id, reviews);

          // Load filter map
          const { data: filters } = await supabase.from('filters').select('id, slug');
          const filterMap: FilterMap = {};
          for (const f of filters || []) filterMap[f.slug] = f.id;

          await supabase.from('listings').update({
            is_touchless: true,
            is_approved: true,
            review_mine_status: 'touchless_found',
            review_extract_status: 'extracted',
            touchless_review_count: snippetCount,
            touchless_sentiment: aiResult.sentiment,
            crawl_notes: `Reclassified as touchless via review mining (AI verified) — ${snippetCount} review(s). AI: ${aiResult.reasoning}`,
          }).eq('id', listing.id);

          await syncFiltersForListing(supabase, listing.id, true, [], filterMap);

          return new Response(
            JSON.stringify({
              status: 'touchless_found',
              name: listing.name,
              review_count: snippetCount,
              api_calls: apiCalls,
              ai_verdict: `✅ ${aiResult.reasoning}`,
              reviews: reviewMapped,
              touchless_sentiment: aiResult.sentiment,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        } else {
          // AI rejected — keywords in negative context
          await supabase.from('listings').update({
            review_mine_status: 'scanned_clean',
            crawl_notes: `Review mine AI rejected: ${aiResult.reasoning}`,
          }).eq('id', listing.id);

          return new Response(
            JSON.stringify({
              status: 'ai_rejected',
              name: listing.name,
              review_count: 0,
              api_calls: apiCalls,
              ai_verdict: `❌ ${aiResult.reasoning}`,
              reviews: reviewMapped,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      await supabase.from('listings').update({
        review_mine_status: 'scanned_clean',
      }).eq('id', listing.id);

      return new Response(
        JSON.stringify({
          status: 'scanned_clean',
          name: listing.name,
          review_count: 0,
          api_calls: apiCalls,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: progress — get current scan progress
    // -----------------------------------------------------------------------
    if (action === 'progress') {
      // Get scan progress counts
      const counts = await getTotalScannedCount(supabase);

      // Get recently found listings for display (with google_maps_url for verification)
      const { data: recentFinds } = await supabase
        .from('listings')
        .select('id, name, city, state, slug, google_place_id, google_maps_url, touchless_review_count')
        .eq('review_mine_status', 'touchless_found')
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch review snippets for recent finds
      const findIds = (recentFinds || []).map((f: Record<string, unknown>) => f.id as string);
      let reviewsByListing: Record<string, Array<Record<string, unknown>>> = {};
      if (findIds.length > 0) {
        const { data: snippets } = await supabase
          .from('review_snippets')
          .select('listing_id, reviewer_name, rating, review_text, touchless_keywords')
          .in('listing_id', findIds)
          .eq('source', 'serpapi')
          .order('rating', { ascending: false });

        for (const s of snippets || []) {
          const lid = s.listing_id as string;
          if (!reviewsByListing[lid]) reviewsByListing[lid] = [];
          reviewsByListing[lid].push(s);
        }
      }

      // Attach reviews to each find
      const enrichedFinds = (recentFinds || []).map((f: Record<string, unknown>) => ({
        ...f,
        reviews: reviewsByListing[f.id as string] || [],
      }));

      return new Response(
        JSON.stringify({
          total_car_wash_listings: counts.totalScanned + counts.totalRemaining,
          total_scanned: counts.totalScanned,
          total_remaining: counts.totalRemaining,
          total_touchless_found: counts.touchlessFound,
          complete: counts.totalRemaining === 0,
          recent_finds: enrichedFinds,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: prospect — discover new car washes and check reviews
    // -----------------------------------------------------------------------
    if (action === 'prospect') {
      const query = body.query;
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'query required (city, state, or region)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const googleApiKey =
        Deno.env.get('GOOGLE_PLACES_API_KEY') ??
        (await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY'));

      if (!googleApiKey) {
        return new Response(
          JSON.stringify({ error: 'Google Places API key not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // 1. Search Google Places for car washes in the area
      const places = await searchPlaces(googleApiKey, query);

      // 2. Filter out existing listings and rejected places
      const existingIds = new Set<string>();
      const rejectedIds = new Set<string>();

      if (places.length > 0) {
        const placeIds = places.map((p) => p.id);

        // Check existing listings
        const { data: existing } = await supabase
          .from('listings')
          .select('google_id')
          .in('google_id', placeIds);
        for (const e of existing || []) {
          existingIds.add(e.google_id);
        }

        // Check rejections
        const { data: rejected } = await supabase
          .from('discovery_rejections')
          .select('google_id')
          .in('google_id', placeIds);
        for (const r of rejected || []) {
          rejectedIds.add(r.google_id);
        }
      }

      const newPlaces = places.filter(
        (p) => !existingIds.has(p.id) && !rejectedIds.has(p.id),
      );

      // Load filter map
      const { data: filters } = await supabase.from('filters').select('id, slug');
      const filterMap: FilterMap = {};
      for (const f of filters || []) filterMap[f.slug] = f.id;

      const imported: Array<{
        id: string;
        name: string;
        city: string;
        state: string;
        reviewCount: number;
        slug: string;
      }> = [];
      const skipped: Array<{
        name: string;
        address: string;
        reason: string;
      }> = [];

      let apiCalls = 0;

      for (const place of newPlaces) {
        // Extract place_id (remove "places/" prefix if present)
        const placeId = place.id.replace(/^places\//, '');
        const placeName = place.displayName?.text || 'Unknown';

        // Check if name alone tells us it's touchless (saves SerpAPI credits)
        const nameMatchesTouchless = /touch\s*-?\s*less|touch\s*-?\s*free|no\s*-?\s*touch|contactless\s+wash|laser\s*wash|brush\s*-?\s*less|brush\s*-?\s*free/i.test(placeName);

        let reviews: Array<{ reviewer_name: string; rating: number; review_text: string; touchless_keywords: string[] }> = [];

        if (nameMatchesTouchless) {
          console.log(`[prospect] Name match — skipping SerpAPI for: ${placeName}`);
        } else {
          // Search reviews for touchless evidence
          const result = await searchReviewsMultiKeyword(
            serpApiKey,
            placeId,
          );
          apiCalls += result.apiCalls;
          reviews = result.reviews;

          if (result.error) {
            skipped.push({
              name: placeName,
              address: place.formattedAddress || '',
              reason: `SerpAPI error: ${result.error}`,
            });
            continue;
          }

          if (reviews.length === 0) {
            skipped.push({
              name: placeName,
              address: place.formattedAddress || '',
              reason: 'No touchless evidence in reviews',
            });
            continue;
          }
        }

        // Found touchless evidence (name or reviews) — get full details and import
        const details = await getPlaceDetails(googleApiKey, place.id);
        if (!details) {
          skipped.push({
            name: placeName,
            address: place.formattedAddress || '',
            reason: 'Failed to fetch place details',
          });
          continue;
        }

        const listingData = await buildListingData(details, googleApiKey, supabase);
        if (!listingData) {
          skipped.push({
            name: placeName,
            address: place.formattedAddress || '',
            reason: 'Business is closed',
          });
          continue;
        }

        // Insert the listing
        const { data: inserted, error: insertError } = await supabase
          .from('listings')
          .insert(listingData)
          .select('id, slug')
          .single();

        if (insertError) {
          skipped.push({
            name: placeName,
            address: place.formattedAddress || '',
            reason: `Insert failed: ${insertError.message}`,
          });
          continue;
        }

        // Insert review snippets (if we have any from SerpAPI)
        let snippetCount = 0;
        if (reviews.length > 0) {
          snippetCount = await insertSerpApiReviewSnippets(supabase, inserted.id, reviews);
        }

        // Update review count on listing
        await supabase.from('listings').update({
          review_extract_status: nameMatchesTouchless ? 'name_match' : 'extracted',
          touchless_review_count: snippetCount,
        }).eq('id', inserted.id);

        // Sync filters
        const amenities = (listingData.amenities as string[]) || [];
        await syncFiltersForListing(supabase, inserted.id, true, amenities, filterMap);

        imported.push({
          id: inserted.id,
          name: listingData.name as string,
          city: listingData.city as string,
          state: listingData.state as string,
          reviewCount: snippetCount,
          slug: inserted.slug,
        });
      }

      return new Response(
        JSON.stringify({
          query,
          total_places_found: places.length,
          already_in_db: existingIds.size,
          previously_rejected: rejectedIds.size,
          new_places_checked: newPlaces.length,
          api_calls_used: apiCalls,
          imported,
          skipped,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: prospect_next — pick next city from prospect_queue and run it
    // -----------------------------------------------------------------------
    if (action === 'prospect_next') {
      // 1. Grab the highest-priority pending city
      const { data: nextItem, error: fetchErr } = await supabase
        .from('prospect_queue')
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchErr) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch next queue item', details: fetchErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!nextItem) {
        return new Response(
          JSON.stringify({ message: 'Queue empty — all cities have been processed', done: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // 2. Mark as processing
      await supabase
        .from('prospect_queue')
        .update({ status: 'processing' })
        .eq('id', nextItem.id);

      console.log(`[prospect_next] Processing: ${nextItem.query} (priority ${nextItem.priority})`);

      try {
        const googleApiKey =
          Deno.env.get('GOOGLE_PLACES_API_KEY') ??
          (await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY'));

        if (!googleApiKey) {
          await supabase
            .from('prospect_queue')
            .update({ status: 'error', error_message: 'Google Places API key not configured', processed_at: new Date().toISOString() })
            .eq('id', nextItem.id);
          return new Response(
            JSON.stringify({ error: 'Google Places API key not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // 3. Search Google Places specifically for "touchless car wash" in this city
        //    This returns places Google thinks are relevant to "touchless" — much better hit rate
        //    Pass with "touchless " prefix so searchPlaces uses it as-is (not prepending "car wash")
        const places = await searchPlaces(googleApiKey, `touchless car wash ${nextItem.query}`);

        // 4. Filter out existing listings and rejected places
        const existingIds = new Set<string>();
        const rejectedIds = new Set<string>();

        if (places.length > 0) {
          const placeIds = places.map((p) => p.id);

          // Also check by google_place_id (without "places/" prefix)
          const cleanPlaceIds = placeIds.map((id) => id.replace(/^places\//, ''));

          const { data: existingById } = await supabase
            .from('listings')
            .select('google_id')
            .in('google_id', placeIds);
          for (const e of existingById || []) {
            existingIds.add(e.google_id);
          }

          const { data: existingByPlaceId } = await supabase
            .from('listings')
            .select('google_place_id')
            .in('google_place_id', cleanPlaceIds);
          for (const e of existingByPlaceId || []) {
            // Add with "places/" prefix so the filter below catches it
            existingIds.add(`places/${e.google_place_id}`);
            existingIds.add(e.google_place_id);
          }

          const { data: rejected } = await supabase
            .from('discovery_rejections')
            .select('google_id')
            .in('google_id', placeIds);
          for (const r of rejected || []) {
            rejectedIds.add(r.google_id);
          }
        }

        const newPlaces = places.filter(
          (p) => !existingIds.has(p.id) && !rejectedIds.has(p.id),
        );

        // Load filter map
        const { data: filters } = await supabase.from('filters').select('id, slug');
        const filterMap: FilterMap = {};
        for (const f of filters || []) filterMap[f.slug] = f.id;

        let touchlessImported = 0;
        let apiCalls = 0;
        let nameMatches = 0;

        for (const place of newPlaces) {
          const placeId = place.id.replace(/^places\//, '');
          const placeName = place.displayName?.text || 'Unknown';

          // Check if name alone tells us it's touchless (saves SerpAPI credits)
          const nameMatchesTouchless = /touch\s*-?\s*less|touch\s*-?\s*free|no\s*-?\s*touch|contactless\s+wash|laser\s*wash|brush\s*-?\s*less|brush\s*-?\s*free/i.test(placeName);

          let reviews: Array<{ reviewer_name: string; rating: number; review_text: string; touchless_keywords: string[] }> = [];

          if (nameMatchesTouchless) {
            nameMatches++;
            console.log(`[prospect_next] Name match — skipping SerpAPI for: ${placeName}`);
          } else {
            // Only check reviews if the place looks like it could be touchless
            // (Google returned it for a "touchless" search, so worth checking)
            const result = await searchReviewsMultiKeyword(
              serpApiKey,
              placeId,
            );
            apiCalls += result.apiCalls;
            reviews = result.reviews;

            if (result.error || reviews.length === 0) continue;
          }

          // Found touchless evidence (name or reviews) — get details and import
          const details = await getPlaceDetails(googleApiKey, place.id);
          if (!details) continue;

          const listingData = await buildListingData(details, googleApiKey, supabase);
          if (!listingData) continue;

          const { data: inserted, error: insertError } = await supabase
            .from('listings')
            .insert(listingData)
            .select('id, slug')
            .single();

          if (insertError) continue;

          let snippetCount = 0;
          if (reviews.length > 0) {
            snippetCount = await insertSerpApiReviewSnippets(supabase, inserted.id, reviews);
          }

          await supabase.from('listings').update({
            review_extract_status: nameMatchesTouchless ? 'name_match' : 'extracted',
            touchless_review_count: snippetCount,
          }).eq('id', inserted.id);

          const amenities = (listingData.amenities as string[]) || [];
          await syncFiltersForListing(supabase, inserted.id, true, amenities, filterMap);

          touchlessImported++;
        }

        // 5. Update queue entry with results
        await supabase
          .from('prospect_queue')
          .update({
            status: 'completed',
            places_found: places.length,
            already_in_db: existingIds.size,
            new_checked: newPlaces.length,
            touchless_imported: touchlessImported,
            api_calls_used: apiCalls,
            processed_at: new Date().toISOString(),
          })
          .eq('id', nextItem.id);

        console.log(`[prospect_next] Done: ${nextItem.query} — ${places.length} places, ${touchlessImported} imported (${nameMatches} by name), ${apiCalls} API calls`);

        return new Response(
          JSON.stringify({
            queue_id: nextItem.id,
            query: nextItem.query,
            state: nextItem.state,
            places_found: places.length,
            already_in_db: existingIds.size,
            new_checked: newPlaces.length,
            touchless_imported: touchlessImported,
            name_matches: nameMatches,
            api_calls_used: apiCalls,
            done: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } catch (err) {
        // Mark as error so we don't retry forever
        await supabase
          .from('prospect_queue')
          .update({
            status: 'error',
            error_message: String(err),
            processed_at: new Date().toISOString(),
          })
          .eq('id', nextItem.id);

        throw err; // Re-throw to hit the outer catch
      }
    }

    // -----------------------------------------------------------------------
    // ACTION: reject_touchless — mark a listing as NOT touchless (override AI)
    // -----------------------------------------------------------------------
    if (action === 'reject_touchless') {
      const listingId = body.listing_id;
      if (!listingId) {
        return new Response(
          JSON.stringify({ error: 'listing_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Revert the listing: mark as not touchless, set status back to scanned_clean
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          is_touchless: false,
          is_approved: false,
          review_mine_status: 'scanned_clean',
          review_extract_status: null,
          touchless_review_count: 0,
          crawl_notes: 'Manually rejected as not touchless (AI false positive)',
        })
        .eq('id', listingId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: `Failed to update listing: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Remove the touchless filter association
      const { data: touchlessFilter } = await supabase
        .from('filters')
        .select('id')
        .eq('slug', 'touchless')
        .maybeSingle();

      if (touchlessFilter) {
        await supabase
          .from('listing_filters')
          .delete()
          .eq('listing_id', listingId)
          .eq('filter_id', touchlessFilter.id);
      }

      // Delete the review snippets that were imported
      await supabase
        .from('review_snippets')
        .delete()
        .eq('listing_id', listingId)
        .eq('source', 'serpapi');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Listing marked as not touchless',
          listing_id: listingId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: reset — reset review_mine_status for re-scanning
    // -----------------------------------------------------------------------
    if (action === 'reset') {
      const status = body.status || 'scanned_clean';
      const { count } = await supabase
        .from('listings')
        .update({ review_mine_status: null })
        .eq('review_mine_status', status)
        .select('id', { count: 'exact', head: true });

      return new Response(
        JSON.stringify({
          message: `Reset ${count || 0} listings with status '${status}' to unscanned`,
          reset_count: count || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: sentiment_backfill — Backfill touchless_sentiment for touchless
    // listings using their existing review snippets + Claude Haiku.
    // No SerpAPI calls needed — uses already-collected touchless review snippets.
    // -----------------------------------------------------------------------
    if (action === 'sentiment_backfill') {
      const batchSize = Math.min(body.batch_size || 25, 50);

      // Get touchless listings that don't have sentiment yet
      const { data: listings, error: fetchError } = await supabase
        .from('listings')
        .select('id, name')
        .eq('is_touchless', true)
        .is('touchless_sentiment', null)
        .limit(batchSize);

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch listings', details: fetchError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!listings?.length) {
        return new Response(
          JSON.stringify({
            message: 'All touchless listings have sentiment assigned',
            analyzed: 0,
            remaining: 0,
            api_calls: 0,
            results: [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Fetch all review snippets for these listings in one query
      const listingIds = listings.map((l) => l.id);
      const { data: allSnippets } = await supabase
        .from('review_snippets')
        .select('listing_id, review_text')
        .in('listing_id', listingIds)
        .eq('is_touchless_evidence', true);

      // Group snippets by listing
      const snippetsByListing = new Map<string, string[]>();
      for (const s of allSnippets || []) {
        if (!s.review_text) continue;
        const existing = snippetsByListing.get(s.listing_id) || [];
        existing.push(s.review_text);
        snippetsByListing.set(s.listing_id, existing);
      }

      const results: Array<{
        id: string;
        name: string;
        sentiment: string | null;
        snippet_count: number;
        reasoning: string;
      }> = [];
      let analyzed = 0;
      let totalApiCalls = 0;

      for (const listing of listings) {
        const snippets = snippetsByListing.get(listing.id) || [];

        if (snippets.length === 0) {
          // No snippets — set neutral as default
          await supabase.from('listings').update({
            touchless_sentiment: 'neutral',
          }).eq('id', listing.id);
          results.push({ id: listing.id, name: listing.name, sentiment: 'neutral', snippet_count: 0, reasoning: 'No review snippets available' });
          analyzed++;
          continue;
        }

        const aiResult = await analyzeTouchlessSentiment(anthropicKey, listing.name, snippets);
        totalApiCalls++;

        if (aiResult) {
          await supabase.from('listings').update({
            touchless_sentiment: aiResult.sentiment,
          }).eq('id', listing.id);
          results.push({ id: listing.id, name: listing.name, sentiment: aiResult.sentiment, snippet_count: snippets.length, reasoning: aiResult.reasoning });
        } else {
          // AI failed — set neutral as fallback
          await supabase.from('listings').update({
            touchless_sentiment: 'neutral',
          }).eq('id', listing.id);
          results.push({ id: listing.id, name: listing.name, sentiment: 'neutral', snippet_count: snippets.length, reasoning: 'AI analysis failed — defaulted to neutral' });
        }
        analyzed++;
      }

      // Count remaining
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('is_touchless', true)
        .is('touchless_sentiment', null);

      return new Response(
        JSON.stringify({
          analyzed,
          total_in_batch: listings.length,
          remaining: count ?? 0,
          api_calls: totalApiCalls,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Unknown action',
        valid_actions: ['scan_batch', 'scan_single', 'progress', 'prospect', 'prospect_next', 'reject_touchless', 'reset', 'sentiment_backfill', 'review_rescan'],
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('review-mine error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
