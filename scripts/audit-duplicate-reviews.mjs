/**
 * audit-duplicate-reviews.mjs
 *
 * Scans review_snippets for DUPLICATE reviews within the same listing.
 *
 * Trigger: Island Car Wash (Corpus Christi, TX) showed the SAME review text by
 * the same reviewer twice, with different relative dates ("6 years ago" vs
 * "7 years ago") — i.e. the same review mined twice from different sources/runs
 * with no matching review_id, so dedup never collapsed them.
 *
 * A duplicate group = rows with the same listing_id that share EITHER:
 *   - the same non-null review_id, OR
 *   - the same (normalized reviewer_name + normalized review_text)
 *
 * READ-ONLY by default. Pass --delete to remove all but one row per group
 * (keeps the richest / earliest-created row).
 *
 * Usage:
 *   node scripts/audit-duplicate-reviews.mjs            # report only
 *   node scripts/audit-duplicate-reviews.mjs --delete   # report + delete dups
 */

import { readFileSync } from 'node:fs';

// --- load env from .env.local ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DO_DELETE = process.argv.includes('--delete');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars in .env.local');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const COLS =
  'id,listing_id,reviewer_name,review_text,review_date,iso_date,review_id,source,sentiment,is_touchless_evidence,created_at,touchless_about,paint_relevant,paint_sentiment,reviewer_review_count';

