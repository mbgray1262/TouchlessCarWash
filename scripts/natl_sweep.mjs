/**
 * Nationwide self-serve classification sweep (the funnel driver).
 *
 * Loops over the UNCLASSIFIED washes (is_self_service IS NULL, has place_id), and per super-chunk:
 *   1. HARVEST every gallery — K browsers in parallel (free; no Places/Street View)
 *   2. MERGE the parallel harvest files into scripts/_gallery_urls.json
 *   3. TRIAGE with one contact-sheet call/listing → set is_self_service true/false (or leave NULL=maybe)
 *
 * Resumable via a monotonic id cursor (/tmp/natl_cursor.txt). Browser-only, checkpointed, and it
 * NEVER touches is_approved or is_touchless. Progress → /tmp/natl_progress.log, detail → /tmp/natl.log
 *
 *   node scripts/natl_sweep.mjs --max 500        # pilot: stop after ~500 processed
 *   node scripts/natl_sweep.mjs                  # full run
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { spawn } from 'child_process';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const MAX = parseInt(arg('--max','0'),10) || Infinity;   // 0 = unlimited
const CHUNK = 60, K = 3;                                  // super-chunk size, parallel harvesters
const CURSOR_FILE = '/tmp/natl_cursor.txt';
const log = m => { const s=`[${new Date().toISOString().slice(11,19)}] ${m}`; console.log(s); appendFileSync('/tmp/natl_progress.log', s+'\n'); };

const run = (cmd, args, stdin) => new Promise(res => {
  const c = spawn(cmd, args, { cwd: process.cwd() });
  let err='';
  c.stderr.on('data', d=>{ err+=d; });
  c.stdout.on('data', ()=>{});
  if (stdin!=null){ c.stdin.write(stdin); c.stdin.end(); }
  c.on('close', code => res({ code, err }));
});

async function nextChunk(cursor) {
  for (let a=0;a<5;a++){
    const r = await sb.from('listings').select('id,name,google_place_id')
      .is('is_self_service',null).not('google_place_id','is',null)
      .gt('id', cursor).order('id').limit(CHUNK);
    if (!r.error) return r.data || [];
    await new Promise(x=>setTimeout(x,1500));
  }
  return [];
}

function mergeInto(main, sliceFile) {
  if (!existsSync(sliceFile)) return;
  try { const s = JSON.parse(readFileSync(sliceFile,'utf8')); for (const k of Object.keys(s)) main[k]=s[k]; } catch {}
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';   // sorts before any real uuid
let cursor = existsSync(CURSOR_FILE) ? readFileSync(CURSOR_FILE,'utf8').trim() : ZERO_UUID;
let processed = 0, totalYes=0, totalNo=0, totalMaybe=0;
log(`nationwide sweep START (cursor=${cursor||'begin'}, max=${MAX===Infinity?'all':MAX}, ${K} parallel)`);

while (processed < MAX) {
  const chunk = await nextChunk(cursor);
  if (!chunk.length) { log('ALL DONE — no more unclassified listings'); break; }
  // 1) split + parallel harvest — but SKIP listings whose gallery we already have (resumable/cheap)
  const have = existsSync('scripts/_gallery_urls.json') ? JSON.parse(readFileSync('scripts/_gallery_urls.json','utf8')) : {};
  const toHarvest = chunk.filter(l => !(have[l.id] && (have[l.id].urls||[]).length));
  const slices = Array.from({length:K},()=>[]);
  toHarvest.forEach((l,i)=>slices[i%K].push([l.id, l.google_place_id, l.name]));
  const sliceFiles = slices.map((_,k)=>`scripts/_gallery_slice_${k}.json`);
  // clear old slice files so a crashed prior slice doesn't linger
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
  const tr = await run('node',['scripts/triage-selfserve.mjs','--ids',ids,'--apply']);
  // parse the triage summary line from its stderr/stdout tail (it prints to stdout; capture via log file instead)
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
}
log(`sweep STOPPED | processed=${processed} selfserve=${totalYes} no=${totalNo} maybe=${totalMaybe}`);
