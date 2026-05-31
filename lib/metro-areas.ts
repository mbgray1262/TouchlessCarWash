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
  { name: 'Minneapolis-St. Paul', displayName: 'Minneapolis-St. Paul, MN', slug: 'minneapolis', lat: 44.9778, lng: -93.2650, radiusMiles: 35, states: ['MN', 'WI'], region: 'Midwest' },
  { name: 'Cleveland', displayName: 'Cleveland, OH', slug: 'cleveland', lat: 41.4993, lng: -81.6944, radiusMiles: 25, states: ['OH'], region: 'Midwest' },
  { name: 'Columbus', displayName: 'Columbus, OH', slug: 'columbus', lat: 39.9612, lng: -82.9988, radiusMiles: 25, states: ['OH'], region: 'Midwest' },
  { name: 'Cincinnati', displayName: 'Cincinnati, OH', slug: 'cincinnati', lat: 39.1031, lng: -84.5120, radiusMiles: 25, states: ['OH', 'KY', 'IN'], region: 'Midwest' },
  { name: 'Indianapolis', displayName: 'Indianapolis, IN', slug: 'indianapolis', lat: 39.7684, lng: -86.1581, radiusMiles: 25, states: ['IN'], region: 'Midwest' },
  { name: 'Milwaukee', displayName: 'Milwaukee, WI', slug: 'milwaukee', lat: 43.0389, lng: -87.9065, radiusMiles: 30, states: ['WI'], region: 'Midwest' },
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
  { name: 'Reno', displayName: 'Reno, NV', slug: 'reno', lat: 39.5296, lng: -119.8138, radiusMiles: 30, states: ['NV'], region: 'West' },

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

  // Added May 31 2026 after a few hundred new approved listings revealed new
  // touchless clusters (5+ approved listings within radius, not covered by any
  // existing metro). Verified via scripts/verify-proposed-metros-2026-05.mjs.
  { name: 'Rochester', displayName: 'Rochester, MN', slug: 'rochester-mn', lat: 44.0121, lng: -92.4802, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Eau Claire', displayName: 'Eau Claire, WI', slug: 'eau-claire', lat: 44.8113, lng: -91.4985, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Fargo', displayName: 'Fargo, ND', slug: 'fargo', lat: 46.8772, lng: -96.7898, radiusMiles: 20, states: ['ND', 'MN'], region: 'Midwest' },
  { name: 'Duluth', displayName: 'Duluth, MN', slug: 'duluth', lat: 46.7867, lng: -92.1005, radiusMiles: 20, states: ['MN', 'WI'], region: 'Midwest' },
  { name: 'Owatonna', displayName: 'Owatonna, MN', slug: 'owatonna', lat: 44.0840, lng: -93.2261, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Rapid City', displayName: 'Rapid City, SD', slug: 'rapid-city', lat: 44.0805, lng: -103.2310, radiusMiles: 20, states: ['SD'], region: 'Midwest' },
  { name: 'Morgantown', displayName: 'Morgantown, WV', slug: 'morgantown', lat: 39.6295, lng: -79.9559, radiusMiles: 20, states: ['WV'], region: 'Southeast' },
  { name: 'Winston-Salem', displayName: 'Winston-Salem, NC', slug: 'winston-salem', lat: 36.0999, lng: -80.2442, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Asheville', displayName: 'Asheville, NC', slug: 'asheville', lat: 35.5951, lng: -82.5515, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Watertown', displayName: 'Watertown, NY', slug: 'watertown-ny', lat: 43.9748, lng: -75.9108, radiusMiles: 20, states: ['NY'], region: 'Northeast' },
  { name: 'Kalispell', displayName: 'Kalispell, MT', slug: 'kalispell', lat: 48.1958, lng: -114.3128, radiusMiles: 20, states: ['MT'], region: 'West' },

  // Added May 31 2026 (batch 2) — geographic clustering (combining nearby
  // towns) surfaced recognizable metros that were genuine gaps, each with 5+
  // approved touchless listings within radius. Verified via
  // scripts/verify-final-metros-2026-05.mjs. Several re-anchored onto the true
  // metro hub (e.g. Portland ME not Lewiston; Northampton not Springfield —
  // Springfield MA already falls inside Hartford's radius).
  { name: 'Lancaster', displayName: 'Lancaster, PA', slug: 'lancaster', lat: 40.0379, lng: -76.3055, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Poughkeepsie', displayName: 'Poughkeepsie, NY', slug: 'poughkeepsie', lat: 41.7004, lng: -73.9210, radiusMiles: 20, states: ['NY'], region: 'Northeast' },
  { name: 'Northampton', displayName: 'Northampton, MA', slug: 'northampton', lat: 42.3251, lng: -72.6412, radiusMiles: 20, states: ['MA'], region: 'Northeast' },
  { name: 'Utica', displayName: 'Utica-Rome, NY', slug: 'utica', lat: 43.1009, lng: -75.2327, radiusMiles: 20, states: ['NY'], region: 'Northeast' },
  { name: 'Concord', displayName: 'Concord, NH', slug: 'concord-nh', lat: 43.2081, lng: -71.5376, radiusMiles: 20, states: ['NH'], region: 'Northeast' },
  { name: 'Elmira', displayName: 'Elmira-Corning, NY', slug: 'elmira', lat: 42.1110, lng: -76.9300, radiusMiles: 20, states: ['NY'], region: 'Northeast' },
  { name: 'Burlington', displayName: 'Burlington, VT', slug: 'burlington-vt', lat: 44.4759, lng: -73.2121, radiusMiles: 20, states: ['VT'], region: 'Northeast' },
  { name: 'Portland', displayName: 'Portland, ME', slug: 'portland-me', lat: 43.6591, lng: -70.2568, radiusMiles: 20, states: ['ME'], region: 'Northeast' },
  { name: 'State College', displayName: 'State College, PA', slug: 'state-college', lat: 40.7934, lng: -77.8600, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Ann Arbor', displayName: 'Ann Arbor, MI', slug: 'ann-arbor', lat: 42.2808, lng: -83.7430, radiusMiles: 20, states: ['MI'], region: 'Midwest' },
  { name: 'Appleton', displayName: 'Appleton-Oshkosh, WI', slug: 'appleton', lat: 44.2619, lng: -88.4154, radiusMiles: 22, states: ['WI'], region: 'Midwest' },
  { name: 'Green Bay', displayName: 'Green Bay, WI', slug: 'green-bay', lat: 44.5133, lng: -87.9899, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'La Crosse', displayName: 'La Crosse, WI', slug: 'la-crosse', lat: 43.8014, lng: -91.2396, radiusMiles: 20, states: ['WI', 'MN'], region: 'Midwest' },
  { name: 'Sheboygan', displayName: 'Sheboygan, WI', slug: 'sheboygan', lat: 43.7508, lng: -87.7145, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Ames', displayName: 'Ames, IA', slug: 'ames', lat: 42.0308, lng: -93.6319, radiusMiles: 20, states: ['IA'], region: 'Midwest' },
  { name: 'Wausau', displayName: 'Wausau, WI', slug: 'wausau', lat: 44.9591, lng: -89.6301, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Mankato', displayName: 'Mankato, MN', slug: 'mankato', lat: 44.1636, lng: -93.9994, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Sioux City', displayName: 'Sioux City, IA', slug: 'sioux-city', lat: 42.4999, lng: -96.4003, radiusMiles: 20, states: ['IA', 'NE', 'SD'], region: 'Midwest' },
  { name: 'Grand Forks', displayName: 'Grand Forks, ND', slug: 'grand-forks', lat: 47.9253, lng: -97.0329, radiusMiles: 20, states: ['ND', 'MN'], region: 'Midwest' },
  { name: 'Baton Rouge', displayName: 'Baton Rouge, LA', slug: 'baton-rouge', lat: 30.4515, lng: -91.1871, radiusMiles: 25, states: ['LA'], region: 'Southeast' },
  { name: 'Columbia', displayName: 'Columbia, SC', slug: 'columbia-sc', lat: 34.0007, lng: -81.0348, radiusMiles: 20, states: ['SC'], region: 'Southeast' },
  { name: 'West Palm Beach', displayName: 'West Palm Beach, FL', slug: 'west-palm-beach', lat: 26.7153, lng: -80.0534, radiusMiles: 20, states: ['FL'], region: 'Southeast' },
  { name: 'Huntington', displayName: 'Huntington, WV', slug: 'huntington-wv', lat: 38.4192, lng: -82.4452, radiusMiles: 20, states: ['WV', 'KY', 'OH'], region: 'Southeast' },
  { name: 'Northwest Arkansas', displayName: 'Fayetteville-Bentonville, AR', slug: 'northwest-arkansas', lat: 36.2100, lng: -94.1800, radiusMiles: 25, states: ['AR'], region: 'Southwest' },
  { name: 'Tyler', displayName: 'Tyler, TX', slug: 'tyler', lat: 32.3513, lng: -95.3011, radiusMiles: 20, states: ['TX'], region: 'Southwest' },
  { name: 'Oceanside', displayName: 'Oceanside-Carlsbad, CA', slug: 'oceanside', lat: 33.1959, lng: -117.3795, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Redding', displayName: 'Redding, CA', slug: 'redding', lat: 40.5865, lng: -122.3917, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Missoula', displayName: 'Missoula, MT', slug: 'missoula', lat: 46.8787, lng: -113.9966, radiusMiles: 20, states: ['MT'], region: 'West' },

  // Added May 31 2026 (batch 3) — a geographic-clustering audit revealed 63
  // already-qualifying uncovered clusters (5+ approved touchless listings each,
  // 526 total) that earlier batches missed. Generated + name-corrected via
  // scripts/generate-qualifying-metros.mjs (anchored on the real metro hub,
  // e.g. Kenosha not "Pleasant Prairie", St. Cloud not "Waite Park").
  { name: 'Haverhill', displayName: 'Haverhill, MA', slug: 'haverhill', lat: 42.8043, lng: -71.2939, radiusMiles: 20, states: ['MA', 'NH'], region: 'Northeast' },
  { name: 'Kenosha', displayName: 'Kenosha, WI', slug: 'kenosha', lat: 42.5184, lng: -88.1349, radiusMiles: 20, states: ['WI', 'IL'], region: 'Midwest' },
  { name: 'St. Cloud', displayName: 'St. Cloud, MN', slug: 'st-cloud', lat: 45.5773, lng: -94.2376, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Canton', displayName: 'Canton, OH', slug: 'canton', lat: 40.7220, lng: -81.3685, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Fenton', displayName: 'Fenton, MI', slug: 'fenton', lat: 42.8226, lng: -83.7558, radiusMiles: 20, states: ['MI'], region: 'Midwest' },
  { name: 'Allentown', displayName: 'Allentown, PA', slug: 'allentown', lat: 40.5397, lng: -75.4478, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Danbury', displayName: 'Danbury, CT', slug: 'danbury', lat: 41.3981, lng: -73.2945, radiusMiles: 20, states: ['CT'], region: 'Northeast' },
  { name: 'Harrisburg', displayName: 'Harrisburg, PA', slug: 'harrisburg', lat: 40.2809, lng: -76.7129, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Elgin', displayName: 'Elgin, IL', slug: 'elgin', lat: 41.8436, lng: -88.3520, radiusMiles: 20, states: ['IL'], region: 'Midwest' },
  { name: 'Fond du Lac', displayName: 'Fond du Lac, WI', slug: 'fond-du-lac', lat: 43.6401, lng: -88.6216, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'New Richmond', displayName: 'New Richmond, WI', slug: 'new-richmond', lat: 45.3057, lng: -92.6535, radiusMiles: 20, states: ['WI', 'MN'], region: 'Midwest' },
  { name: 'Wooster', displayName: 'Wooster, OH', slug: 'wooster', lat: 40.8370, lng: -82.0179, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Binghamton', displayName: 'Binghamton, NY', slug: 'binghamton', lat: 42.0831, lng: -76.1311, radiusMiles: 20, states: ['NY', 'PA'], region: 'Northeast' },
  { name: 'Le Mars', displayName: 'Le Mars, IA', slug: 'le-mars', lat: 42.9805, lng: -96.1335, radiusMiles: 20, states: ['IA'], region: 'Midwest' },
  { name: 'Newport Beach', displayName: 'Newport Beach, CA', slug: 'newport-beach', lat: 33.5887, lng: -117.7864, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Sturgeon Bay', displayName: 'Sturgeon Bay, WI', slug: 'sturgeon-bay', lat: 44.9849, lng: -87.4969, radiusMiles: 20, states: ['MI', 'WI'], region: 'Midwest' },
  { name: 'Jacksonville', displayName: 'Jacksonville, NC', slug: 'jacksonville-nc', lat: 34.6667, lng: -77.3623, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Wheeling', displayName: 'Wheeling, WV', slug: 'wheeling', lat: 40.0990, lng: -80.7686, radiusMiles: 20, states: ['WV', 'OH'], region: 'Southeast' },
  { name: 'Coatesville', displayName: 'Coatesville, PA', slug: 'coatesville', lat: 39.7997, lng: -75.8649, radiusMiles: 20, states: ['DE', 'PA', 'MD'], region: 'Northeast' },
  { name: 'Chardon', displayName: 'Chardon, OH', slug: 'chardon', lat: 41.6992, lng: -81.0757, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'New Smyrna Beach', displayName: 'New Smyrna Beach, FL', slug: 'new-smyrna-beach', lat: 29.0791, lng: -81.0040, radiusMiles: 20, states: ['FL'], region: 'Southeast' },
  { name: 'Johnstown', displayName: 'Johnstown, PA', slug: 'johnstown', lat: 40.3827, lng: -78.9316, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Graham', displayName: 'Graham, NC', slug: 'graham', lat: 36.0486, lng: -79.1681, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Laconia', displayName: 'Laconia, NH', slug: 'laconia', lat: 43.5938, lng: -71.5014, radiusMiles: 20, states: ['NH'], region: 'Northeast' },
  { name: 'Visalia', displayName: 'Visalia, CA', slug: 'visalia', lat: 36.2875, lng: -119.2452, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Greeley', displayName: 'Greeley, CO', slug: 'greeley', lat: 40.3927, lng: -104.7338, radiusMiles: 20, states: ['CO'], region: 'West' },
  { name: 'Lakeport', displayName: 'Lakeport, CA', slug: 'lakeport', lat: 39.0587, lng: -122.8126, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Joplin', displayName: 'Joplin, MO', slug: 'joplin', lat: 37.0403, lng: -94.4196, radiusMiles: 20, states: ['MO'], region: 'Midwest' },
  { name: 'Brainerd', displayName: 'Brainerd, MN', slug: 'brainerd', lat: 46.3912, lng: -94.2578, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Sanford', displayName: 'Sanford, ME', slug: 'sanford', lat: 43.2142, lng: -70.8429, radiusMiles: 20, states: ['NH', 'ME'], region: 'Northeast' },
  { name: 'Yuba City', displayName: 'Yuba City, CA', slug: 'yuba-city', lat: 39.0717, lng: -121.4594, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Asheboro', displayName: 'Asheboro, NC', slug: 'asheboro', lat: 35.6946, lng: -79.8282, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Mason City', displayName: 'Mason City, IA', slug: 'mason-city', lat: 43.1486, lng: -93.2458, radiusMiles: 20, states: ['IA'], region: 'Midwest' },
  { name: 'Pueblo', displayName: 'Pueblo, CO', slug: 'pueblo', lat: 38.3304, lng: -104.8007, radiusMiles: 20, states: ['CO'], region: 'West' },
  { name: 'Wisconsin Rapids', displayName: 'Wisconsin Rapids, WI', slug: 'wisconsin-rapids', lat: 44.4405, lng: -89.6839, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Marshfield', displayName: 'Marshfield, WI', slug: 'marshfield', lat: 44.6889, lng: -90.1937, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Monterey', displayName: 'Monterey, CA', slug: 'monterey', lat: 36.6598, lng: -121.8108, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Lillington', displayName: 'Lillington, NC', slug: 'lillington', lat: 35.3848, lng: -78.6580, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Bardstown', displayName: 'Bardstown, KY', slug: 'bardstown', lat: 37.7303, lng: -85.3680, radiusMiles: 20, states: ['KY'], region: 'Southeast' },
  { name: 'Lewiston', displayName: 'Lewiston, ME', slug: 'lewiston', lat: 44.0548, lng: -70.0842, radiusMiles: 20, states: ['ME'], region: 'Northeast' },
  { name: 'Parkersburg', displayName: 'Parkersburg, WV', slug: 'parkersburg', lat: 39.3554, lng: -81.4970, radiusMiles: 20, states: ['WV', 'OH'], region: 'Southeast' },
  { name: 'Decatur', displayName: 'Decatur, MI', slug: 'decatur', lat: 42.1621, lng: -86.2259, radiusMiles: 20, states: ['MI'], region: 'Midwest' },
  { name: 'Fitchburg', displayName: 'Fitchburg, MA', slug: 'fitchburg', lat: 42.6027, lng: -71.7350, radiusMiles: 20, states: ['MA', 'NH'], region: 'Northeast' },
  { name: 'Warsaw', displayName: 'Warsaw, IN', slug: 'warsaw', lat: 41.3208, lng: -86.0232, radiusMiles: 20, states: ['IN'], region: 'Midwest' },
  { name: 'Carlisle', displayName: 'Carlisle, PA', slug: 'carlisle', lat: 40.1046, lng: -77.1728, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Henderson', displayName: 'Henderson, NC', slug: 'henderson', lat: 36.2765, lng: -78.4260, radiusMiles: 20, states: ['NC'], region: 'Southeast' },
  { name: 'Norwich', displayName: 'Norwich, CT', slug: 'norwich', lat: 41.4621, lng: -72.0056, radiusMiles: 20, states: ['CT', 'RI'], region: 'Northeast' },
  { name: 'Mount Vernon', displayName: 'Mount Vernon, OH', slug: 'mount-vernon', lat: 40.5269, lng: -82.5923, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Muskegon', displayName: 'Muskegon, MI', slug: 'muskegon', lat: 43.3205, lng: -86.2110, radiusMiles: 20, states: ['MI'], region: 'Midwest' },
  { name: 'Eureka', displayName: 'Eureka, CA', slug: 'eureka', lat: 40.7502, lng: -124.1527, radiusMiles: 20, states: ['CA'], region: 'West' },
  { name: 'Butler', displayName: 'Butler, PA', slug: 'butler', lat: 40.8800, lng: -80.0474, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'Milford', displayName: 'Milford, IA', slug: 'milford', lat: 43.2809, lng: -95.1436, radiusMiles: 20, states: ['IA'], region: 'Midwest' },
  { name: 'Vineland', displayName: 'Vineland, NJ', slug: 'vineland', lat: 39.4841, lng: -75.0740, radiusMiles: 20, states: ['NJ'], region: 'Northeast' },
  { name: 'Cortland', displayName: 'Cortland, NY', slug: 'cortland', lat: 42.5542, lng: -76.2870, radiusMiles: 20, states: ['NY'], region: 'Northeast' },
  { name: 'Williamsport', displayName: 'Williamsport, PA', slug: 'williamsport', lat: 41.2480, lng: -76.9592, radiusMiles: 20, states: ['PA'], region: 'Northeast' },
  { name: 'North Adams', displayName: 'North Adams, MA', slug: 'north-adams', lat: 42.6785, lng: -73.1421, radiusMiles: 20, states: ['VT', 'MA'], region: 'Northeast' },
  { name: 'Red Wing', displayName: 'Red Wing, MN', slug: 'red-wing', lat: 44.4851, lng: -92.5403, radiusMiles: 20, states: ['MN'], region: 'Midwest' },
  { name: 'Watertown', displayName: 'Watertown, WI', slug: 'watertown', lat: 43.1710, lng: -88.8095, radiusMiles: 20, states: ['WI'], region: 'Midwest' },
  { name: 'Stuart', displayName: 'Stuart, FL', slug: 'stuart', lat: 27.1967, lng: -80.3117, radiusMiles: 20, states: ['FL'], region: 'Southeast' },
  { name: 'Findlay', displayName: 'Findlay, OH', slug: 'findlay', lat: 41.0628, lng: -83.5471, radiusMiles: 20, states: ['OH'], region: 'Midwest' },
  { name: 'Owensboro', displayName: 'Owensboro, KY', slug: 'owensboro', lat: 37.8566, lng: -87.0702, radiusMiles: 20, states: ['IN', 'KY'], region: 'Southeast' },
  { name: 'Georgetown', displayName: 'Georgetown, DE', slug: 'georgetown', lat: 38.6355, lng: -75.3966, radiusMiles: 20, states: ['DE', 'MD'], region: 'Northeast' },
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
