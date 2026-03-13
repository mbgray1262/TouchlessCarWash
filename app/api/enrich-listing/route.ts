import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const headers = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function callEdgeFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000), // edge functions can take up to 60s
  });

  const data = await res.json().catch(() => ({ error: 'Non-JSON response' }));
  return { ok: res.ok, status: res.status, data };
}

/**
 * POST /api/enrich-listing
 *
 * Enriches listing(s) by calling Supabase edge functions:
 *
 * { listingId, mode: "website" }  — classify + photos + rich data from website
 * { listingId, mode: "google" }   — enrich from Google Places (photos, hours)
 * { listingId, mode: "classify" } — just classify touchless status
 * { listingIds, mode: "full" }    — full pipeline: google-enrich + photo-enrich + generate-descriptions
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      listingId?: string;
      listingIds?: string[];
      mode?: 'website' | 'google' | 'classify' | 'full';
      force?: boolean;
    };

    const { mode } = body;

    // ── FULL enrichment mode (batch) ──
    if (mode === 'full') {
      const listingIds = body.listingIds ?? (body.listingId ? [body.listingId] : []);
      const force = body.force ?? false;

      if (listingIds.length === 0) {
        return NextResponse.json(
          { error: 'listingIds array (or listingId) is required for mode "full"' },
          { status: 400 },
        );
      }

      const steps: { name: string; status: string; detail?: string }[] = [];

      // Step 1: Google Places enrichment (synchronous — we wait for this)
      const googleEnrich = await callEdgeFunction('google-enrich', {
        action: 'enrich_batch',
        listing_ids: listingIds,
        force,
      });
      steps.push({
        name: 'google-enrich',
        status: googleEnrich.ok ? 'ok' : 'error',
        detail: googleEnrich.ok
          ? `ok=${googleEnrich.data.ok ?? 0}, no_match=${googleEnrich.data.no_match ?? 0}, errors=${googleEnrich.data.errors ?? 0}`
          : googleEnrich.data.error ?? `HTTP ${googleEnrich.status}`,
      });

      // Step 2: Photo enrichment (creates a background job)
      const photoEnrich = await callEdgeFunction('photo-enrich', {
        action: 'start',
        listing_ids: listingIds,
      });
      steps.push({
        name: 'photo-enrich',
        status: photoEnrich.ok ? 'ok' : 'error',
        detail: photoEnrich.ok
          ? `job_id=${photoEnrich.data.job_id ?? 'n/a'}, tasks=${photoEnrich.data.total ?? '?'}`
          : photoEnrich.data.error ?? `HTTP ${photoEnrich.status}`,
      });

      // Step 3: Generate descriptions (creates a background job)
      const descriptions = await callEdgeFunction('generate-descriptions', {
        action: 'start',
        listing_ids: listingIds,
        regenerate: true,
      });
      steps.push({
        name: 'generate-descriptions',
        status: descriptions.ok ? 'ok' : 'error',
        detail: descriptions.ok
          ? `job_id=${descriptions.data.job_id ?? 'n/a'}`
          : descriptions.data.error ?? `HTTP ${descriptions.status}`,
      });

      // Step 4: Amenity backfill (scrape website → extract amenities via Claude)
      const amenities = await callEdgeFunction('amenity-backfill', {
        action: 'start',
        listing_ids: listingIds,
      });
      steps.push({
        name: 'amenity-backfill',
        status: amenities.ok ? 'ok' : 'error',
        detail: amenities.ok
          ? `job_id=${amenities.data.job_id ?? 'n/a'}, tasks=${amenities.data.total ?? '?'}`
          : amenities.data.error ?? `HTTP ${amenities.status}`,
      });

      const allOk = steps.every((s) => s.status === 'ok');
      return NextResponse.json({ success: allOk, steps, listingCount: listingIds.length });
    }

    // ── Single listing modes (existing) ──
    const { listingId } = body;

    if (!listingId || !mode) {
      return NextResponse.json(
        { error: 'listingId and mode are required' },
        { status: 400 },
      );
    }

    const steps: { name: string; status: string; detail?: string }[] = [];

    if (mode === 'website' || mode === 'classify') {
      // Step 1: Classify touchless status (also fetches & analyzes website)
      const classify = await callEdgeFunction('classify-one', {
        listing_id: listingId,
        force: true,
      });
      steps.push({
        name: 'classify',
        status: classify.ok ? 'ok' : 'error',
        detail: classify.ok
          ? `is_touchless=${classify.data.is_touchless}, evidence: ${classify.data.evidence ?? ''}`
          : classify.data.error ?? `HTTP ${classify.status}`,
      });
    }

    if (mode === 'website') {
      // Step 2: Extract rich data (packages, amenities, hours, etc.)
      const extract = await callEdgeFunction('extract-rich-data', {
        action: 'start',
        listing_ids: [listingId],
      });
      steps.push({
        name: 'extract-rich-data',
        status: extract.ok ? 'ok' : 'error',
        detail: extract.ok
          ? `job_id=${extract.data.job_id ?? 'inline'}`
          : extract.data.error ?? `HTTP ${extract.status}`,
      });

      // Step 3: Enrich photos (scrape website for images, classify with Claude vision)
      const photos = await callEdgeFunction('photo-enrich', {
        listing_id: listingId,
      });
      steps.push({
        name: 'photo-enrich',
        status: photos.ok ? 'ok' : 'error',
        detail: photos.ok
          ? `photos found: ${photos.data.photos_added ?? photos.data.gallery_count ?? '?'}`
          : photos.data.error ?? `HTTP ${photos.status}`,
      });
    }

    if (mode === 'google') {
      // Enrich from Google Places via the photo-enrich function
      // (it already checks Google as a photo source)
      const photos = await callEdgeFunction('photo-enrich', {
        listing_id: listingId,
        source: 'google',
      });
      steps.push({
        name: 'google-photo-enrich',
        status: photos.ok ? 'ok' : 'error',
        detail: photos.ok
          ? `photos: ${photos.data.photos_added ?? photos.data.gallery_count ?? '?'}`
          : photos.data.error ?? `HTTP ${photos.status}`,
      });
    }

    const allOk = steps.every((s) => s.status === 'ok');
    return NextResponse.json({ success: allOk, steps });
  } catch (err) {
    return NextResponse.json(
      { error: 'Enrichment failed', detail: String(err) },
      { status: 500 },
    );
  }
}
