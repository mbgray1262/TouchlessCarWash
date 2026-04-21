#!/usr/bin/env node
/**
 * Sweep all currently-approved touchless listings against the Google Places
 * API `businessStatus` field. Any listing Google reports as
 * CLOSED_PERMANENTLY or CLOSED_TEMPORARILY gets unapproved with a
 * classification_source flag so future re-enrichment pipelines skip it.
 *
 * We do NOT delete the row:
 *  - Preserves historical data (reviews, descriptions, heroes)
 *  - Keeps the URL resolvable so the nearest-city redirect still works
 *  - If the business reopens, a future sweep can re-approve
 *
 * Cost: ~$5 per 1,000 Places Details calls (Essentials SKU, businessStatus
 * is a basic field). For ~4,000 listings, roughly $20 total.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_KEY) { console.error('Missing GOOGLE_PLACES_API_KEY'); process.exit(1); }
const LOG = resolve(repoRoot, 'scripts/detect-closed-via-places.log');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function fetchStatus(placeId) {
  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?key=${GOOGLE_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'businessStatus' }, signal: AbortSignal.timeout(10000) },
    );
    if (r.status === 404) return { status: 'NOT_FOUND' };
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const d = await r.json();
    return { status: d.businessStatus ?? 'UNKNOWN' };
  } catch (e) { return { error: e.message }; }
}

async function main() {
  appendFileSync(LOG, `\n=== detect-closed-via-places ${new Date().toISOString()} (dry=${DRY_RUN}, limit=${LIMIT || 'all'}) ===\n`);

  // Pull every currently-approved touchless listing with a google_place_id
  const PAGE = 1000;
  const all = [];
  let offset = 0;
  while (true) {
    let q = sb.from('listings')
      .select('id, name, city, state, google_place_id, classification_source')
      .eq('is_touchless', true).eq('is_approved', true)
      .not('google_place_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const target = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  log(`Found ${all.length} approved touchless listings with a google_place_id${LIMIT ? `, limiting to ${target.length}` : ''}`);

  const counts = { OPERATIONAL: 0, CLOSED_PERMANENTLY: 0, CLOSED_TEMPORARILY: 0, NOT_FOUND: 0, UNKNOWN: 0, errors: 0 };
  const toUnapprove = [];

  for (let i = 0; i < target.length; i++) {
    const l = target[i];
    const r = await fetchStatus(l.google_place_id);
    if (r.error) { counts.errors++; continue; }
    const s = r.status;
    counts[s] = (counts[s] ?? 0) + 1;
    if (s === 'CLOSED_PERMANENTLY' || s === 'CLOSED_TEMPORARILY' || s === 'NOT_FOUND') {
      toUnapprove.push({ ...l, business_status: s });
    }
    if (i % 100 === 0 || i === target.length - 1) {
      log(`  progress: ${i + 1}/${target.length} | OP=${counts.OPERATIONAL} PERM=${counts.CLOSED_PERMANENTLY} TEMP=${counts.CLOSED_TEMPORARILY} 404=${counts.NOT_FOUND} err=${counts.errors}`);
    }
  }

  log(`\n--- Results ---`);
  log(`  OPERATIONAL:         ${counts.OPERATIONAL}`);
  log(`  CLOSED_PERMANENTLY:  ${counts.CLOSED_PERMANENTLY}`);
  log(`  CLOSED_TEMPORARILY:  ${counts.CLOSED_TEMPORARILY}`);
  log(`  NOT_FOUND (deleted): ${counts.NOT_FOUND}`);
  log(`  UNKNOWN/other:       ${counts.UNKNOWN}`);
  log(`  API errors:          ${counts.errors}`);
  log(`  Total to unapprove:  ${toUnapprove.length}`);

  if (DRY_RUN || toUnapprove.length === 0) {
    log(`\n(dry-run or nothing to do — no writes performed)`);
    if (toUnapprove.length > 0 && DRY_RUN) {
      log('\nSample of 10:');
      for (const l of toUnapprove.slice(0, 10)) log(`  ${l.business_status.padEnd(20)} ${l.name} (${l.city}, ${l.state})`);
    }
    return;
  }

  // Unapprove in chunks. Tag with classification_source so re-enrichment
  // pipelines know why the listing is in its current state. Keep the row
  // (don't delete) so URL redirects still work for incoming visitors.
  const timestamp = new Date().toISOString().slice(0, 10);
  let done = 0;
  for (const l of toUnapprove) {
    const src = l.business_status === 'NOT_FOUND' ? 'closed_google_not_found' :
                l.business_status === 'CLOSED_PERMANENTLY' ? 'closed_permanently_google' :
                'closed_temporarily_google';
    const note = `[${timestamp}] Unapproved via detect-closed-via-places: Google Places businessStatus=${l.business_status}`;
    const { error } = await sb.from('listings').update({
      is_approved: false,
      classification_source: src,
      crawl_notes: note,
    }).eq('id', l.id);
    if (error) { log(`  ⚠ ${l.name}: ${error.message.slice(0, 100)}`); continue; }
    done++;
    if (done % 25 === 0) log(`  unapproved ${done}/${toUnapprove.length}`);
  }
  log(`\nDONE: unapproved ${done} listings (${counts.CLOSED_PERMANENTLY} perm + ${counts.CLOSED_TEMPORARILY} temp + ${counts.NOT_FOUND} not-found).`);
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
