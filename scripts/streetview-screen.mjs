/**
 * Street-View FACILITY screen for the self-serve queue.
 *
 * WHY: the photo classifier only sees the Google gallery — customer close-ups of a shiny car, one
 * bay interior, a sign. Michael's own review process is to open Street View and look at the WHOLE
 * facility, because that is where "a row of open-fronted wand stalls" (self-serve) becomes
 * distinguishable from "one long tunnel with an entrance and an exit" (express) or a fuel canopy.
 * This adds that missing facility-level view as a screening layer.
 *
 * Image source, in order:
 *   1. the listing's stored street_view_url (free — already harvested)
 *   2. Street View Static API from lat/lng, but ONLY after the FREE metadata probe says imagery
 *      exists at that spot (so we never pay for a "no imagery" grey tile)
 *
 * VALIDATED 2026-07-22 against 25 human-labelled listings — and the result is WHY this script
 * only ranks and never rejects: "self_serve_bays" was right 5/5, but "tunnel_express" wrongly
 * rejected 4 REAL self-serve washes (Tsunami Express, Rich's Wash Dat, Jerry's Express, Car Wash
 * Pro's). Those are mixed tunnel+self-serve sites where one static frame caught the tunnel end.
 * A human pans around in Street View; a single frame cannot. So: NEVER auto-reject on this.
 *
 * Writes listings.self_service_confidence: 2 = a row of bays is visible (review first),
 * 1 = plausible, 0 = doubtful / no imagery (review last). Visibility is never affected.
 *
 * Modes:
 *   --validate   score the listings Michael already ruled on and print a scorecard vs his labels
 *   --apply      write self_service_confidence for the AI Self-Serve tab
 *   (default)    dry run over the AI Self-Serve tab
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GEMINI_API_KEY, MKEY = env.GOOGLE_PLACES_API_KEY;
const APPLY = process.argv.includes('--apply');
const VALIDATE = process.argv.includes('--validate');
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const LIMIT = parseInt(arg('--limit','0'),10) || Infinity;
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

const PROMPT = `This is a STREET-LEVEL view of a car-wash property. Identify the FACILITY TYPE from its structure.

- "self_serve_bays" = SEVERAL open-fronted wash STALLS side by side in one low building (typically 2-8 openings in a row). Each stall is an open rectangular opening the driver pulls INTO — no conveyor, no roll-up door. Look for a spray WAND / hose boom hanging in a stall, coin/card kiosks, signage like "Self Serve", "Wash Bay". The defining cue is a ROW OF SEPARATE OPENINGS.
- "in_bay_automatic" = ONE or TWO bays where a machine arch moves over a parked car. Signage like "Touchless", "Laser Wash", "Automatic". A single opening, not a row.
- "tunnel_express" = ONE long building with a single ENTRANCE at one end and an EXIT at the other, a conveyor, pay lanes/kiosks approaching it, and often a big canopy of VACUUM arches in the parking lot.
- "gas_station" = fuel pumps under a canopy / convenience store dominates the site.
- "detail_shop" = garage with ROLL-UP doors, cars parked for service, no wash tunnel or wand stalls.
- "truck_wash" = oversized bays built for semis / big rigs.
- "unclear" = the wash facility is not actually visible, obstructed, wrong building, or too far away to judge.

Be strict: only answer "self_serve_bays" if you can SEE multiple separate stall openings (or a wand). If you can see only one bay opening, it is in_bay_automatic, not self_serve.
Return strict JSON: {"facility":"self_serve_bays|in_bay_automatic|tunnel_express|gas_station|detail_shop|truck_wash|unclear","bay_openings":<integer or 0>,"confidence":"high|medium|low","note":"<=10 words"}`;

let visionCalls=0, svFetches=0, inTok=0, outTok=0;

const dl = async u => { for(let a=0;a<2;a++){ try{ const r=await fetch(u,{signal:AbortSignal.timeout(15000)}); if(r.ok) return Buffer.from(await r.arrayBuffer()); }catch{} await sleep(400);} return null; };

/** Street View image for a listing: stored URL first (free), else Static API after a free probe. */
async function streetViewImage(l){
  if (l.street_view_url) { const b = await dl(l.street_view_url); if (b) return { buf:b, src:'stored' }; }
  if (l.latitude == null || l.longitude == null) return null;
  // FREE metadata probe — never pay for a location with no imagery.
  try{
    const m = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${l.latitude},${l.longitude}&key=${MKEY}`,{signal:AbortSignal.timeout(10000)});
    const j = await m.json();
    if (j.status !== 'OK') return null;
  }catch{ return null; }
  const b = await dl(`https://maps.googleapis.com/maps/api/streetview?size=640x400&fov=90&location=${l.latitude},${l.longitude}&key=${MKEY}`);
  if (b) { svFetches++; return { buf:b, src:'static_api' }; }
  return null;
}

async function score(buf){
  let s; try{ s=(await sharp(buf).resize(1024,1024,{fit:'inside'}).jpeg({quality:85}).toBuffer()).toString('base64'); }catch{ return null; }
  for(let a=0;a<4;a++){ try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:'image/jpeg',data:s}}]}],generationConfig:{thinkingConfig:{thinkingBudget:0},temperature:0,responseMimeType:'application/json'}})});
    if(r.status===429||r.status>=500){ await sleep(Math.min(2**a*3,20)*1000); continue; }
    const j=await r.json(); visionCalls++; inTok+=j.usageMetadata?.promptTokenCount||0; outTok+=j.usageMetadata?.candidatesTokenCount||0;
    const t=j?.candidates?.[0]?.content?.parts?.[0]?.text||''; const p=t.indexOf('{'), e=t.lastIndexOf('}');
    if(p<0){ await sleep(500); continue; }
    try{ return JSON.parse(t.slice(p,e+1)); }catch{ await sleep(500); }
  }catch{ await sleep(1000*(a+1)); } }
  return null;
}

