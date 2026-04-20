#!/usr/bin/env node
/**
 * Second-pass regeneration for listings beyond the 1,000-row cap of the
 * first generate-descriptions start call. Queries all rich listings sorted
 * by review_count, skips the first 1000 (which batch #1 already handled),
 * and passes the remaining IDs explicitly to the edge function.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const URL_BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-descriptions`;
const HEADERS = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` };
const LOG = resolve(repoRoot, 'scripts/drive-rich-regen-batch2.log');

function log(msg) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function call(body) {
  const r = await fetch(URL_BASE, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}

// Paginate to get ALL rich listing IDs in review_count desc order
const PAGE = 1000;
let offset = 0;
const allIds = [];
while (true) {
  const { data, error } = await sb.from('listings')
    .select('id')
    .eq('is_touchless', true)
    .not('extracted_data', 'is', null)
    .order('review_count', { ascending: false })
    .range(offset, offset + PAGE - 1);
  if (error) { log(`ERR ${error.message}`); process.exit(1); }
  if (!data || data.length === 0) break;
  allIds.push(...data.map(r => r.id));
  log(`  fetched ${allIds.length} rich listing ids...`);
  if (data.length < PAGE) break;
  offset += PAGE;
}
log(`Total rich listings: ${allIds.length}`);

// Skip the first 1000 — already done in batch #1
const remaining = allIds.slice(1000);
log(`Remaining for batch #2: ${remaining.length}`);

if (remaining.length === 0) { log('Nothing to do'); process.exit(0); }

// Kick off job with explicit listing_ids
const start = await call({ action: 'start', regenerate: true, listing_ids: remaining });
log(`Job ${start.job_id} created: ${start.total} listings`);

// Drive process_batch until done
let done = 0, failed = 0, consecutiveErr = 0;
const startTime = Date.now();
while (true) {
  try {
    const r = await call({ action: 'process_batch', job_id: start.job_id });
    consecutiveErr = 0;
    if (r.done) {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      log(`DONE: processed=${done}, failed=${failed}, elapsed=${elapsed}m`);
      break;
    }
    if (r.success) {
      done++;
      if (done % 25 === 0) {
        const elapsed = (Date.now() - startTime) / 60000;
        const rate = done / elapsed;
        const eta = ((remaining.length - done - failed) / rate).toFixed(1);
        log(`  progress: ${done}/${remaining.length} done, ${failed} failed, ${rate.toFixed(1)}/min, ETA ${eta}m`);
      }
    } else {
      failed++;
      if (r.error) log(`  fail: ${String(r.error).slice(0,150)}`);
    }
    await new Promise(r => setTimeout(r, 400));
  } catch (e) {
    consecutiveErr++;
    log(`  ERR: ${e.message}`);
    if (consecutiveErr > 10) { log('Aborting: too many consecutive errors'); break; }
    await new Promise(r => setTimeout(r, 10000));
  }
}
