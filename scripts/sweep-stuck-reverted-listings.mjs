#!/usr/bin/env node
/**
 * One-off sweep for listings that were reverted (is_touchless=false) but may
 * still be serving a stale live 200 "Touchless Verified" page from the CDN /
 * Next Data Cache — the bug fixed by lib/revalidate-listing.ts.
 *
 * Target set (per diagnosis 2026-07-27):
 *   is_touchless=false AND is_approved=true AND is_self_service=false AND slug NOT NULL
 * These should all 308-redirect to their city hub. This script:
 *   1. curls each production URL, records the status.
 *   2. For any still returning 200, POSTs /api/revalidate (which now busts the
 *      Data Cache tag + route cache + Netlify CDN), waits, then re-curls.
 *   3. Prints a summary; exits non-zero if any URL is still 200 at the end.
 *
 * Run AFTER the fix is deployed to production. Read-only against the DB.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (from .env.local).
 * Optional: SITE=https://touchlesscarwashfinder.com (default), DRY=1 (skip revalidate).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// Minimal .env.local loader (no dotenv dep).
try {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* env already present */ }

const SITE = process.env.SITE || 'https://touchlesscarwashfinder.com';
const DRY = process.env.DRY === '1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const US_STATES = [...fs.readFileSync('lib/constants.ts', 'utf8')
  .matchAll(/\{ code: '([A-Z]{2})', name: '([^']+)' \}/g)]
  .map((x) => ({ code: x[1], name: x[2] }));

const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const listingPath = (r) => {
  const stateSlug = slugify(US_STATES.find((s) => s.code === r.state)?.name ?? r.state);
  return `/state/${stateSlug}/${slugify(r.city)}/${r.slug}`;
};

async function status(url) {
  // Do NOT follow redirects — we want to observe the 308 itself.
  const res = await fetch(url, { method: 'GET', redirect: 'manual' });
  return res.status;
}

async function main() {
  const { data, error } = await supabase
    .from('listings')
    .select('id, name, slug, city, state')
    .eq('is_touchless', false)
    .eq('is_approved', true)
    .eq('is_self_service', false)
    .not('slug', 'is', null);

  if (error) throw error;
  const rows = data ?? [];
  console.log(`Found ${rows.length} candidate reverted-but-approved listings.\n`);

  const stillLive = [];
  for (const r of rows) {
    const path = listingPath(r);
    const url = `${SITE}${path}`;
    let code = await status(url);
    if (code === 200 && !DRY) {
      // Bust caches and retry.
      await fetch(`${SITE}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }).catch(() => {});
      await new Promise((res) => setTimeout(res, 2500));
      code = await status(url);
    }
    const ok = code === 308 || code === 301 || code === 404;
    console.log(`${ok ? '✅' : '❌'} ${code}  ${path}`);
    if (!ok) stillLive.push({ path, code });
  }

  console.log(`\n${rows.length - stillLive.length}/${rows.length} redirect/404 as expected.`);
  if (stillLive.length > 0) {
    console.log(`\n${stillLive.length} still serving live 200:`);
    for (const s of stillLive) console.log(`  ${s.code}  ${s.path}`);
    process.exit(1);
  }
  console.log('All clear.');
}

main().catch((e) => { console.error(e); process.exit(1); });