// Confidence mapping — an ORDERING signal, never a reject. Validation showed 'self_serve_bays'
// is a trustworthy positive (5/5) while 'tunnel_express' is NOT a trustworthy negative (4 real
// mixed facilities misread), so a doubtful call only sinks a listing down the queue.
function confidenceOf(facility, openings) {
  if (facility === 'self_serve_bays') return (openings >= 2) ? 2 : 1;
  if (facility === 'detail_shop' || facility === 'gas_station' || facility === 'truck_wash') return 0;
  if (facility === 'tunnel_express') return 0;   // often a mixed site — sinks, never removed
  return 1;                                       // in_bay_automatic / unclear / no image
}
const RULE_OUT = new Set(['tunnel_express','gas_station','detail_shop','truck_wash']);

let listings;
if (VALIDATE) {
  const snap = JSON.parse(readFileSync('scripts/_ai_tab_snapshot.json','utf8'));
  const ids = snap.rows.map(r=>r.id);
  let cur=[];
  for(let i=0;i<ids.length;i+=200){
    const {data}=await sb.from('listings').select('id,name,city,state,latitude,longitude,street_view_url,is_self_service,self_service_reviewed_at').in('id',ids.slice(i,i+200));
    cur=cur.concat(data||[]);
  }
  listings = cur.filter(r=>r.self_service_reviewed_at);   // only the ones Michael ruled on
  console.log(`VALIDATE — ${listings.length} listings with a human label\n`);
} else {
  const { data } = await sb.from('listings')
    .select('id,name,city,state,latitude,longitude,street_view_url')
    .eq('is_self_service',true).is('self_service_reviewed_at',null)
    .in('self_service_source',['triage_selfserve','chain_selfserve'])
    .order('id').limit(LIMIT===Infinity?1000:LIMIT);
  listings = data||[];
  console.log(`${APPLY?'APPLY':'DRY RUN'} — ${listings.length} listings in the AI Self-Serve tab\n`);
}

