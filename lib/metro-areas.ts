/**
 * Major US Metropolitan Areas for "Best Touchless Car Washes" pages.
 *
 * Each metro defines a center point (lat/lng) and search radius.
 * Listings within the radius are included on that metro's page.
 */

export type MetroArea = {
  name: string;        // Display name: "Miami"
  displayName: string; // Full display: "Miami, FL"
  slug: string;        // URL slug: "miami"
  lat: number;         // Center latitude
  lng: number;         // Center longitude
  radiusMiles: number; // Search radius in miles
  states: string[];    // State codes covered
  region: MetroRegion; // Geographic region for grouping
};

export type MetroRegion =
  | 'Northeast'
  | 'Southeast'
  | 'Midwest'
  | 'Southwest'
  | 'West';

// ── Haversine distance (miles) ─────────────────────────────────────────

const EARTH_RADIUS_MILES = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns a lat/lng bounding box for a given center + radius.
 * Used as a fast pre-filter before precise haversine calculation.
 */
export function boundingBox(
  lat: number,
  lng: number,
  radiusMiles: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusMiles / 69.0; // ~69 miles per degree of latitude
  const lngDelta = radiusMiles / (69.0 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

// ── Metro Definitions (~100 major US metros) ───────────────────────────

export const METRO_AREAS: MetroArea[] = [
  // ── Northeast ──────────────────────────────────────────────────────
  { name: 'New York City', displayName: 'New York City, NY', slug: 'new-york-city', lat: 40.7128, lng: -74.0060, radiusMiles: 30, states: ['NY', 'NJ', 'CT'], region: 'Northeast' },
  { name: 'Boston', displayName: 'Boston, MA', slug: 'boston', lat: 42.3601, lng: -71.0589, radiusMiles: 25, states: ['MA', 'NH', 'RI'], region: 'Northeast' },
  { name: 'Philadelphia', displayName: 'Philadelphia, PA', slug: 'philadelphia', lat: 39.9526, lng: -75.1652, radiusMiles: 30, states: ['PA', 'NJ', 'DE'], region: 'Northeast' },
  { name: 'Pittsburgh', displayName: 'Pittsburgh, PA', slug: 'pittsburgh', lat: 40.4406, lng: -79.9959, radiusMiles: 25, states: ['PA'], region: 'Northeast' },
  { name: 'Hartford', displayName: 'Hartford, CT', slug: 'hartford', lat: 41.7658, lng: -72.6734, radiusMiles: 25, states: ['CT'], region: 'Northeast' },
  { name: 'Providence', displayName: 'Providence, RI', slug: 'providence', lat: 41.824, lng: -71.4128, radiusMiles: 25, states: ['RI', 'MA'], region: 'Northeast' },
  { name: 'Buffalo', displayName: 'Buffalo, NY', slug: 'buffalo', lat: 42.8864, lng: -78.8784, radiusMiles: 25, states: ['NY'], region: 'Northeast' },
  { name: 'Rochester', displayName: 'Rochester, NY', slug: 'rochester', lat: 43.1566, lng: -77.6088, radiusMiles: 25, states: ['NY'], region: 'Northeast' },
  { name: 'Albany', displayName: 'Albany, NY', slug: 'albany', lat: 42.6526, lng: -73.7562, radiusMiles: 25, states: ['NY'], region: 'Northeast' },
  { name: 'Syracuse', displayName: 'Syracuse, NY', slug: 'syracuse', lat: 43.0481, lng: -76.1474, radiusMiles: 25, states: ['NY'], region: 'Northeast' },
  { name: 'Northern New Jersey', displayName: 'Northern NJ', slug: 'northern-new-jersey', lat: 40.8568, lng: -74.2263, radiusMiles: 20, states: ['NJ'], region: 'Northeast' },
  { name: 'Baltimore', displayName: 'Baltimore, MD', slug: 'baltimore', lat: 39.2904, lng: -76.6122, radiusMiles: 25, states: ['MD'], region: 'Northeast' },
  { name: 'Washington DC', displayName: 'Washington, DC', slug: 'washington-dc', lat: 38.9072, lng: -77.0369, radiusMiles: 30, states: ['DC', 'VA', 'MD'], region: 'Northeast' },

  // ── Southeast ──────────────────────────────────────────────────────
  { name: 'Miami', displayName: 'Miami, FL', slug: 'miami', lat: 25.7617, lng: -80.1918, radiusMiles: 30, states: ['FL'], region: 'Southeast' },
  { name: 'Tampa', displayName: 'Tampa, FL', slug: 'tampa', lat: 27.9506, lng: -82.4572, radiusMiles: 30, states: ['FL'], region: 'Southeast' },
  { name: 'Orlando', displayName: 'Orlando, FL', slug: 'orlando', lat: 28.5383, lng: -81.3792, radiusMiles: 30, states: ['FL'], region: 'Southeast' },
  { name: 'Jacksonville', displayName: 'Jacksonville, FL', slug: 'jacksonville', lat: 30.3322, lng: -81.6557, radiusMiles: 25, states: ['FL'], region: 'Southeast' },
  { name: 'Fort Myers', displayName: 'Fort Myers, FL', slug: 'fort-myers', lat: 26.6406, lng: -81.8723, radiusMiles: 25, states: ['FL'], region: 'Southeast' },
  { name: 'Atlanta', displayName: 'Atlanta, GA', slug: 'atlanta', lat: 33.7490, lng: -84.3880, radiusMiles: 30, states: ['GA'], region: 'Southeast' },
  { name: 'Charlotte', displayName: 'Charlotte, NC', slug: 'charlotte', lat: 35.2271, lng: -80.8431, radiusMiles: 25, states: ['NC', 'SC'], region: 'Southeast' },
  { name: 'Raleigh-Durham', displayName: 'Raleigh-Durham, NC', slug: 'raleigh-durham', lat: 35.7796, lng: -78.6382, radiusMiles: 25, states: ['NC'], region: 'Southeast' },
  { name: 'Nashville', displayName: 'Nashville, TN', slug: 'nashville', lat: 36.1627, lng: -86.7816, radiusMiles: 25, states: ['TN'], region: 'Southeast' },
  { name: 'Memphis', displayName: 'Memphis, TN', slug: 'memphis', lat: 35.1495, lng: -90.0490, radiusMiles: 25, states: ['TN', 'MS', 'AR'], region: 'Southeast' },
  { name: 'Louisville', displayName: 'Louisville, KY', slug: 'louisville', lat: 38.2527, lng: -85.7585, radiusMiles: 25, states: ['KY', 'IN'], region: 'Southeast' },
  { name: 'Richmond', displayName: 'Richmond, VA', slug: 'richmond', lat: 37.5407, lng: -77.4360, radiusMiles: 25, states: ['VA'], region: 'Southeast' },
  { name: 'Virginia Beach', displayName: 'Virginia Beach, VA', slug: 'virginia-beach', lat: 36.8529, lng: -75.9780, radiusMiles: 25, states: ['VA'], region: 'Southeast' },
  { name: 'Charleston', displayName: 'Charleston, SC', slug: 'charleston', lat: 32.7765, lng: -79.9311, radiusMiles: 25, states: ['SC'], region: 'Southeast' },
  { name: 'New Orleans', displayName: 'New Orleans, LA', slug: 'new-orleans', lat: 29.9511, lng: -90.0715, radiusMiles: 25, states: ['LA'], region: 'Southeast' },
  { name: 'Birmingham', displayName: 'Birmingham, AL', slug: 'birmingham', lat: 33.5207, lng: -86.8025, radiusMiles: 25, states: ['AL'], region: 'Southeast' },
  { name: 'Knoxville', displayName: 'Knoxville, TN', slug: 'knoxville', lat: 35.9606, lng: -83.9207, radiusMiles: 25, states: ['TN'], region: 'Southeast' },
  { name: 'Greenville', displayName: 'Greenville, SC', slug: 'greenville', lat: 34.8526, lng: -82.3940, radiusMiles: 25, states: ['SC'], region: 'Southeast' },
  { name: 'Sarasota', displayName: 'Sarasota, FL', slug: 'sarasota', lat: 27.3364, lng: -82.5307, radiusMiles: 20, states: ['FL'], region: 'Southeast' },

  // ── Midwest ────────────────────────────────────────────────────────
  { name: 'Chicago', displayName: 'Chicago, IL', slug: 'chicago', lat: 41.8781, lng: -87.6298, radiusMiles: 35, states: ['IL', 'IN', 'WI'], region: 'Midwest' },
  { name: 'Detroit', displayName: 'Detroit, MI', slug: 'detroit', lat: 42.3314, lng: -83.0458, radiusMiles: 30, states: ['MI'], region: 'Midwest' },
  { name: 'Minneapolis-St. Paul', displayName: 'Minneapolis-St. Paul, MN', slug: 'minneapolis', lat: 44.9778, lng: -93.2650, radiusMiles: 25, states: ['MN', 'WI'], region: 'Midwest' },
  { name: 'Cleveland', displayName: 'Cleveland, OH', slug: 'cleveland', lat: 41.4993, lng: -81.6944, radiusMiles: 25, states: ['OH'], region: 'Midwest' },
  { name: 'Columbus', displayName: 'Columbus, OH', slug: 'columbus', lat: 39.9612, lng: -82.9988, radiusMiles: 25, states: ['OH'], region: 'Midwest' },
  { name: 'Cincinnati', displayName: 'Cincinnati, OH', slug: 'cincinnati', lat: 39.1031, lng: -84.5120, radiusMiles: 25, states: ['OH', 'KY', 'IN'], region: 'Midwest' },
  { name: 'Indianapolis', displayName: 'Indianapolis, IN', slug: 'indianapolis', lat: 39.7684, lng: -86.1581, radiusMiles: 25, states: ['IN'], region: 'Midwest' },
  { name: 'Milwaukee', displayName: 'Milwaukee, WI', slug: 'milwaukee', lat: 43.0389, lng: -87.9065, radiusMiles: 25, states: ['WI'], region: 'Midwest' },
  { name: 'Kansas City', displayName: 'Kansas City, MO', slug: 'kansas-city', lat: 39.0997, lng: -94.5786, radiusMiles: 30, states: ['MO', 'KS'], region: 'Midwest' },
  { name: 'St. Louis', displayName: 'St. Louis, MO', slug: 'st-louis', lat: 38.6270, lng: -90.1994, radiusMiles: 30, states: ['MO', 'IL'], region: 'Midwest' },
  { name: 'Grand Rapids', displayName: 'Grand Rapids, MI', slug: 'grand-rapids', lat: 42.9634, lng: -85.6681, radiusMiles: 25, states: ['MI'], region: 'Midwest' },
  { name: 'Madison', displayName: 'Madison, WI', slug: 'madison', lat: 43.0731, lng: -89.4012, radiusMiles: 25, states: ['WI'], region: 'Midwest' },
  { name: 'Des Moines', displayName: 'Des Moines, IA', slug: 'des-moines', lat: 41.5868, lng: -93.6250, radiusMiles: 25, states: ['IA'], region: 'Midwest' },
  { name: 'Omaha', displayName: 'Omaha, NE', slug: 'omaha', lat: 41.2565, lng: -95.9345, radiusMiles: 25, states: ['NE', 'IA'], region: 'Midwest' },
  { name: 'Dayton', displayName: 'Dayton, OH', slug: 'dayton', lat: 39.7589, lng: -84.1916, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Toledo', displayName: 'Toledo, OH', slug: 'toledo', lat: 41.6528, lng: -83.5379, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Akron', displayName: 'Akron, OH', slug: 'akron', lat: 41.0814, lng: -81.5190, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Wichita', displayName: 'Wichita, KS', slug: 'wichita', lat: 37.6872, lng: -97.3301, radiusMiles: 25, states: ['KS'], region: 'Midwest' },

  // ── Southwest ──────────────────────────────────────────────────────
  { name: 'Houston', displayName: 'Houston, TX', slug: 'houston', lat: 29.7604, lng: -95.3698, radiusMiles: 35, states: ['TX'], region: 'Southwest' },
  { name: 'Dallas-Fort Worth', displayName: 'Dallas-Fort Worth, TX', slug: 'dallas-fort-worth', lat: 32.7767, lng: -96.7970, radiusMiles: 35, states: ['TX'], region: 'Southwest' },
  { name: 'San Antonio', displayName: 'San Antonio, TX', slug: 'san-antonio', lat: 29.4241, lng: -98.4936, radiusMiles: 25, states: ['TX'], region: 'Southwest' },
  { name: 'Austin', displayName: 'Austin, TX', slug: 'austin', lat: 30.2672, lng: -97.7431, radiusMiles: 25, states: ['TX'], region: 'Southwest' },
  { name: 'El Paso', displayName: 'El Paso, TX', slug: 'el-paso', lat: 31.7619, lng: -106.4850, radiusMiles: 20, states: ['TX'], region: 'Southwest' },
  { name: 'Phoenix', displayName: 'Phoenix, AZ', slug: 'phoenix', lat: 33.4484, lng: -112.0740, radiusMiles: 35, states: ['AZ'], region: 'Southwest' },
  { name: 'Tucson', displayName: 'Tucson, AZ', slug: 'tucson', lat: 32.2226, lng: -110.9747, radiusMiles: 25, states: ['AZ'], region: 'Southwest' },
  { name: 'Albuquerque', displayName: 'Albuquerque, NM', slug: 'albuquerque', lat: 35.0844, lng: -106.6504, radiusMiles: 25, states: ['NM'], region: 'Southwest' },
  { name: 'Oklahoma City', displayName: 'Oklahoma City, OK', slug: 'oklahoma-city', lat: 35.4676, lng: -97.5164, radiusMiles: 25, states: ['OK'], region: 'Southwest' },
  { name: 'Tulsa', displayName: 'Tulsa, OK', slug: 'tulsa', lat: 36.1540, lng: -95.9928, radiusMiles: 25, states: ['OK'], region: 'Southwest' },
  { name: 'Las Vegas', displayName: 'Las Vegas, NV', slug: 'las-vegas', lat: 36.1699, lng: -115.1398, radiusMiles: 25, states: ['NV'], region: 'Southwest' },
  { name: 'Little Rock', displayName: 'Little Rock, AR', slug: 'little-rock', lat: 34.7465, lng: -92.2896, radiusMiles: 25, states: ['AR'], region: 'Southwest' },
  { name: 'McAllen', displayName: 'McAllen, TX', slug: 'mcallen', lat: 26.2034, lng: -98.2300, radiusMiles: 20, states: ['TX'], region: 'Southwest' },

  // ── West ───────────────────────────────────────────────────────────
  { name: 'Los Angeles', displayName: 'Los Angeles, CA', slug: 'los-angeles', lat: 34.0522, lng: -118.2437, radiusMiles: 35, states: ['CA'], region: 'West' },
  { name: 'San Francisco Bay Area', displayName: 'San Francisco, CA', slug: 'san-francisco', lat: 37.7749, lng: -122.4194, radiusMiles: 35, states: ['CA'], region: 'West' },
  { name: 'San Diego', displayName: 'San Diego, CA', slug: 'san-diego', lat: 32.7157, lng: -117.1611, radiusMiles: 25, states: ['CA'], region: 'West' },
  { name: 'Sacramento', displayName: 'Sacramento, CA', slug: 'sacramento', lat: 38.5816, lng: -121.4944, radiusMiles: 25, states: ['CA'], region: 'West' },
  { name: 'Seattle', displayName: 'Seattle, WA', slug: 'seattle', lat: 47.6062, lng: -122.3321, radiusMiles: 30, states: ['WA'], region: 'West' },
  { name: 'Portland', displayName: 'Portland, OR', slug: 'portland', lat: 45.5152, lng: -122.6784, radiusMiles: 25, states: ['OR', 'WA'], region: 'West' },
  { name: 'Denver', displayName: 'Denver, CO', slug: 'denver', lat: 39.7392, lng: -104.9903, radiusMiles: 30, states: ['CO'], region: 'West' },
  { name: 'Colorado Springs', displayName: 'Colorado Springs, CO', slug: 'colorado-springs', lat: 38.8339, lng: -104.8214, radiusMiles: 20, states: ['CO'], region: 'West' },
  { name: 'Salt Lake City', displayName: 'Salt Lake City, UT', slug: 'salt-lake-city', lat: 40.7608, lng: -111.8910, radiusMiles: 30, states: ['UT'], region: 'West' },
  { name: 'Boise', displayName: 'Boise, ID', slug: 'boise', lat: 43.6150, lng: -116.2023, radiusMiles: 25, states: ['ID'], region: 'West' },
  { name: 'Riverside-San Bernardino', displayName: 'Inland Empire, CA', slug: 'inland-empire', lat: 33.9806, lng: -117.3755, radiusMiles: 30, states: ['CA'], region: 'West' },
  { name: 'Fresno', displayName: 'Fresno, CA', slug: 'fresno', lat: 36.7378, lng: -119.7871, radiusMiles: 25, states: ['CA'], region: 'West' },
  { name: 'Bakersfield', displayName: 'Bakersfield, CA', slug: 'bakersfield', lat: 35.3733, lng: -119.0187, radiusMiles: 25, states: ['CA'], region: 'West' },
  { name: 'Honolulu', displayName: 'Honolulu, HI', slug: 'honolulu', lat: 21.3069, lng: -157.8583, radiusMiles: 20, states: ['HI'], region: 'West' },
  { name: 'Anchorage', displayName: 'Anchorage, AK', slug: 'anchorage', lat: 61.2181, lng: -149.9003, radiusMiles: 20, states: ['AK'], region: 'West' },
  { name: 'Reno', displayName: 'Reno, NV', slug: 'reno', lat: 39.5296, lng: -119.8138, radiusMiles: 20, states: ['NV'], region: 'West' },

  // Added April 2026 after Sheetz + Kwik Trip + chain expansion revealed new metro clusters.
  { name: 'Sioux Falls', displayName: 'Sioux Falls, SD', slug: 'sioux-falls', lat: 43.5446, lng: -96.7311, radiusMiles: 20, states: ['SD'], region: 'Midwest' },
  { name: 'Rockford', displayName: 'Rockford, IL', slug: 'rockford', lat: 42.2711, lng: -89.0940, radiusMiles: 20, states: ['IL'], region: 'Midwest' },
  { name: 'South Bend', displayName: 'South Bend, IN', slug: 'south-bend', lat: 41.6764, lng: -86.2520, radiusMiles: 20, states: ['IN', 'MI'], region: 'Midwest' },
  { name: 'Fort Wayne', displayName: 'Fort Wayne, IN', slug: 'fort-wayne', lat: 41.0793, lng: -85.1394, radiusMiles: 20, states: ['IN'], region: 'Midwest' },
  { name: 'Elkhart', displayName: 'Elkhart, IN', slug: 'elkhart', lat: 41.6820, lng: -85.9767, radiusMiles: 15, states: ['IN'], region: 'Midwest' },
  { name: 'Lincoln', displayName: 'Lincoln, NE', slug: 'lincoln', lat: 40.8136, lng: -96.7026, radiusMiles: 20, states: ['NE'], region: 'Midwest' },
  { name: 'Greensboro', displayName: 'Greensboro, NC', slug: 'greensboro', lat: 36.0726, lng: -79.7920, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Fayetteville', displayName: 'Fayetteville, NC', slug: 'fayetteville', lat: 35.0527, lng: -78.8784, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Wilmington', displayName: 'Wilmington, NC', slug: 'wilmington', lat: 34.2257, lng: -77.9447, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Erie', displayName: 'Erie, PA', slug: 'erie', lat: 42.1292, lng: -80.0851, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'York', displayName: 'York, PA', slug: 'york', lat: 39.9626, lng: -76.7277, radiusMiles: 15, states: ['PA'], region: 'Northeast' },
  { name: 'Chambersburg', displayName: 'Chambersburg, PA', slug: 'chambersburg', lat: 39.9376, lng: -77.6611, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Medford', displayName: 'Medford, OR', slug: 'medford-or', lat: 42.3265, lng: -122.8756, radiusMiles: 20, states: ['OR'], region: 'West' },
  { name: 'Grants Pass', displayName: 'Grants Pass, OR', slug: 'grants-pass', lat: 42.4390, lng: -123.3284, radiusMiles: 15, states: ['OR'], region: 'West' },
  { name: 'Grand Junction', displayName: 'Grand Junction, CO', slug: 'grand-junction', lat: 39.0639, lng: -108.5506, radiusMiles: 20, states: ['CO'], region: 'West' },
  { name: 'Longmont', displayName: 'Longmont, CO', slug: 'longmont', lat: 40.1672, lng: -105.1019, radiusMiles: 15, states: ['CO'], region: 'West' },
  { name: 'Spokane', displayName: 'Spokane, WA', slug: 'spokane', lat: 47.6588, lng: -117.4260, radiusMiles: 20, states: ['WA'], region: 'West' },
  { name: 'Tacoma', displayName: 'Tacoma, WA', slug: 'tacoma', lat: 47.2529, lng: -122.4443, radiusMiles: 20, states: ['WA'], region: 'West' },
  { name: 'San Jose', displayName: 'San Jose, CA', slug: 'san-jose', lat: 37.3382, lng: -121.8863, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Stockton', displayName: 'Stockton, CA', slug: 'stockton', lat: 37.9577, lng: -121.2908, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Modesto', displayName: 'Modesto, CA', slug: 'modesto', lat: 37.6391, lng: -120.9969, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Eugene', displayName: 'Eugene, OR', slug: 'eugene', lat: 44.0521, lng: -123.0868, radiusMiles: 20, states: ['OR'], region: 'West' },

  // Added April 16 2026 after metro-sweep + domain-discovery + Crawl4AI enrichment
  // revealed new touchless clusters (5+ approved listings within the radius).
  { name: 'Worcester', displayName: 'Worcester, MA', slug: 'worcester', lat: 42.2626, lng: -71.8023, radiusMiles: 15, states: ['MA'], region: 'Northeast' },
  { name: 'Charlottesville', displayName: 'Charlottesville, VA', slug: 'charlottesville', lat: 38.0293, lng: -78.4767, radiusMiles: 20, states: ['VA'], region: 'Southeast' },
  { name: 'Kalamazoo', displayName: 'Kalamazoo, MI', slug: 'kalamazoo', lat: 42.2917, lng: -85.5872, radiusMiles: 15, states: ['MI'], region: 'Midwest' },
  { name: 'Springfield', displayName: 'Springfield, IL', slug: 'springfield-il', lat: 39.7817, lng: -89.6501, radiusMiles: 20, states: ['IL'], region: 'Midwest' },
  { name: 'Evansville', displayName: 'Evansville, IN', slug: 'evansville', lat: 37.9716, lng: -87.5711, radiusMiles: 20, states: ['IN', 'KY'], region: 'Midwest' },
  { name: 'Warren-Youngstown', displayName: 'Warren-Youngstown, OH', slug: 'warren-youngstown', lat: 41.2376, lng: -80.8184, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Valparaiso', displayName: 'Valparaiso, IN', slug: 'valparaiso', lat: 41.4731, lng: -87.0611, radiusMiles: 15, states: ['IN'], region: 'Midwest' },
  { name: 'Janesville', displayName: 'Janesville, WI', slug: 'janesville', lat: 42.6828, lng: -89.0187, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Waterloo-Cedar Falls', displayName: 'Waterloo-Cedar Falls, IA', slug: 'waterloo-cedar-falls', lat: 42.4928, lng: -92.3427, radiusMiles: 15, states: ['IA'], region: 'Midwest' },
  { name: 'Cedar Rapids', displayName: 'Cedar Rapids, IA', slug: 'cedar-rapids', lat: 41.9779, lng: -91.6656, radiusMiles: 20, states: ['IA'], region: 'Midwest' },
  { name: 'Quad Cities', displayName: 'Quad Cities, IA-IL', slug: 'quad-cities', lat: 41.5236, lng: -90.5776, radiusMiles: 20, states: ['IA', 'IL'], region: 'Midwest' },
  { name: 'Fort Collins', displayName: 'Fort Collins, CO', slug: 'fort-collins', lat: 40.5853, lng: -105.0844, radiusMiles: 20, states: ['CO'], region: 'West' },
  { name: 'Billings', displayName: 'Billings, MT', slug: 'billings', lat: 45.7833, lng: -108.5007, radiusMiles: 20, states: ['MT'], region: 'West' },
  { name: 'Bend', displayName: 'Bend, OR', slug: 'bend', lat: 44.0582, lng: -121.3153, radiusMiles: 20, states: ['OR'], region: 'West' },
];

// ── Lookup helpers ─────────────────────────────────────────────────────

export function getMetroBySlug(slug: string): MetroArea | undefined {
  return METRO_AREAS.find((m) => m.slug === slug);
}

export function getMetrosByRegion(): Record<MetroRegion, MetroArea[]> {
  const grouped: Record<MetroRegion, MetroArea[]> = {
    Northeast: [],
    Southeast: [],
    Midwest: [],
    Southwest: [],
    West: [],
  };
  for (const metro of METRO_AREAS) {
    grouped[metro.region].push(metro);
  }
  return grouped;
}
