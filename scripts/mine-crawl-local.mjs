#!/usr/bin/env node
/**
 * Local mine-crawl script — processes crawl_snapshot images for listings.
 * Runs locally to avoid Supabase Edge Function CPU time limits.
 *
 * Usage: node scripts/mine-crawl-local.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing required env vars: SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY');
  process.exit(1);
}

const MAX_PHOTOS = 10;
const MAX_CANDIDATES = 8;
const MAX_NEW_PER_LISTING = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = ct.split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 20000) return null;
    if (buffer.byteLength > 4_000_000) return null;
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      const searchLimit = Math.min(bytes.length - 8, 1000);
      for (let i = 2; i < searchLimit; i++) {
        if (bytes[i] === 0xFF && (bytes[i+1] === 0xC0 || bytes[i+1] === 0xC2)) {
          const h = (bytes[i+5] << 8) | bytes[i+6];
          const w = (bytes[i+7] << 8) | bytes[i+8];
          if (w < 300 || h < 200) return null;
          break;
        }
      }
    }
    return { base64: Buffer.from(buffer).toString('base64'), mediaType };
  } catch {
    return null;
  }
}

// ── URL Filtering ────────────────────────────────────────────────────────

const SKIP_DOMAINS = [
  'facebook.com', 'fbcdn.net', 'yelp.com', 'google.com', 'yellowpages.com',
  'bbb.org', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'linkedin.com', 'pinterest.com', 'nextdoor.com',
  'play.google.com', 'apple.com', 'apps.apple.com',
];

function filterCandidateUrls(urls) {
  const seen = new Set();
  return urls.filter(u => {
    if (!u || !u.startsWith('http')) return false;
    const lower = u.toLowerCase();
    if (SKIP_DOMAINS.some(d => lower.includes(d))) return false;
    if (lower.endsWith('.svg') || lower.endsWith('.gif') || lower.endsWith('.ico')) return false;
    if (/\b(pixel|beacon|tracking|analytics|favicon|sprite|logo[-_.]?|icon[-_.]?|badge|banner|brand|seal|emblem|award|ribbon|cert|accredit|partner|sponsor)/i.test(lower)) return false;
    const m = lower.match(/[?&](w|width|h|height)=(\d+)/i);
    if (m && parseInt(m[2], 10) < 100) return false;
    const dim = lower.match(/[-_](\d+)x(\d+)\./);
    if (dim && (parseInt(dim[1], 10) < 100 || parseInt(dim[2], 10) < 100)) return false;
    const hasPhotoExt = /\.(jpe?g|png|webp)(\?|$)/i.test(lower);
    const hasNoExt = !/\.\w{1,5}(\?|$)/.test((lower.split('/').pop() || ''));
    if (!hasPhotoExt && !hasNoExt) return false;
    let canonical = u.split('?')[0];
    canonical = canonical.replace(/-\d+x\d+\./, '.');
    canonical = canonical.replace(/@\d+x\./, '.');
    canonical = canonical.replace(/-scaled\./, '.');
    if (seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}

// ── AI Classification ────────────────────────────────────────────────────

async function classifyPhoto(imageUrl, apiKey) {
  const img = await fetchImageAsBase64(imageUrl);
  if (!img) return { verdict: 'BAD_OTHER', reason: 'Could not fetch image' };

  const prompt = `You are classifying images for a touchless car wash photo gallery. Be VERY STRICT — only approve genuine, high-quality photographs that clearly show a car wash FACILITY.

GOOD — Real photograph where the car wash BUILDING, TUNNEL, BAY, or EQUIPMENT is clearly visible.
BAD_CONTACT — Shows spinning brushes, cloth strips, or mop curtains physically touching a vehicle.
BAD_OTHER — Logo, icon, illustration, coupon, map, screenshot, vehicle-only photo, low-res, etc.

KEY RULE: If the photo is mostly a CAR and you cannot clearly see the wash building/tunnel/equipment, classify as BAD_OTHER.

Reply with exactly: VERDICT: one-line reason`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5', max_tokens: 80,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
            { type: 'text', text: prompt },
          ]}],
        }),
      });
      if (res.status === 429 || res.status === 529) { await new Promise(r => setTimeout(r, 5000)); continue; }
      if (!res.ok) return { verdict: 'BAD_OTHER', reason: `API ${res.status}` };
      const data = await res.json();
      const text = (data.content?.[0]?.text ?? '').trim();
      if (/\bGOOD\b/.test(text) && !/\bBAD\b/.test(text)) return { verdict: 'GOOD', reason: text };
      if (/\bBAD_CONTACT\b/.test(text)) return { verdict: 'BAD_CONTACT', reason: text };
      return { verdict: 'BAD_OTHER', reason: text };
    } catch {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 3000)); continue; }
      return { verdict: 'BAD_OTHER', reason: 'Exception' };
    }
  }
  return { verdict: 'BAD_OTHER', reason: 'Max attempts' };
}

// ── Storage ──────────────────────────────────────────────────────────────

async function rehostToStorage(imageUrl, listingId, slot) {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 1000) return null;
    const path = `listings/${listingId}/${slot}.${ext}`;
    const { error } = await supabase.storage.from('listing-photos').upload(path, buffer, { contentType: ct.split(';')[0].trim(), upsert: true });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('listing-photos').getPublicUrl(path);
    return publicUrl;
  } catch { return null; }
}

// ── Hero Selection ───────────────────────────────────────────────────────

async function pickBestHero(urls, apiKey) {
  if (urls.length <= 1) return 0;
  const images = await Promise.all(urls.slice(0, 6).map(u => fetchImageAsBase64(u)));
  const valid = images.map((img, i) => ({ img, i })).filter(({ img }) => img !== null);
  if (valid.length <= 1) return valid[0]?.i ?? 0;

  const imageBlocks = valid.flatMap(({ img, i }) => [
    { type: 'text', text: `Photo ${i + 1}:` },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } },
  ]);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 10,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: 'Pick the best hero image for a touchless car wash listing. Prefer exterior building shots. Reply with only the photo number.' }] }],
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const num = parseInt((data.content?.[0]?.text ?? '').trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= urls.length) return num - 1;
  } catch { /* fall through */ }
  return 0;
}

