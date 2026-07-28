#!/usr/bin/env node
/**
 * LIVE acceptance test for the reverted-listing cache fix. Fully reversible.
 *
 *   1. Picks one real touchless + approved listing, captures its exact current
 *      is_touchless / is_approved / touchless_verified.
 *   2. Reverts it via the real admin path (POST /api/admin/listings/toggle-touchless
 *      { is_touchless: false }) against PRODUCTION.
 *   3. Polls the public URL every 2s (no-redirect) and reports how long until it
 *      returns 308 — the fix should flip it within seconds.
 *   4. Restores the captured original values via a direct DB update and confirms
 *      the URL is 200 again.
 *
 * Env from .env.local. Optional SITE (default prod).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* env already present */ }

const SITE = process.env.SITE || 'https://touchlesscarwashfinder.com';
// Service-role key: the RESTORE step needs write access (RLS blocks the anon
// key from UPDATE, which would otherwise strand the test listing reverted).
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY required (restore needs write access).'); process.exit(1); }
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_KEY);

const US_STATES = [...fs.readFileSync('lib/constants.ts', 'utf8')
  .matchAll(/\{ code: '([A-Z]{2})', name: '([^']+)' \}/g)].map((x) => ({ code: x[1], name: x[2] }));
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pathOf = (r) => `/state/${slugify(US_STATES.find((s) => s.code === r.state)?.name ?? r.state)}/${slugify(r.city)}/${r.slug}`;
const statusOf = async (url) => (await fetch(url, { redirect: 'manual' })).status;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Pick a low-traffic touchless+approved listing to minimise public impact.
  const { data, error } = await supabase
    .from('listings')
    .select('id, name, slug, city, state, is_touchless, is_approved, touchless_verified, review_count')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .not('slug', 'is', null)
    .gte('review_count', 5)
    .lte('review_count', 40)
    .order('review_count', { ascending: true })
    .limit(1);
  if (error) throw error;
  const t = data?.[0];
  if (!t) throw new Error('No suitable test listing found.');

  const path = pathOf(t);
  const url = `${SITE}${path}`;
  const orig = { is_touchless: t.is_touchless, is_approved: t.is_approved, touchless_verified: t.touchless_verified };
  console.log(`Target: ${t.name} (${t.city}, ${t.state})`);
  console.log(`URL: ${url}`);
  console.log(`Original: ${JSON.stringify(orig)}`);

  const before = await statusOf(url);
  console.log(`\nBefore revert: HTTP ${before} (expect 200)`);

  console.log('\nReverting via /api/admin/listings/toggle-touchless { is_touchless: false }...');
  const res = await fetch(`${SITE}/api/admin/listings/toggle-touchless`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: t.id, is_touchless: false }),
  });
  console.log(`  admin API: HTTP ${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`);

  const t0 = Date.now();
  let flipped = null;
  for (let i = 0; i < 20; i++) {
    const code = await statusOf(url);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  +${secs}s  HTTP ${code}`);
    if (code === 308 || code === 301) { flipped = Number(secs); break; }
    await sleep(2000);
  }

  console.log('\nRestoring original values...');
  const { error: restoreErr } = await supabase.from('listings').update(orig).eq('id', t.id);
  if (restoreErr) {
    console.error(`  ⚠️  RESTORE FAILED: ${restoreErr.message}`);
    console.error(`  Manually restore listing ${t.id} to ${JSON.stringify(orig)}`);
    process.exit(2);
  }
  // Bust caches so it returns to 200 promptly.
  await fetch(`${SITE}/api/revalidate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
  }).catch(() => {});
  await sleep(3000);
  const after = await statusOf(url);
  console.log(`  Restored. HTTP ${after} (expect 200)`);

  console.log('\n──────── RESULT ────────');
  if (flipped !== null) console.log(`✅ Revert propagated to 308 in ~${flipped}s`);
  else console.log('❌ URL did NOT 308 within ~40s — fix not live or not working');
  process.exit(flipped !== null && after === 200 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
