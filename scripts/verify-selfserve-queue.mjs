/**
 * Vision-verify the UNVERIFIED part of the self-serve review queue.
 *
 * The queue was fed by several sources; only triage_selfserve / chain_selfserve were ever checked
 * by vision. The rest (osm_self_service, google_category, name, autopilot_*) are raw tags, and a
 * 30-listing audit found only ~13% of the OSM bucket to be real self-serve. scripts/clean-selfserve-queue.mjs
 * already removed the ones rejectable by NAME for free; this pass photo-checks what's left.
 *
 * Per chunk: harvest galleries with the free browser scraper → run classifier v2 --apply, which
 *   - demotes the non-self-serve (is_self_service=false)  → they leave the queue
 *   - confirms the real ones as 'triage_selfserve' + picks a bay hero → they land in the
 *     "🆕 AI Self-Serve" tab with a usable photo instead of sitting unverified.
 *
 * SAFETY: only rows with self_service_reviewed_at IS NULL are eligible, so nothing here is public
 * (lib/self-serve.ts requires reviewed_at for visibility). Never touches is_approved/is_touchless,
 * and curated heroes are protected by the classifier's CURATED guard.
 *
 * Uses its OWN gallery + cursor files so it can run alongside natl_sweep.mjs without racing it.
 *
 *   node scripts/verify-selfserve-queue.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { spawn } from 'child_process';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const CHUNK = 40, K = 2;                       // smaller than natl_sweep: it's sharing the machine
const GALLERY_FILE = 'scripts/_queue_gallery.json';
const LOG = '/tmp/ss_queue_verify.log';
const UNVERIFIED = ['osm_self_service','google_category','name','autopilot_ok','autopilot_exception'];
const log = m => { const s=`[${new Date().toISOString().slice(11,19)}] ${m}`; console.log(s); appendFileSync(LOG, s+'\n'); };

const run = (cmd, args, stdin) => new Promise(res => {
  const c = spawn(cmd, args, { cwd: process.cwd() });
  let out='';
  c.stdout.on('data', d=>{ out+=d; });
  c.stderr.on('data', ()=>{});
  if (stdin!=null){ c.stdin.write(stdin); c.stdin.end(); }
  c.on('close', code => res({ code, out }));
});

async function nextChunk() {
  // Always re-query from the top: rows just handled drop out (is_self_service=false, or
  // self_service_source becomes triage_selfserve), so the queue drains without a cursor.
  for (let a=0;a<5;a++){
    const r = await sb.from('listings').select('id,name,google_place_id')
      .eq('is_self_service',true).is('self_service_reviewed_at',null)
      .in('self_service_source',UNVERIFIED)
      .not('google_place_id','is',null)
      .order('id').limit(CHUNK);
    if (!r.error) return r.data || [];
    await new Promise(x=>setTimeout(x,1500));
  }
  return [];
}

let processed=0, removed=0, kept=0;
log(`queue verification START (chunk=${CHUNK}, ${K} harvesters)`);

while (true) {
  const chunk = await nextChunk();
  if (!chunk.length) { log('DONE — no unverified queue listings left with a place_id'); break; }

  // 1) harvest galleries — free browser scrape, split across K workers
  const slices = Array.from({length:K},()=>[]);
  chunk.forEach((l,i)=>slices[i%K].push([l.id, l.google_place_id, l.name]));
  const sliceFiles = slices.map((_,k)=>`scripts/_queue_slice_${k}.json`);
  sliceFiles.forEach(f=>{ try{ writeFileSync(f,'{}'); }catch{} });
  await Promise.all(slices.map((sl,k)=> sl.length
    ? run('python3',['scripts/maps_gallery.py','--stdin','--out',sliceFiles[k]], JSON.stringify(sl))
    : Promise.resolve({code:0})));

  // 2) merge slices into THIS job's gallery file (never the sweep's)
  const main = existsSync(GALLERY_FILE) ? JSON.parse(readFileSync(GALLERY_FILE,'utf8')) : {};
  for (const f of sliceFiles) { if(!existsSync(f)) continue; try{ const s=JSON.parse(readFileSync(f,'utf8')); for(const k of Object.keys(s)) main[k]=s[k]; }catch{} }
  writeFileSync(GALLERY_FILE, JSON.stringify(main));

  // 3) classify + apply
  const ids = chunk.map(l=>l.id).join(',');
  const tr = await run('node',['scripts/classify-selfserve.mjs','--gallery',GALLERY_FILE,'--ids',ids,'--apply']);
  const m = tr.out.match(/self_serve: (\d+).*?touchless: (\d+).*?no: (\d+)/s);
  const y = m?parseInt(m[1],10):0, n = m?(parseInt(m[2],10)+parseInt(m[3],10)):0;

  // 4) verify the chunk actually drained — a row still tagged unverified would loop forever
  const { data: stuck } = await sb.from('listings').select('id')
    .in('id', chunk.map(l=>l.id)).eq('is_self_service',true)
    .is('self_service_reviewed_at',null).in('self_service_source',UNVERIFIED);
  if (stuck && stuck.length) {
    // no_photos / harvest miss: mark so the queue still drains, distinctly tagged for a re-look.
    await sb.from('listings').update({ self_service_source:'queue_unverifiable_no_photos' }).in('id', stuck.map(s=>s.id));
    log(`  ${stuck.length} had no usable photos — tagged queue_unverifiable_no_photos`);
  }

  processed += chunk.length; kept += y; removed += n;
  log(`chunk ${chunk.length} | +${y} confirmed self-serve, ${n} removed | cumulative: ${processed} checked, ${kept} kept, ${removed} removed | exit ${tr.code}`);
}
log(`queue verification STOPPED | checked=${processed} kept=${kept} removed=${removed}`);
