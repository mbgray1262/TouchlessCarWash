/**
 * Nationwide self-serve classification sweep (the funnel driver).
 *
 * Loops over the UNCLASSIFIED washes (is_self_service IS NULL, has place_id), and per super-chunk:
 *   1. HARVEST every gallery — K browsers (free; no Places/Street View)
 *   2. MERGE the parallel harvest files into scripts/_gallery_urls.json
 *   3. TRIAGE with one contact-sheet call/listing → set is_self_service true/false (or leave NULL=maybe)
 *
 * Resumable via a monotonic id cursor (/tmp/natl_cursor.txt). Browser-only, checkpointed, and it
 * NEVER touches is_approved or is_touchless. Progress → /tmp/natl_progress.log, detail → /tmp/natl.log
 *
 * GENTLE BY DEFAULT (the DB is on Micro — see project_supabase_micro_overload_incident):
 *   - K=1 (single browser) — no stacked parallel scrapers.
 *   - THROTTLE ms of idle between chunks so it never hammers continuously.
 *   - A single-instance LOCK so a second sweep can't pile on.
 *   - DB-error BACKOFF: a transient failure waits + retries; it is NOT mistaken for "all done".
 * Bump --k / lower --throttle ONLY for a short attended catch-up, never for an unattended run.
 *
 *   node scripts/natl_sweep.mjs                       # gentle full run (K=1, throttled)
 *   node scripts/natl_sweep.mjs --max 500             # pilot: stop after ~500 processed
 *   node scripts/natl_sweep.mjs --k 2 --throttle 4000 # faster, attended only
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const MAX = parseInt(arg('--max','0'),10) || Infinity;   // 0 = unlimited
const CHUNK = 60;
const K = Math.max(1, parseInt(arg('--k','1'),10));        // parallel harvesters — default 1 (gentle)
const THROTTLE = Math.max(0, parseInt(arg('--throttle','8000'),10)); // idle ms between chunks
const CURSOR_FILE = '/tmp/natl_cursor.txt';
const LOCK_FILE = '/tmp/natl_sweep.lock';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const log = m => { const s=`[${new Date().toISOString().slice(11,19)}] ${m}`; console.log(s); appendFileSync('/tmp/natl_progress.log', s+'\n'); };

// ── Single-instance lock: refuse to start if another sweep is alive. This is the guard against
// accidentally stacking sweeps (a big contributor to the Micro-DB overload incident). ──
if (existsSync(LOCK_FILE)) {
  const pid = parseInt(readFileSync(LOCK_FILE,'utf8').trim(),10);
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { alive = false; }
  if (alive) { console.error(`Another sweep is already running (pid ${pid}). Refusing to stack. Exiting.`); process.exit(1); }
  try { unlinkSync(LOCK_FILE); } catch {}   // stale lock — clear it
}
writeFileSync(LOCK_FILE, String(process.pid));
const releaseLock = () => { try { if (existsSync(LOCK_FILE) && readFileSync(LOCK_FILE,'utf8').trim()===String(process.pid)) unlinkSync(LOCK_FILE); } catch {} };
for (const sig of ['exit','SIGINT','SIGTERM']) process.on(sig, () => { releaseLock(); if (sig!=='exit') process.exit(0); });

const run = (cmd, args, stdin) => new Promise(res => {
  const c = spawn(cmd, args, { cwd: process.cwd() });
  let err='';
  c.stderr.on('data', d=>{ err+=d; });
  c.stdout.on('data', ()=>{});
  if (stdin!=null){ c.stdin.write(stdin); c.stdin.end(); }
  c.on('close', code => res({ code, err }));
});

// Returns { data } on success (possibly empty = genuinely done) or { error:true } on persistent
// DB failure. The caller MUST distinguish these — the old version returned [] on error, which the
// loop read as "ALL DONE" and stopped the sweep on a transient blip.
async function nextChunk(cursor) {
  for (let a=0;a<6;a++){
    const r = await sb.from('listings').select('id,name,google_place_id')
      .is('is_self_service',null).not('google_place_id','is',null)
      .gt('id', cursor).order('id').limit(CHUNK);
    if (!r.error) return { data: r.data || [] };
    await sleep(Math.min(2**a, 30) * 1000);   // exponential backoff, capped 30s
  }
  return { error: true };
}

function mergeInto(main, sliceFile) {
  if (!existsSync(sliceFile)) return;
  try { const s = JSON.parse(readFileSync(sliceFile,'utf8')); for (const k of Object.keys(s)) main[k]=s[k]; } catch {}
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';   // sorts before any real uuid
let cursor = existsSync(CURSOR_FILE) ? readFileSync(CURSOR_FILE,'utf8').trim() : ZERO_UUID;
let processed = 0, totalYes=0, totalNo=0, totalMaybe=0;
log(`nationwide sweep START (cursor=${cursor||'begin'}, max=${MAX===Infinity?'all':MAX}, K=${K}, throttle=${THROTTLE}ms, pid=${process.pid})`);

while (processed < MAX) {
  const { data: chunk, error } = await nextChunk(cursor);
  if (error) { log('⚠ DB unreachable after backoff — pausing 60s before retrying (NOT treating as done)'); await sleep(60000); continue; }
  if (!chunk.length) { log('ALL DONE — no more unclassified listings'); break; }
  // 1) split + harvest — SKIP listings whose gallery we already have (resumable/cheap)
  const have = existsSync('scripts/_gallery_urls.json') ? JSON.parse(readFileSync('scripts/_gallery_urls.json','utf8')) : {};
  const toHarvest = chunk.filter(l => !(have[l.id] && (have[l.id].urls||[]).length));
  const slices = Array.from({length:K},()=>[]);
  toHarvest.forEach((l,i)=>slices[i%K].push([l.id, l.google_place_id, l.name]));
  const sliceFiles = slices.map((_,k)=>`scripts/_gallery_slice_${k}.json`);
  sliceFiles.forEach(f=>{ try{ writeFileSync(f,'{}'); }catch{} });
  await Promise.all(slices.map((sl,k)=> sl.length
    ? run('python3',['scripts/maps_gallery.py','--stdin','--out',sliceFiles[k]], JSON.stringify(sl))
    : Promise.resolve({code:0})));
  // 2) merge slices into the main gallery file
  const main = existsSync('scripts/_gallery_urls.json') ? JSON.parse(readFileSync('scripts/_gallery_urls.json','utf8')) : {};
  sliceFiles.forEach(f=>mergeInto(main,f));
  writeFileSync('scripts/_gallery_urls.json', JSON.stringify(main));
  // 3) triage --apply this chunk
  const ids = chunk.map(l=>l.id).join(',');
  const tr = await run('node',['scripts/classify-selfserve.mjs','--ids',ids,'--apply']);
  // advance cursor + counters
  cursor = chunk[chunk.length-1].id; writeFileSync(CURSOR_FILE, cursor);
  processed += chunk.length;
  // read back this chunk's verdict counts from DB (authoritative)
  const cIds = chunk.map(l=>l.id);
  let y=0,n=0;
  for (let i=0;i<cIds.length;i+=100){ const { data } = await sb.from('listings').select('is_self_service,self_service_source').in('id',cIds.slice(i,i+100));
    for (const r of (data||[])){ if(r.self_service_source==='triage_selfserve')y++; else if(r.self_service_source==='triage_not_selfserve')n++; } }
  totalYes+=y; totalNo+=n; totalMaybe+=(chunk.length-y-n);
  log(`chunk ${chunk.length} done | this: +${y} self-serve, ${n} no | cumulative: ${processed} processed, ${totalYes} SELF-SERVE found, ${totalNo} no, ${totalMaybe} maybe/skip | triage exit ${tr.code}`);
  // ── THROTTLE: idle between chunks so the sweep is never a continuous hammer on the Micro DB. ──
  if (processed < MAX) await sleep(THROTTLE);
}
log(`sweep STOPPED | processed=${processed} selfserve=${totalYes} no=${totalNo} maybe=${totalMaybe}`);
releaseLock();