const rows=[]; let noImage=0;
for (const l of listings) {
  const img = await streetViewImage(l);
  if (!img) { noImage++; rows.push({l, facility:'no_image'}); continue; }
  const v = await score(img.buf);
  if (!v) { noImage++; rows.push({l, facility:'no_image'}); continue; }
  rows.push({ l, facility:v.facility, openings:v.bay_openings, conf:v.confidence, note:v.note, src:img.src });
}

if (VALIDATE) {
  // Scorecard: does the street-view call agree with Michael's?
  let tp=0,fp=0,tn=0,fn=0,skipped=0;
  console.log('human | streetview        | listing');
  console.log('------+-------------------+--------------------------------------------');
  for (const r of rows) {
    const human = r.l.is_self_service;                 // Michael's call
    const ruledOut = RULE_OUT.has(r.facility);
    const mark = r.facility==='no_image' ? '?' : (ruledOut ? 'NO ' : 'yes');
    console.log(`${human?' YES ':' no  '} | ${String(r.facility).padEnd(17)} | ${r.l.name} (${r.l.city}, ${r.l.state})${r.note?` — ${r.note}`:''}`);
    if (r.facility==='no_image') { skipped++; continue; }
    if (human && !ruledOut) tp++; else if (!human && ruledOut) tn++;
    else if (human && ruledOut) fn++;                   // DANGER: would have killed a real one
    else fp++;                                          // still passes through to Michael
  }
  console.log(`\n=== SCORECARD ===`);
  console.log(`correctly ruled OUT (you rejected, SV rejected) : ${tn}`);
  console.log(`correctly kept      (you confirmed, SV kept)    : ${tp}`);
  console.log(`missed junk         (you rejected, SV kept)     : ${fp}   ← harmless, you still see it`);
  console.log(`WRONGLY KILLED      (you confirmed, SV rejected): ${fn}   ← must be 0`);
  console.log(`no street view image                            : ${skipped}`);
  const wouldRemove = tn+fn, kept = tp+fp;
  if (kept) console.log(`\nprecision if applied: ${(100*tp/kept).toFixed(0)}% (was ${(100*rows.filter(r=>r.l.is_self_service).length/rows.length).toFixed(0)}%)`);
  console.log(`queue reduction: ${wouldRemove}/${rows.length}`);
} else {
  const tally={}; rows.forEach(r=>tally[r.facility]=(tally[r.facility]||0)+1);
  console.log('=== FACILITY TYPES SEEN ===');
  Object.entries(tally).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`${String(v).padStart(5)}  ${k}`));
  const conf = rows.map(r=>({ r, c: confidenceOf(r.facility, r.openings||0) }));
  const c2 = conf.filter(x=>x.c===2), c0 = conf.filter(x=>x.c===0);
  console.log(`\n=== QUEUE ORDERING ===`);
  console.log(`${String(c2.length).padStart(5)}  confidence 2 — bays visible, review FIRST`);
  console.log(`${String(conf.filter(x=>x.c===1).length).padStart(5)}  confidence 1 — plausible`);
  console.log(`${String(c0.length).padStart(5)}  confidence 0 — doubtful, review last (NOT removed)`);
  console.log('\ntop of the queue will be:');
  c2.slice(0,15).forEach(x=>console.log(`  ${x.r.l.name} (${x.r.l.city}, ${x.r.l.state}) — ${x.r.note||''}`));
  if (APPLY) {
    let done=0;
    for (const x of conf) {
      const { error } = await sb.from('listings').update({ self_service_confidence: x.c }).eq('id', x.r.l.id);
      if (!error) done++;
    }
    console.log(`\nAPPLIED: confidence written for ${done} listings.`);
  } else {
    console.log('\n(dry run — re-run with --apply)');
  }
}
const cost=(inTok*0.30/1e6)+(outTok*2.50/1e6)+(svFetches*0.007);
console.log(`\nvision calls: ${visionCalls} | street-view fetches: ${svFetches} | cost $${cost.toFixed(3)}`);