// ── Process one listing ──────────────────────────────────────────────────

async function processListing(listing) {
  const snap = listing.crawl_snapshot?.data;
  const rawImages = (snap?.images ?? []);
  const sourceUrl = snap?.metadata?.sourceURL || listing.website || '';
  const existingPhotos = (listing.photos || []).filter(p => p.includes('supabase.co/storage') || p.includes('lh3.googleusercontent.com'));
  const slotsToFill = Math.min(Math.max(0, MAX_PHOTOS - existingPhotos.length), MAX_NEW_PER_LISTING);

  if (slotsToFill === 0 || rawImages.length === 0) {
    await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
    return { approved: 0, rehosted: 0, hero_changed: false, skipped: true };
  }

  // Extract and resolve image URLs
  const imageUrls = [];
  for (const img of rawImages) {
    let url = typeof img === 'string' ? img : (img.src || img.url || '');
    if (!url) continue;
    if (!url.startsWith('http') && !url.startsWith('data:') && sourceUrl) {
      try { url = new URL(url, sourceUrl).href; } catch { continue; }
    }
    imageUrls.push(url);
  }

  const existingSet = new Set(existingPhotos.map(u => u.split('?')[0]));
  let candidates = filterCandidateUrls(imageUrls).filter(u => !existingSet.has(u.split('?')[0]));
  if (candidates.length > MAX_CANDIDATES) candidates = candidates.slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
    return { approved: 0, rehosted: 0, hero_changed: false, candidates: 0 };
  }

  // Classify and rehost
  const rehosted = [];
  for (const url of candidates) {
    if (rehosted.length >= slotsToFill) break;
    const result = await classifyPhoto(url, ANTHROPIC_KEY);
    if (result.verdict !== 'GOOD') continue;
    const stored = await rehostToStorage(url, listing.id, `web_${rehosted.length}_${Date.now()}`);
    if (stored) rehosted.push(stored);
  }

  // Merge gallery and maybe re-rank hero
  const allPhotos = [...existingPhotos, ...rehosted];
  let heroUrl = listing.hero_image;
  let heroChanged = false;

  if (rehosted.length > 0 && allPhotos.length >= 2) {
    const src = listing.hero_image_source;
    if (src !== 'manual' && src !== 'manual_upload') {
      const bestIdx = await pickBestHero(allPhotos, ANTHROPIC_KEY);
      if (allPhotos[bestIdx] !== heroUrl) { heroUrl = allPhotos[bestIdx]; heroChanged = true; }
    }
  }
  if (!heroUrl && allPhotos.length > 0) {
    heroUrl = allPhotos.length > 1 ? allPhotos[await pickBestHero(allPhotos, ANTHROPIC_KEY)] : allPhotos[0];
    heroChanged = true;
  }

  // Deduplicate gallery
  let gallery = heroUrl ? [heroUrl, ...allPhotos.filter(u => u !== heroUrl)] : allPhotos;
  if (heroUrl) {
    const heroBase = heroUrl.split('/').pop()?.replace(/\.\w+$/, '').replace(/_\d+$/, '') || '';
    gallery = gallery.filter((url, idx) => {
      if (idx === 0) return true;
      const base = url.split('/').pop()?.replace(/\.\w+$/, '').replace(/_\d+$/, '') || '';
      if (base === 'google_photo' && heroBase.startsWith('hero_rehost')) return false;
      if (base.startsWith('hero_rehost') && heroBase === 'google_photo') return false;
      return true;
    });
  }

  const updateData = { photos: gallery, crawl_status: 'mined' };
  if (heroUrl && heroChanged) { updateData.hero_image = heroUrl; updateData.hero_image_source = 'crawl_mine'; }
  await supabase.from('listings').update(updateData).eq('id', listing.id);

  return { approved: rehosted.length, rehosted: rehosted.length, hero_changed: heroChanged, candidates: candidates.length };
}

