/**
 * post-deploy-revalidate — run RIGHT AFTER any production deploy.
 *
 * WHY: each deploy renames the hashed _next/static assets; pages still cached
 * under the previous deploy reference the now-deleted files and break for the
 * first visitor ("Application error / Refused to apply style … MIME text/html").
 * See memory project_netlify_isr_edge_caching (2026-06-27 asset-hash skew).
 *
 * This proactively re-renders the pages that MATTER — the hub pages + every
 * listing an owner has embedded a badge on (i.e. pages with real inbound links /
 * traffic) — so they're fresh against the new build before any visitor arrives.
 * Uses only the existing /api/revalidate endpoint (no fragile cache-config
 * changes). NOT a full cure (any uncovered page can still self-heal on 2nd hit);
 * the airtight fix is auto-purging the durable cache on deploy — a careful TODO.
 *
 * Run: node scripts/post-deploy-revalidate.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const SITE = 'https://touchlesscarwashfinder.com';

const STATE_SLUG = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado',
  CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho',
  IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi',
  MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new-hampshire', NJ: 'new-jersey',
  NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio', OK: 'oklahoma',
  OR: 'oregon', PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina', SD: 'south-dakota',
  TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington',
  WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'washington-dc',
};
const slugify = (x) => (x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function revalidate(path) {
  try {
    const r = await fetch(`${SITE}/api/revalidate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return r.status;
  } catch { return 'ERR'; }
}

// Hub / high-traffic landing pages.
const HUBS = ['/', '/best', '/states', '/chains', '/shop', '/blog', '/unlimited-touchless-car-wash', '/touchless-satisfaction-score'];

// Every listing an owner has embedded a badge on — these have real inbound
// links and MUST never render broken.
async function badgeListingPaths() {
  const { data: embeds } = await sb.from('badge_embeds').select('listing_slug');
  const slugs = [...new Set((embeds || []).map((e) => e.listing_slug))];
  if (!slugs.length) return [];
  const { data: rows } = await sb
    .from('listings').select('slug, city, state').in('slug', slugs);
  return (rows || [])
    .filter((l) => l.state && STATE_SLUG[l.state] && l.city)
    .map((l) => `/state/${STATE_SLUG[l.state]}/${slugify(l.city)}/${l.slug}`);
}

const paths = [...HUBS, ...(await badgeListingPaths())];
console.log(`Re-warming ${paths.length} pages after deploy…`);
let ok = 0;
for (const p of paths) {
  const s = await revalidate(p);
  if (s === 200 || s === 308) ok++;
  console.log(`  ${s}  ${p}`);
}
console.log(`\nDone: ${ok}/${paths.length} refreshed.`);
