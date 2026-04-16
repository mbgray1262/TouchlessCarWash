#!/usr/bin/env node
/**
 * Apply the 79 promotion candidates from yelp-category-sweep.json:
 * DB listings that were is_touchless=false but now have 1+ positive
 * touchless review snippets on their Yelp biz page.
 *
 * Per review-evidence > chain-default rule, flip is_touchless=true with
 * touchless_verified='user_review' and KEEP is_approved=false until the
 * enrichment pipeline brings them to the full-5-fields standard.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const audit = JSON.parse(readFileSync('scripts/discovery-output/yelp-category-sweep.json', 'utf8'));
const cands = audit.promotion_candidates || [];
console.log(`${cands.length} promotion candidates from Yelp category sweep`);
if (cands.length === 0) process.exit(0);

// Also check the tunnel-chain blocklist — if any candidate's Yelp URL slug
// matches a tunnel chain, exclude (extra safety).
const TUNNEL_SLUG_RE = /\/biz\/(?:tidal-wave|whistle-express|take-5|take5|tsunami-express|mister-car|quick-quack|tommy-s-express|tommys-express|zips-car|white-water-express|whitewater-express|rocket-wash|american-pride-xpress|my-express-car|quick-n-clean|xpress-lube)/i;

const toPromote = cands.filter(c => !TUNNEL_SLUG_RE.test(c.yelp_url || ''));
console.log(`After tunnel-chain filter: ${toPromote.length}`);

// Group by id for reporting
for (const c of toPromote.slice(0, 10)) {
  console.log(`  ${c.name?.slice(0,30).padEnd(30)} ${c.city}, ${c.state}  pos:${c.positive_count}  id:${c.id}`);
}
if (toPromote.length > 10) console.log(`  ...and ${toPromote.length - 10} more`);

// Apply in batches — is_touchless=true, touchless_verified='user_review', is_approved=false
const ids = toPromote.map(c => c.id);
let done = 0;
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200);
  const { error } = await sb.from('listings').update({
    is_touchless: true,
    is_approved: false,
    touchless_verified: 'user_review',
    classification_source: 'promoted_apr16_yelp_category_sweep',
    crawl_notes: 'Promoted: Yelp biz page has 1+ positive touchless review snippets (passes keyword + negation filter). is_approved=false until enrichment pipeline completes per no-partial-listings rule.',
  }).in('id', batch);
  if (!error) done += batch.length;
  else console.error(error);
}
console.log(`\nPromoted: ${done} listings (held at is_approved=false)`);
