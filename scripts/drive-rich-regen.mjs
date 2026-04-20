#!/usr/bin/env node
/**
 * Drive a FULL regeneration of all is_touchless listings that have
 * rich source data (extracted_data OR crawl_snapshot).
 *
 * Uses regenerate:true so existing descriptions are overwritten, and
 * rich_only:true so only listings with real website-derived content
 * are processed (thin listings without source data are left alone).
 *
 * Logs to scripts/drive-rich-regen.log and prints progress to stdout.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});

const URL_BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-descriptions`;
const HEADERS = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` };
const LOG = resolve(repoRoot, 'scripts/drive-rich-regen.log');

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

// Start the job
const JOB_ID_ARG = process.argv.find(a => a.startsWith('--job='))?.split('=')[1];
let jobId = JOB_ID_ARG;
let total = 0;
if (!jobId) {
  log('Starting new regeneration job (regenerate:true, rich_only:true)...');
  const start = await call({ action: 'start', regenerate: true, rich_only: true });
  jobId = start.job_id;
  total = start.total;
  log(`Job ${jobId} created: ${total} listings to regenerate`);
} else {
  log(`Resuming job ${jobId}`);
}

// Drive process_batch until done
let done = 0, failed = 0, consecutiveErr = 0;
const startTime = Date.now();
while (true) {
  try {
    const r = await call({ action: 'process_batch', job_id: jobId });
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
        const eta = total > 0 ? ((total - done - failed) / rate).toFixed(1) : '?';
        log(`  progress: ${done}/${total} done, ${failed} failed, ${rate.toFixed(1)}/min, ETA ${eta}m`);
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
