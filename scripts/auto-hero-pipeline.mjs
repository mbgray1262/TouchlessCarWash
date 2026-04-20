#!/usr/bin/env node
/**
 * Auto-hero pipeline (v2 — self-contained) — takes held touchless candidates and:
 *
 *   1. Auto-detect chain membership from name (matches our CHAIN_BRAND_IMAGES list)
 *   2. Fetch Google Places v1 data (photos, hours, website, phone)
 *   3. Hero waterfall: chain-brand → Google Photos (AI-screened) → Street View (AI-screened)
 *   4. Generate AI description from place data
 *   5. Approve only when listing has hero + hours + description
 *   6. Leaves the rest as hero_image_source='held_for_review'
 *
 * Uses Google Places API v1 directly (the legacy Place Details API is REQUEST_DENIED
 * on our project). Uses Anthropic Claude vision inline for photo quality screening.
 *
 * Invocation: node scripts/auto-hero-pipeline.mjs [--limit=N] [--dry-run] [--id=UUID]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ANON;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
const GOOGLE_URL_SIGNING_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY in .env.local'); process.exit(1); }
if (!GOOGLE_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY in .env.local'); process.exit(1); }

// Sign a Google Maps URL using HMAC-SHA1 with the URL signing secret.
// Without signing, Street View Static is capped at 640x640. Signed URLs can
// request up to 2048x2048 for hero-quality images at no extra cost.
import crypto from 'node:crypto';
function signGoogleUrl(url) {
  if (!GOOGLE_URL_SIGNING_SECRET) return url; // fallback: unsigned (capped at 640)
  const u = new URL(url);
  const pathAndQuery = u.pathname + u.search;
  // Google's signing secret is URL-safe base64; convert to standard base64 for HMAC key
  const keyBuffer = Buffer.from(
    GOOGLE_URL_SIGNING_SECRET.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  );
  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(pathAndQuery);
  // Signature is URL-safe base64 (no padding stripped; Google accepts padded)
  const signature = hmac.digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
  return `${url}&signature=${signature}`;
}

const LOG = resolve(repoRoot, 'scripts/auto-hero-pipeline.log');
const REPORT = resolve(repoRoot, 'scripts/auto-hero-pipeline-report.json');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100', 10);
const ONE_ID = process.argv.find(a => a.startsWith('--id='))?.split('=')[1];
// upgrade-heroes mode: find real facility photos for already-approved listings
// that currently show a brand fallback (hero_image IS NULL + parent_chain set).
// Never demotes approval — just upgrades the hero if a real photo is available.
const UPGRADE_HEROES = process.argv.includes('--upgrade-heroes');
const CHAIN_FILTER = process.argv.find(a => a.startsWith('--chain='))?.split('=')[1];

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

// ── Chain brand lookup ────────────────────────────────────────────────
function loadChainBrands() {
  const text = readFileSync(resolve(repoRoot, 'lib/chain-brand-images.ts'), 'utf8');
  const names = [];
  for (const m of text.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)) names.push(m[1]);
  return names;
}
function matchChain(listingName, chainBrands) {
  if (!listingName) return null;
  const lower = listingName.toLowerCase();
  for (const chain of chainBrands) {
    const chainLower = chain.toLowerCase();
    if (lower.includes(chainLower)) return chain;
    // Also try without punctuation
    const chainNoPunc = chainLower.replace(/[^\w\s]/g, '');
    const lowerNoPunc = lower.replace(/[^\w\s]/g, '');
    if (lowerNoPunc.includes(chainNoPunc) && chainNoPunc.length > 4) return chain;
  }
  return null;
}

// ── Google Places v1 API ──────────────────────────────────────────────
async function fetchPlaceV1(placeId) {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${GOOGLE_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'displayName,formattedAddress,photos,regularOpeningHours,websiteUri,internationalPhoneNumber,nationalPhoneNumber,rating,userRatingCount,location,primaryType,types,editorialSummary,businessStatus' } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { log(`  ⚠ Places v1 fetch error: ${e.message}`); return null; }
}

function photoUrlV1(photoName, maxWidth = 1600) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_KEY}`;
}

// ── Claude vision screening ───────────────────────────────────────────
async function fetchImageBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(ct)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 3000) return null;
    return { base64: Buffer.from(buf).toString('base64'), mediaType: ct };
  } catch { return null; }
}

// Screens a set of image URLs and returns the index of the best hero candidate,
// or -1 if none are suitable. Uses Claude Sonnet 4 for visual judgment.
async function pickBestHero(urls, listingName, city, state) {
  const images = [];
  for (let i = 0; i < urls.length; i++) {
    const img = await fetchImageBase64(urls[i]);
    if (img) images.push({ index: i, ...img });
  }
  if (images.length === 0) return { index: -1, reason: 'all images failed to fetch' };

  const content = [
    { type: 'text', text:
      `You are picking a HERO image for a touchless car wash listing page. ` +
      `Business: "${listingName}" in ${city}, ${state}.\n\n` +
      `CRITERIA for a good hero:\n` +
      `- Shows the EXTERIOR of the car wash (storefront, bay entrance, building facade) OR\n` +
      `- Shows touchless equipment (arch, laser wash, in-bay automatic) clearly\n\n` +
      `REJECT:\n` +
      `- Shot from inside a car (dashboard/windshield visible)\n` +
      `- Stock logos, cartoons, or pure branding graphics\n` +
      `- Interior shots of unrelated rooms\n` +
      `- Parking-lot-only photos where the car wash isn't visible\n` +
      `- Low-quality/blurry/dark photos where nothing is clear\n` +
      `- Screenshots of menus or price lists\n` +
      `- Photos that clearly don't show a car wash at all\n\n` +
      `Review each image, then respond in JSON ONLY:\n` +
      `{"best_index": <integer 0-${images.length - 1} or -1 if none acceptable>, "reason": "brief why"}\n` +
      `If multiple are acceptable, pick the one that best shows the car wash exterior or equipment.`
    },
  ];
  for (let i = 0; i < images.length; i++) {
    content.push({ type: 'text', text: `\nImage ${i}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: images[i].mediaType, data: images[i].base64 } });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 300,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) { log(`  ⚠ Claude API ${res.status}`); return { index: -1, reason: `HTTP ${res.status}` }; }
    const d = await res.json();
    const text = d.content?.[0]?.text ?? '';
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { index: -1, reason: 'no JSON in Claude response' };
    const parsed = JSON.parse(m[0]);
    const localIdx = typeof parsed.best_index === 'number' ? parsed.best_index : -1;
    if (localIdx < 0 || localIdx >= images.length) return { index: -1, reason: parsed.reason || 'AI rejected all' };
    const origIdx = images[localIdx].index;
    return { index: origIdx, reason: parsed.reason, url: urls[origIdx] };
  } catch (e) {
    log(`  ⚠ Claude API error: ${e.message}`);
    return { index: -1, reason: e.message };
  }
}

// ── Street View ───────────────────────────────────────────────────────
async function fetchStreetViewCandidates(lat, lng, placeId) {
  // Check if there's a pano at this location via metadata API
  try {
    const metaRes = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GOOGLE_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const meta = await metaRes.json();
    if (meta.status !== 'OK') return { error: meta.status || 'no_pano', urls: [] };

    // Generate 4 headings around the location. Request 2048x1152 for
    // hero-quality resolution. Signing required or Google silently caps at 640.
    const panoId = meta.pano_id;
    const urls = [0, 90, 180, 270].map(heading => {
      const base = `https://maps.googleapis.com/maps/api/streetview?size=2048x1152&pano=${panoId}&fov=90&heading=${heading}&pitch=0&key=${GOOGLE_KEY}`;
      return signGoogleUrl(base);
    });
    return { panoId, urls };
  } catch (e) { return { error: e.message, urls: [] }; }
}

// ── AI description ───────────────────────────────────────────────────
async function generateDescription(listing, placeData) {
  const types = (placeData?.types || []).join(', ');
  const editorial = placeData?.editorialSummary?.text || '';
  const prompt = `Write a unique 2-3 sentence description for this touchless car wash listing. Natural, helpful, not marketing fluff.

Business: ${listing.name}
Location: ${listing.city}, ${listing.state}
Google categories: ${types}
${editorial ? `Google editorial summary: ${editorial}` : ''}
${listing.website ? `Website: ${listing.website}` : ''}
${listing.phone ? `Phone: ${listing.phone}` : ''}

Write in active voice. Mention the city. Don't claim facts not in the source data. Output only the description text, no preamble.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 250, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return (d.content?.[0]?.text ?? '').trim() || null;
  } catch { return null; }
}

// ── Main per-listing processor ───────────────────────────────────────
async function processListing(listing, chainBrands) {
  const result = {
    id: listing.id, name: listing.name, city: listing.city, state: listing.state,
    steps: [], final_hero: null, final_source: null, approved: false,
  };
  log(`\n[${listing._i}/${listing._total}] ${listing.name} | ${listing.city}, ${listing.state}`);

  // Parent chain auto-detect
  let parentChain = listing.parent_chain;
  if (!parentChain) {
    parentChain = matchChain(listing.name, chainBrands);
    if (parentChain) {
      result.steps.push({ step: 'chain-auto-detect', matched: parentChain });
      if (!DRY_RUN) await sb.from('listings').update({ parent_chain: parentChain }).eq('id', listing.id);
      log(`  ✓ chain auto-detected: ${parentChain}`);
    }
  }

  // Google Places v1 data
  const placeData = await fetchPlaceV1(listing.google_place_id);
  if (!placeData) { result.steps.push({ step: 'places-v1', error: 'fetch failed' }); }
  else {
    result.steps.push({ step: 'places-v1', photos: placeData.photos?.length || 0, hours: !!placeData.regularOpeningHours });

    // Write hours, website, phone if missing
    if (!DRY_RUN) {
      const update = {};
      if (placeData.regularOpeningHours?.weekdayDescriptions) {
        const hours = {};
        for (const line of placeData.regularOpeningHours.weekdayDescriptions) {
          const m = line.match(/^(\w+):\s*(.+)$/);
          if (m) hours[m[1].toLowerCase()] = m[2].trim();
        }
        // Write hours if we got them and existing is null or empty object
        const hasExistingHours = listing.hours && Object.keys(listing.hours).length > 0;
        if (Object.keys(hours).length > 0 && !hasExistingHours) update.hours = hours;
      }
      if (placeData.websiteUri && !listing.website) update.website = placeData.websiteUri;
      if (!listing.phone) {
        const phone = placeData.nationalPhoneNumber || placeData.internationalPhoneNumber;
        if (phone) update.phone = phone;
      }
      if (placeData.rating && !listing.rating) update.rating = placeData.rating;
      if (placeData.userRatingCount && !listing.review_count) update.review_count = placeData.userRatingCount;
      if (Object.keys(update).length > 0) {
        await sb.from('listings').update(update).eq('id', listing.id);
        Object.assign(listing, update);
      }
    }
  }

  // ── Hero waterfall ──
  // STEP 1: Try Google Photos first — a real facility photo is ALWAYS better
  // than a generic chain brand image. Michael's explicit directive: "for
  // Super Wash (and any chain), we should always take a picture of the
  // actual facility, not a generic brand image!"
  if (placeData?.photos?.length > 0) {
    const urls = placeData.photos.slice(0, 5).map(p => photoUrlV1(p.name, 1600));
    const pick = await pickBestHero(urls, listing.name, listing.city, listing.state);
    result.steps.push({ step: 'google-photos-ai', picked: pick.index >= 0, reason: pick.reason });
    if (pick.index >= 0) {
      result.final_hero = pick.url;
      result.final_source = 'google-ai';
      if (!DRY_RUN) {
        await sb.from('listings').update({
          hero_image: pick.url,
          hero_image_source: 'google-ai',
          photos: urls,
        }).eq('id', listing.id);
      }
      log(`  ✓ hero source: google photo (AI picked #${pick.index}) — ${pick.reason?.slice(0,100)}`);
    } else {
      log(`  ✗ google photos rejected: ${pick.reason?.slice(0,100)}`);
    }
  }

  // Step 3: Street View AI-screened
  if (!result.final_source && listing.latitude && listing.longitude) {
    const sv = await fetchStreetViewCandidates(listing.latitude, listing.longitude, listing.google_place_id);
    if (sv.error) { result.steps.push({ step: 'streetview', error: sv.error }); log(`  ✗ streetview: ${sv.error}`); }
    else if (sv.urls.length > 0) {
      const pick = await pickBestHero(sv.urls, listing.name, listing.city, listing.state);
      result.steps.push({ step: 'streetview-ai', picked: pick.index >= 0, reason: pick.reason });
      if (pick.index >= 0) {
        result.final_hero = pick.url;
        result.final_source = 'streetview-ai';
        if (!DRY_RUN) {
          await sb.from('listings').update({
            hero_image: pick.url,
            hero_image_source: 'streetview-ai',
          }).eq('id', listing.id);
        }
        log(`  ✓ hero source: street view (AI picked heading ${[0,90,180,270][pick.index]}°)`);
      } else {
        log(`  ✗ streetview rejected: ${pick.reason?.slice(0,100)}`);
      }
    }
  }

  // Held for review if nothing worked.
  // In UPGRADE_HEROES mode: don't mark held (listing is already approved + showing brand fallback).
  if (!result.final_source) {
    if (UPGRADE_HEROES) {
      // Keep existing state — brand fallback still renders fine.
      result.final_source = 'kept_brand_fallback';
      log(`  = no google photo found, keeping chain brand fallback`);
    } else {
      if (!DRY_RUN) {
        await sb.from('listings').update({
          hero_image_source: 'held_for_review',
          crawl_notes: `[auto ${new Date().toISOString().slice(0,10)}] Held — auto-hero pipeline found no usable image (chain: none, google photos: ${placeData?.photos?.length || 0} rejected, streetview: no pano or rejected).`,
        }).eq('id', listing.id);
      }
      result.final_source = 'held_for_review';
      log(`  ⏸ HELD for manual review`);
    }
  }

  // Description
  const { data: cur } = await sb.from('listings').select('description, hours').eq('id', listing.id).maybeSingle();
  if (!cur?.description) {
    const desc = await generateDescription(listing, placeData);
    if (desc) {
      result.steps.push({ step: 'generate-description', ok: true, len: desc.length });
      if (!DRY_RUN) await sb.from('listings').update({ description: desc, description_generated_at: new Date().toISOString() }).eq('id', listing.id);
    }
  }

  // Approval gate — skip in UPGRADE_HEROES mode (listing is already approved).
  if (!UPGRADE_HEROES) {
    const { data: final } = await sb.from('listings').select('hero_image, hero_image_source, hours, description').eq('id', listing.id).maybeSingle();
    const hasHero = !!final?.hero_image || final?.hero_image_source === 'chain-brand-auto';
    const hasHours = final?.hours && Object.keys(final.hours).length > 0;
    const hasDesc = !!final?.description;
    const complete = hasHero && hasHours && hasDesc && final?.hero_image_source !== 'held_for_review';

    if (complete && !DRY_RUN) {
      await sb.from('listings').update({ is_approved: true }).eq('id', listing.id);
      result.approved = true;
      log(`  ✅ APPROVED (hero=${final.hero_image_source})`);
    } else if (!complete) {
      log(`  ⏸ not approved: hero=${hasHero} hours=${hasHours} desc=${hasDesc}`);
    }
  } else {
    // In upgrade mode, just report whether we successfully upgraded
    if (result.final_source && result.final_source !== 'kept_brand_fallback') {
      result.approved = true; // signals "upgraded" for reporting
      log(`  ✅ hero upgraded to ${result.final_source}`);
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────
async function run() {
  writeFileSync(LOG, `=== auto-hero-pipeline v2 starting ${new Date().toISOString()} (dry=${DRY_RUN}, limit=${LIMIT}${ONE_ID ? ', id=' + ONE_ID : ''}) ===\n`);
  const chainBrands = loadChainBrands();
  log(`Loaded ${chainBrands.length} chain names`);

  const SELECT_COLS = 'id, name, city, state, hero_image, hero_image_source, parent_chain, google_place_id, google_photo_url, website, phone, photos, hours, description, latitude, longitude, rating, review_count';
  let query;
  if (ONE_ID) {
    query = sb.from('listings').select(SELECT_COLS).eq('id', ONE_ID);
  } else if (UPGRADE_HEROES) {
    // Upgrade mode: approved touchless listings that have NO hero_image.
    // Finds real facility photos for them (non-chain too).
    query = sb.from('listings').select(SELECT_COLS)
      .eq('is_touchless', true).eq('is_approved', true)
      .is('hero_image', null)
      .not('google_place_id', 'is', null);
    if (CHAIN_FILTER) query = query.eq('parent_chain', CHAIN_FILTER);
    query = query.limit(LIMIT);
  } else {
    query = sb.from('listings').select(SELECT_COLS)
      .eq('is_touchless', true).eq('is_approved', false)
      .not('google_place_id', 'is', null)
      .limit(LIMIT);
  }

  const { data: candidates } = await query;
  log(`Found ${candidates?.length ?? 0} candidates\n`);

  const report = { started_at: new Date().toISOString(), total: candidates?.length ?? 0, results: [] };
  for (let i = 0; i < (candidates ?? []).length; i++) {
    candidates[i]._i = i + 1;
    candidates[i]._total = candidates.length;
    const r = await processListing(candidates[i], chainBrands);
    report.results.push(r);
  }

  report.finished_at = new Date().toISOString();
  report.summary = {
    total: report.results.length,
    approved: report.results.filter(r => r.approved).length,
    held_for_review: report.results.filter(r => r.final_source === 'held_for_review').length,
    by_source: report.results.reduce((a, r) => { a[r.final_source] = (a[r.final_source] ?? 0) + 1; return a; }, {}),
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log(`\n=== DONE ===\nApproved: ${report.summary.approved} / ${report.summary.total}\nHeld: ${report.summary.held_for_review}\nBy source: ${JSON.stringify(report.summary.by_source)}\nReport: ${REPORT}`);
}

run().catch(e => { log(`FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
