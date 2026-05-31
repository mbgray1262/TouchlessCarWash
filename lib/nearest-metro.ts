import { METRO_AREAS, haversineDistance, type MetroArea } from './metro-areas';

/** Decode Netlify's base64 x-nf-geo header into lat/lng (passive, no permission). */
export function decodeNetlifyGeo(xNfGeo: string | null | undefined): { lat: number; lng: number } | null {
  if (!xNfGeo) return null;
  try {
    const json = JSON.parse(
      typeof atob === 'function' ? atob(xNfGeo) : Buffer.from(xNfGeo, 'base64').toString('utf-8'),
    );
    const lat = json?.latitude, lng = json?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  } catch { /* ignore */ }
  return null;
}

/** Nearest metro whose center is within maxMiles of the point, else null. */
export function nearestMetro(lat: number, lng: number, maxMiles = 75): MetroArea | null {
  let best: MetroArea | null = null;
  let bestDist = Infinity;
  for (const m of METRO_AREAS) {
    const dist = haversineDistance(lat, lng, m.lat, m.lng);
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return best && bestDist <= maxMiles ? best : null;
}
