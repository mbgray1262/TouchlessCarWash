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

/** Parse a Google Places formattedAddress into components. */
function parseAddress(formatted: string): {
  address: string;
  city: string;
  state: string;
  zip: string;
} {
  // Typical format: "123 Main St, Denver, CO 80202, USA"
  const parts = formatted.split(',').map((s) => s.trim());

  if (parts.length >= 3) {
    const address = parts[0];
    const city = parts[1];
    // "CO 80202" or "CO 80202" or just "CO"
    const stateZipCountry = parts[2].trim();
    const stateZipMatch = stateZipCountry.match(/^([A-Z]{2})\s*(\d{5}(-\d{4})?)?/);
    if (stateZipMatch) {
      return {
        address,
        city,
        state: stateZipMatch[1],
        zip: stateZipMatch[2] || '',
      };
    }
    return { address, city, state: stateZipCountry, zip: '' };
  }

  return { address: formatted, city: '', state: '', zip: '' };
}

/** Convert Google Places opening hours to our Record<string, string> format. */
function parseHours(
  openingHours?: { weekdayDescriptions?: string[] },
): Record<string, string> | null {
  if (!openingHours?.weekdayDescriptions?.length) return null;
  const hours: Record<string, string> = {};
  for (const desc of openingHours.weekdayDescriptions) {
    // Format: "Monday: 8:00 AM – 8:00 PM"
    const colonIdx = desc.indexOf(':');
    if (colonIdx > 0) {
      const day = desc.substring(0, colonIdx).trim().toLowerCase();
      const time = desc.substring(colonIdx + 1).trim();
      hours[day] = time;
    }
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

// ---------------------------------------------------------------------------
// Google Places API helpers
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

/** Keywords that indicate a car wash is likely touchless. */
const TOUCHLESS_KEYWORDS = [
  'touchless', 'touch-free', 'touchfree', 'touch free',
  'brushless', 'brush-free', 'brushfree', 'brush free',
  'laser wash', 'laserwash',
  'no-touch', 'no touch', 'notouch',
  'frictionless', 'friction-free',
  'soft-touch', 'soft touch', // technically uses brushes, but foam/cloth
];

/** Keywords that strongly suggest a car wash is NOT touchless. */
const NON_TOUCHLESS_KEYWORDS = [
  'hand wash', 'hand car wash', 'handwash',
  'detail', 'detailing', 'auto detail',
  'body shop', 'auto body', 'collision',
  'oil change', 'lube', 'tire',
  'self serve', 'self-serve', 'coin op',
  'dog wash', 'pet wash', 'laundromat',
];

/** Check how likely a place is to be a touchless car wash. */
function touchlessConfidence(name: string): 'high' | 'medium' | 'low' {
  const lower = name.toLowerCase();
  // Check for explicit touchless keywords in the name
  if (TOUCHLESS_KEYWORDS.some((kw) => lower.includes(kw))) return 'high';
  // Check for keywords that indicate it's NOT touchless
  if (NON_TOUCHLESS_KEYWORDS.some((kw) => lower.includes(kw))) return 'low';
  // Generic car wash — unknown
  return 'medium';
}

async function searchPlaces(
  googleApiKey: string,
  query: string,
): Promise<PlaceResult[]> {
  const allResults: PlaceResult[] = [];
  const seenIds = new Set<string>();

  // Search with multiple touchless-specific queries for better coverage
  const queries = [
    `touchless car wash ${query}`,
    `brushless car wash ${query}`,
    `touch free car wash ${query}`,
    `laser wash ${query}`,
  ];

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
        const errText = await res.text();
        console.error(`Places search error for "${q}": ${res.status} ${errText}`);
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

  return allResults;
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

/** Extract Google Place photo URLs from photo references. */
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

/** Map Google priceLevel to a human-readable string. */
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

/** Infer amenities from Google Places types and business name. */
function inferAmenities(name: string, types: string[]): string[] {
  const amenities: string[] = [];
  const lower = name.toLowerCase();
  const typeSet = new Set(types);

  if (typeSet.has('gas_station')) amenities.push('Gas Station');
  if (typeSet.has('convenience_store')) amenities.push('Convenience Store');
  if (typeSet.has('atm')) amenities.push('ATM');
  if (lower.includes('vacuum') || lower.includes('vac')) amenities.push('Free Vacuum');
  if (lower.includes('detail')) amenities.push('Detailing Services');
  if (lower.includes('self') && lower.includes('serv')) amenities.push('Self-Service Bays');
  if (lower.includes('express')) amenities.push('Express Wash');
  if (lower.includes('unlimited') || lower.includes('membership')) amenities.push('Unlimited Wash Plans');

  return amenities;
}

/** Infer touchless wash types from the business name.
 *  Valid values: 'touchless_automatic', 'self_serve_spray' */
function inferWashTypes(name: string): string[] {
  const types: string[] = [];
  const lower = name.toLowerCase();

  // Most touchless car washes are automatic (in-bay or tunnel)
  if (
    lower.includes('touchless') || lower.includes('touch-free') || lower.includes('touch free') ||
    lower.includes('brushless') || lower.includes('brush-free') || lower.includes('brush free') ||
    lower.includes('laser') || lower.includes('frictionless') || lower.includes('no-touch') ||
    lower.includes('no touch')
  ) {
    types.push('touchless_automatic');
  }

  // Self-serve spray bays
  if (lower.includes('self') && (lower.includes('serv') || lower.includes('wash'))) {
    types.push('self_serve_spray');
  }

  return types;
}

/** Extract payment methods from Google paymentOptions. */
function extractPaymentMethods(
  opts?: PlaceResult['paymentOptions'],
): string[] {
  if (!opts) return [];
  const methods: string[] = [];
  if (opts.acceptsCreditCards) methods.push('Credit Cards');
  if (opts.acceptsDebitCards) methods.push('Debit Cards');
  if (opts.acceptsCashOnly) methods.push('Cash Only');
  if (opts.acceptsNfc) methods.push('Contactless / NFC');
  return methods;
}

/** Extract review highlights from Google reviews. */
function extractReviewHighlights(
  reviews?: PlaceResult['reviews'],
): string[] {
  if (!reviews?.length) return [];
  return reviews
    .filter((r) => r.text?.text && (r.rating ?? 0) >= 4)
    .slice(0, 5)
    .map((r) => r.text!.text.slice(0, 200));
}

/** Generate a description for the listing. */
function generateDescription(
  name: string,
  city: string,
  state: string,
  confidence: 'high' | 'medium' | 'low',
  amenities: string[],
  editorialSummary?: string,
): string {
  if (editorialSummary) return editorialSummary;

  const touchlessPhrase =
    confidence === 'high'
      ? 'a touchless car wash'
      : confidence === 'medium'
        ? 'a car wash offering touchless wash options'
        : 'a car wash';

  let desc = `${name} is ${touchlessPhrase} located in ${city}, ${state}.`;

  if (amenities.length > 0) {
    desc += ` Amenities include ${amenities.join(', ').toLowerCase()}.`;
  }

  desc += ' Visit for a scratch-free, no-contact clean that protects your vehicle\'s finish.';

  return desc;
}

/** Build a complete listing data object from Google Place details. */
async function buildListingData(
  details: PlaceResult,
  googleApiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const name = details.displayName?.text || 'Unknown Car Wash';

  // Parse address
  let address = '';
  let city = '';
  let state = '';
  let zip = '';

  if (details.addressComponents?.length) {
    const comps = details.addressComponents;
    const streetNumber = comps.find((c) => c.types.includes('street_number'))?.longText || '';
    const route = comps.find((c) => c.types.includes('route'))?.longText || '';
    address = [streetNumber, route].filter(Boolean).join(' ');
    city =
      comps.find((c) => c.types.includes('locality'))?.longText ||
      comps.find((c) => c.types.includes('sublocality'))?.longText ||
      '';
    state =
      comps.find((c) => c.types.includes('administrative_area_level_1'))?.shortText || '';
    zip = comps.find((c) => c.types.includes('postal_code'))?.longText || '';
  } else if (details.formattedAddress) {
    const parsed = parseAddress(details.formattedAddress);
    address = parsed.address;
    city = parsed.city;
    state = parsed.state;
    zip = parsed.zip;
  }

  const hours = parseHours(details.regularOpeningHours);
  const slug = await makeUniqueSlug(supabase, name);

  // Photos from Google Places
  const photoUrls = getPhotoUrls(details.photos, googleApiKey);
  const heroImage = photoUrls[0] || null;

  // Street View as fallback
  const lat = details.location?.latitude;
  const lng = details.location?.longitude;
  const streetViewUrl =
    lat && lng
      ? `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${lat},${lng}&key=${googleApiKey}`
      : null;

  // Touchless analysis
  const confidence = touchlessConfidence(name);
  const isTouchless = confidence === 'high' ? true : confidence === 'low' ? false : null;

  // Amenities & wash types
  const amenities = inferAmenities(name, details.types || []);
  const washTypes = inferWashTypes(name);

  // Payment methods
  const paymentMethods = extractPaymentMethods(details.paymentOptions);

  // Review highlights
  const reviewHighlights = extractReviewHighlights(details.reviews);

  // Description
  const description = generateDescription(
    name, city, state, confidence, amenities,
    details.editorialSummary?.text,
  );

  // Price range
  const priceRange = mapPriceLevel(details.priceLevel);

  // Build extracted_data with everything we can infer
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
    is_touchless: isTouchless,
    is_approved: true,
    is_featured: false,
    google_id: details.id,
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
    crawl_notes: isTouchless === true
      ? 'Imported from Google Places. Touchless confirmed by business name.'
      : isTouchless === null
        ? 'Imported from Google Places. Touchless status needs verification.'
        : 'Imported from Google Places. May not be touchless — needs review.',
  };
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

    const googleApiKey =
      Deno.env.get('GOOGLE_PLACES_API_KEY') ??
      (await getSecret(supabaseUrl, serviceKey, 'GOOGLE_PLACES_API_KEY'));

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const action = body.action as string;

    // -----------------------------------------------------------------------
    // ACTION: coverage — return listing counts per state and per city
    // -----------------------------------------------------------------------
    if (action === 'coverage') {
      // State counts — try RPC first, then fall back to per-state count queries
      const { data: stateCounts } = await supabase.rpc('get_state_counts');
      let stateData = stateCounts;
      if (!stateData) {
        // Count each US state individually to avoid Supabase's default row limit
        const allStates = [
          'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
          'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
          'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
          'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
          'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
        ];
        const stateCountPromises = allStates.map(async (state) => {
          const { count } = await supabase
            .from('listings')
            .select('id', { count: 'exact', head: true })
            .eq('state', state)
            .eq('is_touchless', true);
          return { state, count: count || 0 };
        });
        stateData = (await Promise.all(stateCountPromises)).filter((s) => s.count > 0);
      }

      // Major city counts — use individual count queries to avoid
      // Supabase's default 1000-row limit on regular select queries.
      const majorCities = [
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
        'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin',
        'San Jose', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
        'Indianapolis', 'San Francisco', 'Seattle', 'Denver', 'Washington',
        'Nashville', 'Oklahoma City', 'El Paso', 'Boston', 'Portland',
        'Las Vegas', 'Memphis', 'Louisville', 'Baltimore', 'Milwaukee',
        'Albuquerque', 'Tucson', 'Fresno', 'Sacramento', 'Mesa',
        'Kansas City', 'Atlanta', 'Omaha', 'Colorado Springs', 'Raleigh',
        'Long Beach', 'Virginia Beach', 'Miami', 'Oakland', 'Minneapolis',
        'Tampa', 'Tulsa', 'Arlington', 'New Orleans', 'Wichita',
        'Bakersfield', 'Aurora', 'Anaheim', 'Santa Ana', 'Riverside',
        'Corpus Christi', 'Plano', 'Henderson', 'Newark', 'Irvine',
        'Jersey City', 'St. Paul', 'Honolulu', 'Wilmington',
        'Manhattan', 'Brooklyn', 'Queens', 'Bronx',
      ];

      const cityCountPromises = majorCities.map(async (city) => {
        const { count } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('city', city)
          .eq('is_touchless', true);
        return { city, count: count || 0 };
      });
      const cityCountResults = await Promise.all(cityCountPromises);

      // Build list of underserved cities (fewer than 5 listings)
      const underservedCities = cityCountResults
        .filter((c) => c.count < 5)
        .sort((a, b) => a.count - b.count);

      return new Response(
        JSON.stringify({
          states: (stateData || []).sort(
            (a: { count: number }, b: { count: number }) => a.count - b.count,
          ),
          underserved_cities: underservedCities,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: search — search Google Places for touchless car washes
    // -----------------------------------------------------------------------
    if (action === 'search') {
      const query = body.query as string;
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Missing query parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Search Google Places
      const places = await searchPlaces(googleApiKey, query);

      // Get all existing google_ids from our DB to mark duplicates
      const googleIds = places.map((p) => p.id).filter(Boolean);
      const { data: existingRows } = await supabase
        .from('listings')
        .select('google_id, name, city, state, slug')
        .in('google_id', googleIds.length > 0 ? googleIds : ['__none__']);

      const existingMap = new Map<string, { name: string; city: string; state: string; slug: string }>();
      for (const row of existingRows || []) {
        if (row.google_id) existingMap.set(row.google_id, row);
      }

      // Build results with touchless confidence scoring
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      const results = places.map((place) => {
        const existing = existingMap.get(place.id);
        const name = place.displayName?.text || 'Unknown';
        const confidence = touchlessConfidence(name);
        return {
          google_id: place.id,
          name,
          address: place.formattedAddress || '',
          location: place.location || null,
          rating: place.rating || 0,
          review_count: place.userRatingCount || 0,
          business_status: place.businessStatus || 'OPERATIONAL',
          google_maps_url: place.googleMapsUri || null,
          types: place.types || [],
          is_existing: !!existing,
          existing_listing: existing || null,
          touchless_confidence: confidence,
        };
      });

      // Sort: high confidence first, then medium, then low
      results.sort((a, b) => confidenceOrder[a.touchless_confidence] - confidenceOrder[b.touchless_confidence]);

      return new Response(
        JSON.stringify({
          query,
          total: results.length,
          new_count: results.filter((r) => !r.is_existing && r.touchless_confidence !== 'low').length,
          existing_count: results.filter((r) => r.is_existing).length,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: import_place — import a Google Place as a new listing
    // -----------------------------------------------------------------------
    if (action === 'import_place') {
      const googleId = body.google_id as string;
      if (!googleId) {
        return new Response(
          JSON.stringify({ error: 'Missing google_id parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Check if already exists
      const { data: existingCheck } = await supabase
        .from('listings')
        .select('id, name, slug')
        .eq('google_id', googleId)
        .maybeSingle();

      if (existingCheck) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Listing already exists',
            existing: existingCheck,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Get full place details
      const details = await getPlaceDetails(googleApiKey, googleId);
      if (!details) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch place details from Google' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const listingData = await buildListingData(details, googleApiKey, supabase);

      const { data: inserted, error: insertError } = await supabase
        .from('listings')
        .insert(listingData)
        .select('id, name, slug, city, state, address')
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: `Failed to create listing: ${insertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          listing: inserted,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: import_batch — import multiple Google Places at once
    // -----------------------------------------------------------------------
    if (action === 'import_batch') {
      const googleIds = body.google_ids as string[];
      if (!googleIds?.length) {
        return new Response(
          JSON.stringify({ error: 'Missing google_ids array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Filter out already-existing places
      const { data: existingRows } = await supabase
        .from('listings')
        .select('google_id')
        .in('google_id', googleIds);
      const existingSet = new Set((existingRows || []).map((r) => r.google_id));
      const newIds = googleIds.filter((id) => !existingSet.has(id));

      const imported: Array<{ name: string; city: string; state: string }> = [];
      const errors: string[] = [];

      for (const googleId of newIds) {
        const details = await getPlaceDetails(googleApiKey, googleId);
        if (!details) {
          errors.push(`${googleId}: Failed to fetch details`);
          continue;
        }

        const name = details.displayName?.text || 'Unknown Car Wash';

        try {
          const listingData = await buildListingData(details, googleApiKey, supabase);

          const { error: insertError } = await supabase
            .from('listings')
            .insert(listingData)
            .select('id')
            .single();

          if (insertError) {
            errors.push(`${name}: ${insertError.message}`);
          } else {
            imported.push({
              name,
              city: listingData.city as string,
              state: listingData.state as string,
            });
          }
        } catch (err) {
          errors.push(`${name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Kick off background enrichment for imported listings that have websites
      if (imported.length > 0) {
        const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
        const { data: newListings } = await supabase
          .from('listings')
          .select('id, website')
          .in('google_id', newIds)
          .not('website', 'is', null);

        if (newListings && newListings.length > 0) {
          const listingIds = newListings.map((l: { id: string }) => l.id);
          // Fire-and-forget: trigger enrichment pipeline
          fetch(`${supabaseUrl}/functions/v1/discover-touchless`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
            body: JSON.stringify({ action: 'enrich', listing_ids: listingIds }),
          }).catch(() => {});
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          imported_count: imported.length,
          skipped_count: existingSet.size,
          error_count: errors.length,
          imported,
          errors,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: refresh_photos — re-fetch Google Places photos for listings
    // -----------------------------------------------------------------------
    if (action === 'refresh_photos') {
      const listingIds = body.listing_ids as string[];
      if (!listingIds?.length) {
        return new Response(
          JSON.stringify({ error: 'Missing listing_ids array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: listings } = await supabase
        .from('listings')
        .select('id, google_id, photos')
        .in('id', listingIds)
        .not('google_id', 'is', null);

      if (!listings?.length) {
        return new Response(
          JSON.stringify({ error: 'No listings found with google_id' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const results: Array<{ id: string; name?: string; photos_restored: number }> = [];

      for (const listing of listings) {
        const details = await getPlaceDetails(googleApiKey, listing.google_id);
        if (!details?.photos?.length) {
          results.push({ id: listing.id, photos_restored: 0 });
          continue;
        }

        const googlePhotos = getPhotoUrls(details.photos, googleApiKey);
        // Merge: Google photos first, then keep any existing non-Google photos
        const existingPhotos: string[] = (listing.photos as string[]) || [];
        const googleSet = new Set(googlePhotos);
        const nonGooglePhotos = existingPhotos.filter((p: string) => !googleSet.has(p));
        const mergedPhotos = [...googlePhotos, ...nonGooglePhotos];

        await supabase.from('listings').update({
          photos: mergedPhotos,
          hero_image: googlePhotos[0],
          google_photo_url: googlePhotos[0],
          google_photos_count: googlePhotos.length,
        }).eq('id', listing.id);

        results.push({
          id: listing.id,
          name: details.displayName?.text,
          photos_restored: googlePhotos.length,
        });
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // -----------------------------------------------------------------------
    // ACTION: enrich — run full pipeline: crawl website → extract data → generate description
    // -----------------------------------------------------------------------
    if (action === 'enrich') {
      const listingIds = body.listing_ids as string[];
      if (!listingIds?.length) {
        return new Response(
          JSON.stringify({ error: 'Missing listing_ids array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
      const enrichResults: Array<{ step: string; result: unknown }> = [];

      // Step 1: Crawl websites (Firecrawl)
      try {
        const crawlRes = await fetch(`${supabaseUrl}/functions/v1/bulk-crawl`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ listingIds, delayMs: 2000 }),
        });
        const crawlData = await crawlRes.json();
        enrichResults.push({ step: 'bulk-crawl', result: crawlData });
      } catch (e) {
        enrichResults.push({ step: 'bulk-crawl', result: { error: (e as Error).message } });
      }

      // Step 2: Classify from snapshot (AI photo quality scoring + image selection)
      try {
        const classifyRes = await fetch(`${supabaseUrl}/functions/v1/bulk-classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ listingIds }),
        });
        const classifyData = await classifyRes.json();
        enrichResults.push({ step: 'bulk-classify', result: classifyData });
      } catch (e) {
        enrichResults.push({ step: 'bulk-classify', result: { error: (e as Error).message } });
      }

      // Step 3: Extract rich data (packages, pricing, equipment)
      try {
        const extractRes = await fetch(`${supabaseUrl}/functions/v1/extract-rich-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'start', listing_ids: listingIds }),
        });
        const extractData = await extractRes.json();
        enrichResults.push({ step: 'extract-rich-data-start', result: extractData });

        // Process each extraction task
        if (extractData.job_id) {
          for (let i = 0; i < listingIds.length; i++) {
            try {
              const batchRes = await fetch(`${supabaseUrl}/functions/v1/extract-rich-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
                body: JSON.stringify({ action: 'process_batch', job_id: extractData.job_id }),
              });
              await batchRes.json();
            } catch { /* continue processing */ }
          }
        }
      } catch (e) {
        enrichResults.push({ step: 'extract-rich-data', result: { error: (e as Error).message } });
      }

      // Step 4: Generate AI descriptions using all enriched data
      try {
        const descRes = await fetch(`${supabaseUrl}/functions/v1/generate-descriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
          body: JSON.stringify({ action: 'start', listing_ids: listingIds }),
        });
        const descData = await descRes.json();
        enrichResults.push({ step: 'generate-descriptions-start', result: descData });

        // Process each description task
        if (descData.job_id) {
          for (let i = 0; i < listingIds.length; i++) {
            try {
              const batchRes = await fetch(`${supabaseUrl}/functions/v1/generate-descriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnon}` },
                body: JSON.stringify({ action: 'process_batch', job_id: descData.job_id }),
              });
              await batchRes.json();
            } catch { /* continue processing */ }
          }
        }
      } catch (e) {
        enrichResults.push({ step: 'generate-descriptions', result: { error: (e as Error).message } });
      }

      return new Response(
        JSON.stringify({ success: true, enrichment: enrichResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('discover-touchless error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