async function fetchAll() {
  // Order by the unique PK (id) so offset paging is STABLE — ordering by a
  // non-unique column (created_at) makes rows shift between pages and get
  // fetched twice, producing phantom "duplicates" that are really one row.
  const byId = new Map();
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const url = `${SUPABASE_URL}/rest/v1/review_snippets?select=${COLS}&order=id.asc&offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch failed ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    for (const r of batch) byId.set(r.id, r); // dedupe by PK defensively
    process.stdout.write(`\r  fetched ${byId.size} review_snippets...`);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  process.stdout.write('\n');
  return [...byId.values()];
}

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// Different mining sources prefix the SAME Google review id differently
// (serpapi/dataforseo store the bare "ChZD..."/"Ci9D..."; older gmaps-search-clean
// stored "g-ChZD..."; the rebuilt search miner stored "gsc-<listing-uuid>-ChZD...").
// Strip every known source prefix so the underlying Google review id matches and
// cross-source copies collapse into one group.
const normRid = (rid) =>
  (rid || '')
    .replace(/^gsc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
    .replace(/^g-/, '')
    .trim();

// Keeper = the richest copy, so deleting the others loses no enrichment.
// Haiku labels (touchless_about / sentiment / paint_*) power the Touchless
// Satisfaction & Paint-Safe scores, so they outweigh everything else.
function richness(r) {
  return (
    (r.touchless_about ? 8 : 0) +
    (r.paint_relevant != null ? 8 : 0) +
    (r.paint_sentiment ? 4 : 0) +
    (r.sentiment ? 4 : 0) +
    (r.iso_date ? 2 : 0) +
    (r.reviewer_review_count != null ? 2 : 0) +
    (r.review_id ? 1 : 0) +
    (r.is_touchless_evidence ? 1 : 0)
  );
}
function pickKeeper(group) {
  return [...group].sort((a, b) => {
    const d = richness(b) - richness(a);
    if (d) return d;
    return new Date(a.created_at) - new Date(b.created_at); // tiebreak: oldest
  })[0];
}

// Coalesce enrichment from all copies into the keeper so deleting the rest
// is lossless even when labels are split across copies. Returns a patch object
// (only fields the keeper is missing but a sibling has), or null if nothing.
const MERGE_FIELDS = [
  'touchless_about', 'sentiment', 'paint_relevant', 'paint_sentiment',
  'iso_date', 'reviewer_review_count', 'is_touchless_evidence', 'review_id',
];
function buildMergePatch(keeper, group) {
  const patch = {};
  for (const f of MERGE_FIELDS) {
    if (keeper[f] != null && keeper[f] !== false && keeper[f] !== '') continue;
    const donor = group.find(
      (r) => r.id !== keeper.id && r[f] != null && r[f] !== false && r[f] !== ''
    );
    if (donor) patch[f] = donor[f];
  }
  return Object.keys(patch).length ? patch : null;
}

async function patchRow(id, patch) {
  const url = `${SUPABASE_URL}/rest/v1/review_snippets?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch failed ${res.status}: ${await res.text()}`);
}

async function deleteIds(ids) {
  // delete in chunks via in.() filter
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const url = `${SUPABASE_URL}/rest/v1/review_snippets?id=in.(${chunk.join(',')})`;
    const res = await fetch(url, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(`delete failed ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  console.log('Scanning review_snippets for in-listing duplicates...\n');
  const rows = await fetchAll();

  // group by listing
  const byListing = new Map();
  for (const r of rows) {
    if (!byListing.has(r.listing_id)) byListing.set(r.listing_id, []);
    byListing.get(r.listing_id).push(r);
  }

  const dupGroups = []; // {listing_id, rows:[...]}
  for (const [listing_id, list] of byListing) {
    // Union-find: a row is a duplicate of another if they share EITHER a
    // normalized review_id OR a (reviewer_name + normalized text). Two sources
    // can store the same human review with different id formats, so neither
    // key alone is sufficient — merge across both.
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a, b) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const ridFirst = new Map(); // normalized review_id -> first index
    const txtFirst = new Map(); // reviewer|text -> first index
    list.forEach((r, i) => {
      const rid = normRid(r.review_id);
      if (rid) {
        if (ridFirst.has(rid)) union(ridFirst.get(rid), i);
        else ridFirst.set(rid, i);
      }
      const t = norm(r.review_text);
      if (t.length >= 8) {
        const tk = `${norm(r.reviewer_name)}|${t}`;
        if (txtFirst.has(tk)) union(txtFirst.get(tk), i);
        else txtFirst.set(tk, i);
      }
    });

    const groups = new Map();
    list.forEach((r, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(r);
    });
    for (const [, g] of groups) {
      if (g.length > 1) dupGroups.push({ listing_id, rows: g });
    }
  }

  const toDelete = [];
  const merges = []; // {id, patch}
  let totalDupRows = 0;
  for (const grp of dupGroups) {
    const keeper = pickKeeper(grp.rows);
    const losers = grp.rows.filter((r) => r.id !== keeper.id);
    totalDupRows += losers.length;
    toDelete.push(...losers.map((r) => r.id));
    const patch = buildMergePatch(keeper, grp.rows);
    if (patch) merges.push({ id: keeper.id, patch });
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total review_snippets:            ${rows.length}`);
  console.log(`Listings with duplicate reviews:  ${new Set(dupGroups.map((g) => g.listing_id)).size}`);
  console.log(`Duplicate groups:                 ${dupGroups.length}`);
  console.log(`Redundant rows (would delete):    ${totalDupRows}\n`);

  // show top offenders
  const sample = [...dupGroups]
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 15);
  console.log('--- sample duplicate groups (up to 15) ---');
  for (const g of sample) {
    const r = g.rows[0];
    console.log(
      `\nlisting ${g.listing_id}  (${g.rows.length} copies)  by "${r.reviewer_name}"`
    );
    console.log(`  text: ${norm(r.review_text).slice(0, 90)}`);
    for (const row of g.rows) {
      console.log(
        `    id=${row.id} rid=${row.review_id || '-'} date="${row.review_date || '-'}" src=${row.source} created=${row.created_at?.slice(0, 10)}`
      );
    }
  }

  console.log(`Keepers needing label-merge first: ${merges.length}`);

  if (DO_DELETE && toDelete.length) {
    if (merges.length) {
      console.log(`\nMerging labels into ${merges.length} keepers...`);
      let n = 0;
      for (const m of merges) {
        await patchRow(m.id, m.patch);
        if (++n % 100 === 0) process.stdout.write(`\r  merged ${n}/${merges.length}`);
      }
      process.stdout.write(`\r  merged ${merges.length}/${merges.length}\n`);
    }
    console.log(`Deleting ${toDelete.length} redundant rows...`);
    await deleteIds(toDelete);
    console.log('Done. Re-run without --delete to confirm 0 remaining.');
  } else if (toDelete.length) {
    console.log(`\nRe-run with --delete to merge labels + remove ${toDelete.length} redundant rows.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
