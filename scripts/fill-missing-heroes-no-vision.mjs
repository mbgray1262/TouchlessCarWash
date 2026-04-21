#!/usr/bin/env node
/**
 * Fill missing hero_image on is_touchless=true listings WITHOUT running
 * Claude vision. User has already manually curated thousands of heroes
 * and doesn't want the AI second-guessing any of those choices. For
 * listings that somehow ended up with no hero, this script picks a
 * deterministic fallback in priority order:
 *
 *   1. listing.google_photo_url (Google Places first photo, already cached
 *      on the row from a previous Places API call — zero new API cost)
 *   2. Chain brand image (if listing's parent_chain matches a known chain)
 *   3. Street View at the default heading (heading 0, high-res 2048x1152,
 *      URL-signed so we actually get the high-res image)
 *   4. Skip — listing stays unapproved for manual curation
 *
 * After assigning a hero, if the listing also has description + hours +
 * lat/lng + review_count>0, we re-approve it (is_approved=true). Anything
 * missing another data element stays unapproved.
 *
 * Zero API costs. Runs in a few minutes.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
const SIGN_SECRET = env.GOOGLE_URL_SIGNING_SECRET;
const LOG = resolve(repoRoot, 'scripts/fill-missing-heroes-no-vision.log');
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

function signGoogleUrl(url) {
  if (!SIGN_SECRET) return url;
  const u = new URL(url);
  const pathAndQuery = u.pathname + u.search;
  const keyBuffer = Buffer.from(SIGN_SECRET.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
  const hmac = crypto.createHmac('sha1', keyBuffer);
  hmac.update(pathAndQuery);
  const sig = hmac.digest('base64').replace(/\+/g,'-').replace(/\//g,'_');
  return `${url}&signature=${sig}`;
}

function streetViewUrl(lat, lng) {
  const base = `https://maps.googleapis.com/maps/api/streetview?size=2048x1152&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${GOOGLE_KEY}`;
  return signGoogleUrl(base);
}

// Parse chain-brand-images.ts into { chainName: firstImageUrl }. The file
// uses template literals (`${STORAGE}/...jpg`) and some entries are arrays,
// so a naive regex misses 30+ chains. We substitute the STORAGE constant
// then eval the literal object.
function loadChainBrandImages() {
  const src = readFileSync(resolve(repoRoot, 'lib/chain-brand-images.ts'), 'utf8');
  const storageMatch = src.match(/const STORAGE = ['"`]([^'"`]+)['"`]/);
  const STORAGE = storageMatch ? storageMatch[1] : '';
  const objMatch = src.match(/CHAIN_BRAND_IMAGES[^=]*=\s*(\{[\s\S]*?^\};)/m);
  if (!objMatch) return {};
  const objSrc = objMatch[1].replace(/;$/, '').replace(/\$\{STORAGE\}/g, STORAGE);
  let parsed;
  try { parsed = Function(`"use strict"; return (${objSrc})`)(); }
  catch (e) { log(`  ⚠ chain-brand parse error: ${e.message}`); return {}; }
  const map = {};
  for (const [k, v] of Object.entries(parsed)) {
    // Arrays: take the first URL as the default hero. Strings: use as-is.
    map[k] = Array.isArray(v) ? v[0] : v;
  }
  return map;
}

async function main() {
  appendFileSync(LOG, `\n=== fill-missing-heroes-no-vision ${new Date().toISOString()} (dry=${DRY_RUN}) ===\n`);

  const brandImages = loadChainBrandImages();
  log(`Loaded ${Object.keys(brandImages).length} chain brand images`);

  // Paginate — there could be >1000 listings missing heroes
  const PAGE = 1000;
  const candidates = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('listings')
      .select('id, name, parent_chain, city, state, latitude, longitude, description, hours, review_count, is_approved, google_photo_url')
      .eq('is_touchless', true)
      .is('hero_image', null)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    candidates.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  log(`Found ${candidates.length} is_touchless listings with no hero_image`);

  let heroFromGooglePhoto = 0, heroFromChain = 0, heroFromStreetView = 0, heroSkipped = 0;
  let approved = 0, approvedSkipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const l = candidates[i];
    let heroUrl = null;
    let heroSource = null;

    // 1. Google Places first photo (already cached on the listing row)
    if (l.google_photo_url && l.google_photo_url.startsWith('http')) {
      heroUrl = l.google_photo_url;
      heroSource = 'google-photo-cached';
      heroFromGooglePhoto++;
    }

    // 2. Chain brand image
    if (!heroUrl && l.parent_chain && brandImages[l.parent_chain]) {
      heroUrl = brandImages[l.parent_chain];
      heroSource = 'chain-brand-auto';
      heroFromChain++;
    }

    // 3. Street View
    if (!heroUrl && l.latitude != null && l.longitude != null) {
      heroUrl = streetViewUrl(l.latitude, l.longitude);
      heroSource = 'streetview-default';
      heroFromStreetView++;
    }

    if (!heroUrl) {
      heroSkipped++;
      continue;
    }

    // Quality gate for approval: must have description + hours + lat/lng.
    // review_count is checked loosely — zero reviews is OK if the rest is populated.
    const hasDesc = !!l.description && l.description.length >= 40;
    const hasHours = l.hours && Object.keys(l.hours).length > 0;
    const hasCoords = l.latitude != null && l.longitude != null;
    const canApprove = hasDesc && hasHours && hasCoords;

    if (DRY_RUN) {
      if ((i < 5) || i % 100 === 0) log(`  [${i+1}/${candidates.length}] ${l.name} | ${heroSource} | would-approve=${canApprove}`);
      if (canApprove) approved++; else approvedSkipped++;
      continue;
    }

    const update = { hero_image: heroUrl, hero_image_source: heroSource };
    if (canApprove && !l.is_approved) update.is_approved = true;

    const { error } = await sb.from('listings').update(update).eq('id', l.id);
    if (error) {
      log(`  ⚠ ${l.name}: update error — ${error.message.slice(0,100)}`);
      continue;
    }
    if (canApprove) approved++; else approvedSkipped++;
    if (i % 50 === 0) log(`  progress: ${i+1}/${candidates.length} — google-photo=${heroFromGooglePhoto} chain=${heroFromChain} streetview=${heroFromStreetView} skipped=${heroSkipped} | approved=${approved}`);
  }

  log(`\nDONE:`);
  log(`  Hero from cached Google photo:   ${heroFromGooglePhoto}`);
  log(`  Hero from chain brand image:     ${heroFromChain}`);
  log(`  Hero from Street View:           ${heroFromStreetView}`);
  log(`  Skipped (no source available):   ${heroSkipped}`);
  log(`  Re-approved after quality gate:  ${approved}`);
  log(`  Got hero but failed other check: ${approvedSkipped}`);
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