// ── Main Loop ────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 mine-crawl local runner starting...');

  const { count: total } = await supabase.from('listings').select('id', { count: 'exact', head: true })
    .eq('is_touchless', true).not('crawl_snapshot', 'is', null).or('crawl_status.is.null,crawl_status.neq.mined');
  console.log(`📋 ${total} listings to process\n`);

  let processed = 0;
  let totalApproved = 0;
  let totalHeroChanged = 0;
  const startTime = Date.now();

  while (true) {
    // Fetch one listing at a time
    const { data: ids } = await supabase
      .from('listings')
      .select('id')
      .eq('is_touchless', true)
      .not('crawl_snapshot', 'is', null)
      .or('crawl_status.is.null,crawl_status.neq.mined')
      .limit(1);

    if (!ids?.length) {
      console.log('\n✅ All done!');
      break;
    }

    const { data: rows } = await supabase
      .from('listings')
      .select('id, name, city, state, website, crawl_snapshot, photos, hero_image, hero_image_source')
      .eq('id', ids[0].id)
      .limit(1);
    const listing = rows?.[0];
    if (!listing) continue;

    processed++;
    const remaining = (total || 0) - processed;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`[${processed}/${total}] ${listing.name} (${listing.city}, ${listing.state}) ... `);

    try {
      const result = await processListing(listing);
      if (result.skipped) {
        console.log('skipped (no slots/images)');
      } else {
        totalApproved += result.approved;
        if (result.hero_changed) totalHeroChanged++;
        console.log(`${result.candidates} candidates → ${result.approved} approved, hero: ${result.hero_changed ? 'updated' : 'unchanged'}`);
      }
    } catch (e) {
      await supabase.from('listings').update({ crawl_status: 'mined' }).eq('id', listing.id);
      console.log(`ERROR: ${e.message}`);
    }

    // Brief pause to not hammer APIs
    await new Promise(r => setTimeout(r, 500));
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n📊 Summary: ${processed} processed, ${totalApproved} photos approved, ${totalHeroChanged} heroes updated`);
  console.log(`⏱  Total time: ${totalTime} minutes`);
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
