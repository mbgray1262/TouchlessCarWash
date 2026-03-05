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
}

async function searchPlaces(
  googleApiKey: string,
  query: string,
): Promise<PlaceResult[]> {
  const allResults: PlaceResult[] = [];
  const seenIds = new Set<string>();

  // Search with multiple queries for better coverage
  const queries = [
    `touchless car wash ${query}`,
    `brushless car wash ${query}`,
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
            .eq('state', state);
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
          .eq('city', city);
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

      // Also check by name + address for places that might exist without google_id
      const results = places.map((place) => {
        const existing = existingMap.get(place.id);
        return {
          google_id: place.id,
          name: place.displayName?.text || 'Unknown',
          address: place.formattedAddress || '',
          location: place.location || null,
          rating: place.rating || 0,
          review_count: place.userRatingCount || 0,
          business_status: place.businessStatus || 'OPERATIONAL',
          google_maps_url: place.googleMapsUri || null,
          types: place.types || [],
          is_existing: !!existing,
          existing_listing: existing || null,
        };
      });

      return new Response(
        JSON.stringify({
          query,
          total: results.length,
          new_count: results.filter((r) => !r.is_existing).length,
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

      const name = details.displayName?.text || 'Unknown Car Wash';

      // Parse address from addressComponents if available, fallback to formatted
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

      // Get Street View URL
      const lat = details.location?.latitude;
      const lng = details.location?.longitude;
      const streetViewUrl =
        lat && lng
          ? `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${lat},${lng}&key=${googleApiKey}`
          : null;

      const listingData: Record<string, unknown> = {
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
        amenities: [],
        rating: details.rating || 0,
        review_count: details.userRatingCount || 0,
        latitude: details.location?.latitude || null,
        longitude: details.location?.longitude || null,
        is_touchless: null, // Needs verification
        is_approved: true,
        is_featured: false,
        google_id: details.id,
        google_maps_url: details.googleMapsUri || null,
        google_category: details.primaryType || null,
        google_subtypes: details.types?.join(', ') || null,
        business_status: details.businessStatus || null,
        street_view_url: streetViewUrl,
        crawl_status: 'pending',
        crawl_notes: 'Imported from Google Places discovery. Needs touchless verification and data enrichment.',
      };

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
        let address = '';
        let city = '';
        let state = '';
        let zip = '';

        if (details.addressComponents?.length) {
          const comps = details.addressComponents;
          const streetNumber =
            comps.find((c) => c.types.includes('street_number'))?.longText || '';
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

        const lat = details.location?.latitude;
        const lng = details.location?.longitude;
        const streetViewUrl =
          lat && lng
            ? `https://maps.googleapis.com/maps/api/streetview?size=800x400&location=${lat},${lng}&key=${googleApiKey}`
            : null;

        const listingData: Record<string, unknown> = {
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
          amenities: [],
          rating: details.rating || 0,
          review_count: details.userRatingCount || 0,
          latitude: details.location?.latitude || null,
          longitude: details.location?.longitude || null,
          is_touchless: null,
          is_approved: true,
          is_featured: false,
          google_id: details.id,
          google_maps_url: details.googleMapsUri || null,
          google_category: details.primaryType || null,
          google_subtypes: details.types?.join(', ') || null,
          business_status: details.businessStatus || null,
          street_view_url: streetViewUrl,
          crawl_status: 'pending',
          crawl_notes:
            'Imported from Google Places discovery. Needs touchless verification and data enrichment.',
        };

        const { error: insertError } = await supabase
          .from('listings')
          .insert(listingData)
          .select('id')
          .single();

        if (insertError) {
          errors.push(`${name}: ${insertError.message}`);
        } else {
          imported.push({ name, city, state });
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
