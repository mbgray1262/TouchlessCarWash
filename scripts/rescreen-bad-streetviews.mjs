#!/usr/bin/env node
/**
 * Re-screen the 760 listings that got `hero_image_source='streetview-default'`
 * from this morning's no-vision fill. Those images were Street View at
 * heading=0 with no quality check — random road views, billboards, etc.
 *
 * Strategy:
 *   1. Null out the bad hero + flip is_approved=false on each one.
 *   2. Delegate to auto-hero-pipeline.mjs in default mode, which targets
 *      exactly this (is_touchless=true AND is_approved=false AND place_id)
 *      and runs the full waterfall: Places photos → Street View → chain
 *      brand, all AI-screened with the strict prompt we deployed today.
 *   3. auto-hero-pipeline re-approves any listing that ends up with a
 *      valid hero + hours + description; leaves the rest unapproved for
 *      your manual review.
 *
 * Run order:
 *   node scripts/rescreen-bad-streetviews.mjs      # unapproves + nulls heroes
 *   node scripts/auto-hero-pipeline.mjs --limit=1000  # finds proper heroes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const LOG = resolve(repoRoot, 'scripts/rescreen-bad-streetviews.log');
const DRY_RUN = process.argv.includes('--dry-run');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function main() {
  appendFileSync(LOG, `\n=== rescreen-bad-streetviews ${new Date().toISOString()} (dry=${DRY_RUN}) ===\n`);
  // Paginate
  const PAGE = 1000;
  const targets = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('listings')
      .select('id, name, city, state')
      .eq('hero_image_source', 'streetview-default')
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    targets.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  log(`Found ${targets.length} listings with hero_image_source='streetview-default'`);
  if (DRY_RUN) { log('(dry-run — no writes)'); return; }

  // Unapprove + null hero in chunks. Keeping hero_image_source labeled for
  // now so we can see which ones this pass touched if anything goes wrong.
  let done = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const ids = targets.slice(i, i + 100).map(t => t.id);
    const { error } = await sb.from('listings').update({
      hero_image: null,
      hero_image_source: 'held_for_review',
      is_approved: false,
    }).in('id', ids);
    if (error) { log(`  chunk ${i}: ${error.message}`); break; }
    done += ids.length;
    log(`  unapproved + nulled ${done}/${targets.length}`);
  }

  log(`\nReady for pipeline. Next: node scripts/auto-hero-pipeline.mjs --limit=1000`);
}
main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
