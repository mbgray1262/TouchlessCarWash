/**
 * PHOTO AUTOPILOT — get Michael out of the photo business for good.
 *
 * WHY THIS EXISTS: the old pipeline's hero rule was "always take the best-available, don't
 * demand perfection" — which has NO FLOOR, so when every candidate was bad the least-bad one
 * shipped as the hero. Michael then had to be the quality gate on every listing ("I WANT TO
 * BE OUT OF THE PHOTO BUSINESS! PERIOD!"). He also can't judge staleness: Google photos carry
 * no date in our tool, span 15 years and multiple owners, so a 2020 "Weiss Guys" photo on a
 * 2025 "SuperShine" listing looks broken but isn't.
 *
 * THE UNLOCK — Street View is BOTH the truth anchor AND the quality floor:
 *   • ANCHOR: it's dated + official, so its signage tells us the CURRENT business name
 *     (accuracy check) and what the building looks like NOW (staleness check for photos).
 *   • FLOOR: every listing has one and it's always clean + correctly framed, so a candidate
 *     must BEAT Street View to become the hero. Worst case is a clean current exterior —
 *     never a blurry mess. This is what kills "poor photos got through".
 *
 * PIPELINE per listing:
 *   1. Gather: authoritative Places photos (place-scoped, can't be a neighbour's) + optimally
 *      FRAMED Street View + existing curated photos (never discarded).
 *   2. Deterministic pre-filter (FREE, no AI): resolution floor, blur, aspect, near-dupes.
 *      Never ask AI to judge what arithmetic can decide.
 *   3. One art-director vision pass, with the dated Street View as reference so it can reject
 *      stale/foreign photos, verify WASH TYPE from the equipment, and read the signage.
 *   4. Quality floor + montage fallback. 5. Apply + auto-resolve. Exceptions are mine, not his.
 *
 * STREET VIEW FRAMING (Michael: "you need to move and zoom the camera to the best possible
 * position… this takes a lot of work by me"): pano discovery via the metadata endpoint is FREE,
 * so we sample panos around the site, compute distance→heading→FOV (zoom) for each, render a
 * few, and let the art-director pick the best-framed one. That's his manual work, automated.
 *
 * Usage:
 *   node scripts/photo-autopilot.mjs --state WA            # one state
 *   node scripts/photo-autopilot.mjs --needs-review        # the flagged bucket
 *   node scripts/photo-autopilot.mjs --state WA --limit 6  # sample
 *   add --apply to write. Budget is tracked across runs and HARD-STOPS at $200.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const SB_URL=env.NEXT_PUBLIC_SUPABASE_URL; const sb=createClient(SB_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const AKEY=env.ANTHROPIC_API_KEY; const GKEY=env.GOOGLE_PLACES_API_KEY;
const MODEL='claude-sonnet-5';

const arg=(k,d)=>{ const i=process.argv.indexOf(k); return i>0?process.argv[i+1]:d; };
const STATE=arg('--state',null)?.toUpperCase();
const NEEDS_REVIEW=process.argv.includes('--needs-review');
const LIMIT=parseInt(arg('--limit','0'),10)||0;
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ── Budget: hard $200 ceiling across ALL runs (Michael: "$200 max… no more than that") ────
const LEDGER='scripts/_autopilot_spend.json';
const CAP=200;
let spend = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER,'utf8')).usd||0) : 0;
const PRICE={ placesDetails:0.017, placePhoto:0.007, svImage:0.007 }; // svMetadata is FREE
const charge=(k,n=1)=>{ spend += PRICE[k]*n; };
// Vision is billed from the response's ACTUAL token counts, never a flat guess. The model
// emits thinking blocks on this prompt and thinking bills as OUTPUT — a per-call estimate
// would silently drift. Sonnet 5 intro rates ($2/$10 per MTok) run through 2026-08-31.
const TOK={ in:2/1e6, out:10/1e6 };
let visionCalls=0, tokIn=0, tokOut=0;
const chargeVision=u=>{ const i=(u?.input_tokens||0)+(u?.cache_read_input_tokens||0)+(u?.cache_creation_input_tokens||0), o=u?.output_tokens||0;
  visionCalls++; tokIn+=i; tokOut+=o; spend += i*TOK.in + o*TOK.out; };
const saveSpend=()=>writeFileSync(LEDGER,JSON.stringify({usd:Number(spend.toFixed(4)),updated:new Date().toISOString()},null,2));

// ── helpers ───────────────────────────────────────────────────────────────────────────────
const dl=async u=>{ for(let a=0;a<3;a++){ try{const r=await fetch(u,{signal:AbortSignal.timeout(20000)}); if(r.ok) return Buffer.from(await r.arrayBuffer()); }catch{} await sleep(600*(a+1)); } return null; };
const b64=async(buf,px=512)=>{ try{ return (await sharp(buf).resize(px,px,{fit:'inside',withoutEnlargement:true}).jpeg({quality:72}).toBuffer()).toString('base64'); }catch{ return null; } };
const toRad=d=>d*Math.PI/180, toDeg=r=>r*180/Math.PI;
const bearing=(f,t)=>{ const y=Math.sin(toRad(t.lng-f.lng))*Math.cos(toRad(t.lat)); const x=Math.cos(toRad(f.lat))*Math.sin(toRad(t.lat))-Math.sin(toRad(f.lat))*Math.cos(toRad(t.lat))*Math.cos(toRad(t.lng-f.lng)); return (toDeg(Math.atan2(y,x))+360)%360; };
const distM=(a,b)=>{ const R=6371000, dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng); const s=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };
const destPoint=(lat,lng,brg,d)=>{ const R=6371000, br=toRad(brg), la=toRad(lat), lo=toRad(lng); const la2=Math.asin(Math.sin(la)*Math.cos(d/R)+Math.cos(la)*Math.sin(d/R)*Math.cos(br)); const lo2=lo+Math.atan2(Math.sin(br)*Math.sin(d/R)*Math.cos(la),Math.cos(d/R)-Math.sin(la)*Math.sin(la2)); return {lat:toDeg(la2),lng:toDeg(lo2)}; };

// Deterministic quality gate — arithmetic, not AI. Kills low-res/blurry/odd-aspect before
// the model ever sees them (this is the bulk of what Michael was rejecting by hand).
const MIN_EDGE=800, MIN_BLUR=60;
async function quality(buf){
  try{
    const m=await sharp(buf).metadata();
    const long=Math.max(m.width||0,m.height||0), short=Math.min(m.width||0,m.height||0);
    if(long<MIN_EDGE) return {ok:false,why:`low-res ${m.width}x${m.height}`};
    const ar=long/Math.max(short,1); if(ar>2.6) return {ok:false,why:`odd aspect ${ar.toFixed(1)}:1`};
    // Laplacian-ish variance on a small grayscale copy → blur detector
    const w=160,h=160; const px=await sharp(buf).grayscale().resize(w,h,{fit:'fill'}).raw().toBuffer();
    let sum=0,sq=0,n=0;
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; const v=4*px[i]-px[i-1]-px[i+1]-px[i-w]-px[i+w]; sum+=v; sq+=v*v; n++; }
    const varr=sq/n-(sum/n)**2;
    if(varr<MIN_BLUR) return {ok:false,why:`blurry (var ${varr.toFixed(0)})`};
    return {ok:true, w:m.width, h:m.height, sharp:varr};
  }catch{ return {ok:false,why:'unreadable'}; }
}
async function phash(buf){ const W=9,H=8; const px=await sharp(buf).grayscale().resize(W,H,{fit:'fill'}).raw().toBuffer(); let h=0n,bit=0n; for(let r=0;r<H;r++)for(let c=0;c<W-1;c++){ const i=r*W+c; if(px[i]<px[i+1]) h|=(1n<<bit); bit++; } return h; }
const ham=(a,b)=>{ let x=a^b,d=0; while(x){ d+=Number(x&1n); x>>=1n; } return d; };

// ── Sources ───────────────────────────────────────────────────────────────────────────────
async function placesPhotos(pid){
  for(let a=0;a<3;a++){
    try{ const r=await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${pid}&offset=0&limit=10&size=1600`,{headers:{Authorization:`Bearer ${ANON}`},signal:AbortSignal.timeout(25000)});
      if(r.ok){ const j=await r.json(); const u=(j.photos||[]).map(p=>p.url).filter(Boolean); charge('placesDetails'); charge('placePhoto',u.length); return u; } }catch{}
    await sleep(1200*(a+1));
  }
  return [];
}
async function svMeta(lat,lng){ // FREE
  try{ const r=await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=70&key=${GKEY}`,{signal:AbortSignal.timeout(12000)});
    if(!r.ok) return null; const j=await r.json(); return j.status==='OK'&&j.pano_id?j:null; }catch{ return null; }
}
// Find the best VIEWPOINTS: sample panos around the site (free), then score by how well the
// building would frame from there. distance 15-55m is the sweet spot — closer can't fit the
// facility, farther goes soft/low-detail (Michael: "without it being too far away or too low
// resolution"). FOV is computed so a ~40m frontage fills most of the frame = the "zoom".
async function svViewpoints(lat,lng){
  const found=new Map();
  const probes=[{d:0,b:0}];
  for(const b of [0,90,180,270]) for(const d of [30,55]) probes.push({d,b});
  for(const p of probes){
    const pt=p.d?destPoint(lat,lng,p.b,p.d):{lat,lng};
    const m=await svMeta(pt.lat,pt.lng);
    if(m && !found.has(m.pano_id)) found.set(m.pano_id,m);
  }
  const cands=[];
  for(const m of found.values()){
    const d=distM(m.location,{lat,lng});
    if(d<8||d>75) continue;                       // too close to frame / too far to read
    const official=(m.copyright||'').toLowerCase().includes('google');
    const year=parseInt((m.date||'0').slice(0,4),10)||0;
    const heading=bearing(m.location,{lat,lng});
    const fov=Math.max(30,Math.min(100, toDeg(2*Math.atan((40/2)/Math.max(d,10)))));  // frame ~40m of frontage
    const ideal=Math.abs(d-32);                    // ~32m is the sweet spot
    const score=(official?100:0)+year*2-ideal*1.5;
    cands.push({pano:m.pano_id,date:m.date,d,heading,fov,score,official});
  }
  return cands.sort((a,b)=>b.score-a.score).slice(0,3);
}
async function svRender(v,px=640){
  const u=`https://maps.googleapis.com/maps/api/streetview?size=${px}x${Math.round(px*0.75)}&pano=${v.pano}&heading=${v.heading.toFixed(0)}&fov=${v.fov.toFixed(0)}&pitch=2&key=${GKEY}`;
  const b=await dl(u); if(b) charge('svImage'); return b && b.length>4000 ? b : null;
}
async function hostBuffer(buf,id,slot){
  const path=`${id}/ap-${slot}-${Date.now()}.jpg`;
  const jpg=await sharp(buf).jpeg({quality:88}).toBuffer();
  const {error}=await sb.storage.from('listing-photos').upload(path,jpg,{contentType:'image/jpeg',upsert:true});
  if(error) return null;
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
}

// ── The art director ──────────────────────────────────────────────────────────────────────
const RUBRIC = (l, mixedHint) => `You are the art director for a car-wash directory that must look BETTER than Google. You pick ONE hero + up to 5 gallery images. Best, not most.

LISTING: "${l.name}" — ${l.city}, ${l.state}. Currently tagged: ${mixedHint}.

The SV images are Google Street View of this exact address, with capture dates — they are the GROUND TRUTH for what this building looks like now and what the sign says. Google's other photos span 15+ years and past owners, so a photo whose branding contradicts recent Street View is STALE or belongs to a DIFFERENT business.

TASKS
1. wash_type — read the EQUIPMENT, not the name:
   • "self_serve" = open wand bays you operate yourself (wand, foam brush, coin/card box).
   • "touchless" = an automatic IN-BAY unit that sprays with NO brushes (gantry/arch that moves over the car, e.g. PDQ LaserWash / Oasis).
   • "both" = self-serve bays AND a touchless automatic bay on site.
   • CRITICAL: an in-bay or tunnel with BRUSHES/cloth strips is FRICTION, NOT touchless. Never call brushes touchless.
   • "unclear" if the equipment isn't visible.
2. signage_name — what the business sign actually reads (from the most RECENT SV). name_matches: does it match the listing name? (true / false / "unreadable"). Ignore service words on signs ("TOUCHLESS", "AUTOMATIC", "CAR WASH", "LASERWASH" = a machine model) — those are not business names.
3. Judge every candidate: this_place (does it match the SV building?), current (not obviously an older brand than SV), quality 1-5, category.
4. HERO — the single most visually appealing shot that sells this wash:
   • If both self-serve AND touchless: prefer ONE frame showing BOTH. If none exists, set hero_montage to two ids (a touchless-equipment shot + a self-serve bay shot) and we'll compose them side by side.
   • If self-serve only: the best of a facility exterior, an in-bay shot, or a clean car mid-wash — whichever is most visually pleasing.
   • Clean car mid-wash is GOOD. Soap/foam/gel on the car is GOOD. High-end cars (Tesla, Mercedes, BMW, Porsche, race cars) are BETTER than average/old cars. CLEAN bays beat dirty bays. Good light, straight-on framing, the facility legible.
   • A Street View image (SV*) is a legitimate hero — pick it if it beats the photos.
   • The hero MUST be better than the best SV image. If nothing beats SV, choose the SV id.
5. GALLERY — up to 5, genuinely different from each other and from the hero, all quality>=3.
6. SELF-SERVE BAY EVIDENCE — self_serve_bay_ids: EVERY candidate id in which self-service
   wand-bay equipment is actually VISIBLE: a spray wand on its holster/boom, a foam brush,
   a coin/card/timer box, or an open bay clearly built to be operated by the driver.
   • This is the PROOF a visitor needs. A handsome exterior with no visible bay proves nothing.
   • An automatic in-bay arch/gantry is NOT self-serve evidence. Vacuums are NOT. A closed
     shutter is NOT. A sign that merely says "SELF SERVE" is NOT — we need the equipment.
   • Empty list is a valid, honest answer. Do not stretch.

BAN outright (hero and gallery): cartoons, line art, logos/graphics, promo flyers/coupons/price boards, screenshots, maps, interiors of shops, vacuum-only or vending-only shots, brushes/friction equipment, blurry or dark shots, anything not clearly this wash.

Output the JSON object and NOTHING else — no analysis, no commentary, no per-image notes.
{"wash_type":"self_serve|touchless|both|unclear","wash_type_evidence":"<8 words>","signage_name":"<text or unreadable>","name_matches":true|false|"unreadable","hero":"<id>","hero_montage":["<id>","<id>"]|null,"gallery":["<id>",...],"self_serve_bay_ids":["<id>",...],"confidence":0.0-1.0}`;

async function ask(content){
  for(let a=0;a<5;a++){
    try{
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':AKEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
        body:JSON.stringify({model:MODEL,max_tokens:4000,messages:[{role:'user',content}]})}); // never send temperature (deprecated → 400)
      if(r.status===429||r.status===529||r.status>=500){ const ra=parseFloat(r.headers.get('retry-after')||'')||Math.min(2**a*2,30); if(process.env.AP_DEBUG)console.log('   [dbg] http',r.status); await sleep(ra*1000); continue; }
      if(!r.ok){ if(process.env.AP_DEBUG)console.log('   [dbg] http',r.status,(await r.text()).slice(0,300)); await sleep(1500); continue; }
      const j=await r.json(); chargeVision(j?.usage);
      if(j?.stop_reason==='max_tokens'){ if(process.env.AP_DEBUG)console.log('   [dbg] TRUNCATED at max_tokens'); return null; } // retrying would truncate identically
      // content[0] is NOT always the text: on a complex prompt the model emits a THINKING
      // block first, so the JSON lives in a later block. Concatenate every text block.
      const t=(j?.content||[]).filter(c=>c&&c.type==='text').map(c=>c.text||'').join('')||''; const s=t.indexOf('{'), e=t.lastIndexOf('}');
      if(s<0||e<0){ if(process.env.AP_DEBUG)console.log('   [dbg] no-json:',JSON.stringify(t).slice(0,200)); await sleep(1000); continue; }
      try{ return JSON.parse(t.slice(s,e+1)); }catch(err){ if(process.env.AP_DEBUG)console.log('   [dbg] parse-fail:',err.message,'|',t.slice(s,s+160)); await sleep(900); }
    }catch{ await sleep(1500*(a+1)); }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────
let q=sb.from('listings').select('id,name,city,state,address,latitude,longitude,google_place_id,hero_image,photos,is_touchless,is_self_service,self_service_source')
  .eq('is_self_service',true).not('google_place_id','is',null);
if(NEEDS_REVIEW) q=q.eq('self_service_source','autophoto_needs_human');
else q=q.is('self_service_reviewed_at',null);
// --unapproved-only: work exclusively on listings that CANNOT publish, whatever we write.
// The public gate is is_self_service && is_approved && self_service_reviewed_at — so on an
// already-approved listing, stamping reviewed_at puts it live immediately, at this script's
// 0.55 confidence bar. That is far below "highly confident". Use this for unattended runs:
// the photo + wash-type work still happens, and a human still decides what goes public.
if(process.argv.includes('--unapproved-only')) q=q.eq('is_approved',false);
if(STATE) q=q.eq('state',STATE);
// Page explicitly: Supabase silently caps an unpaginated SELECT at 1000 rows, and a
// swallowed `error` here previously read as "0 listings — nothing to do", which is how a
// whole all-states run exited in 2 seconds having done nothing. Never treat a query
// failure as an empty result: if the fetch fails, stop loudly.
let rows=[];
for(let page=0;;page++){
  // Retry: this select pulls the photos blob per row, and when the review harvester is
  // running the DB is busy enough to hit a statement timeout. A timeout is transient —
  // but it must never be mistaken for "no work to do" (that silently wasted a whole run).
  let data=null,error=null;
  for(let a=0;a<5;a++){
    ({data,error}=await q.order('id').range(page*500,page*500+499));
    if(!error) break;
    console.log(`   …query attempt ${a+1} failed (${error.message.slice(0,50)}) — retrying`);
    await sleep(4000*(a+1));
  }
  if(error){ console.error(`\n⛔ listings query FAILED after 5 attempts (page ${page}): ${error.message}\nAborting rather than reporting an empty queue.`); process.exit(1); }
  if(!data?.length) break;
  rows.push(...data);
  if(data.length<500) break;
}
if(LIMIT) rows=rows.slice(0,LIMIT);
console.log(`Photo Autopilot — ${rows?.length||0} listings | spend so far $${spend.toFixed(2)} / $${CAP} | ${APPLY?'APPLY':'DRY RUN'}\n`);

const backup=[]; let done=0, svHero=0, montage=0, promoted=0, exceptions=0, skipped=0, bayForced=0, noBayEvidence=0;
const CONCURRENCY=parseInt(process.env.AP_CONCURRENCY||'5',10);
const queue=[...(rows||[])]; let capped=false;
async function processOne(l){
  if(spend>=CAP){ if(!capped){ capped=true; console.log(`\n⛔ BUDGET CAP $${CAP} reached — stopping cleanly.`);} return; }
  const cands=[]; // {id, buf, kind}

  // 1) Street View viewpoints (free discovery, few paid renders)
  let views=[];
  if(l.latitude!=null&&l.longitude!=null){
    views=await svViewpoints(l.latitude,l.longitude);
    for(let i=0;i<views.length;i++){ const b=await svRender(views[i]); if(b) cands.push({id:`SV${i}`,buf:b,kind:'sv',view:views[i]}); }
  }
  // 2) Authoritative Places photos
  for(const [i,u] of (await placesPhotos(l.google_place_id)).slice(0,8).entries()){ const b=await dl(u); if(b) cands.push({id:`P${i}`,buf:b,kind:'place'}); }
  // 3) Existing curated photos — never discarded
  for(const [i,u] of (l.photos||[]).slice(0,2).entries()){ const b=await dl(u); if(b) cands.push({id:`E${i}`,buf:b,kind:'existing',url:u}); }

  // Deterministic gate + dedupe
  const kept=[]; const hashes=[];
  for(const c of cands){
    const qy=await quality(c.buf);
    if(!qy.ok && c.kind!=='sv'){ continue; }         // drop THIS photo, not the whole listing (SV is exempt — it's the quality floor)
    const h=await phash(c.buf).catch(()=>null);
    if(h!=null && hashes.some(x=>ham(x,h)<=5)) continue; // near-duplicate
    if(h!=null) hashes.push(h);
    kept.push(c);
  }
  if(!kept.length){ skipped++; console.log(`• ${l.name} (${l.city}) — no usable imagery at all; left alone`); return; }

  // Art-director pass
  const mixedHint = l.is_touchless===true ? 'touchless + self-serve (mixed)' : 'self-serve only';
  const content=[{type:'text',text:RUBRIC(l,mixedHint)}];
  for(const c of kept){
    const s=await b64(c.buf); if(!s) continue;
    content.push({type:'text',text:`${c.id}${c.kind==='sv'?` — STREET VIEW, captured ${c.view.date}, ${c.view.d.toFixed(0)}m away`:''}:`});
    content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:s}});
  }
  const v=await ask(content); await sleep(400);
  if(!v||!v.hero){ exceptions++; console.log(`• ${l.name} (${l.city}) — ⚠ art-director inconclusive → exception (mine to resolve)`); if(APPLY) await sb.from('listings').update({self_service_source:'autopilot_exception'}).eq('id',l.id); return; }

  const byId=Object.fromEntries(kept.map(c=>[c.id,c]));
  const heroC=byId[v.hero];
  if(!heroC){ exceptions++; console.log(`• ${l.name} (${l.city}) — ⚠ hero id not found → exception`); return; }

  // Build the hero buffer: montage (mixed, no single frame shows both) or a single shot.
  let heroBuf=heroC.buf, heroKind=heroC.kind;
  if(Array.isArray(v.hero_montage)&&v.hero_montage.length===2&&byId[v.hero_montage[0]]&&byId[v.hero_montage[1]]){
    try{
      const [A,B]=v.hero_montage.map(id=>byId[id].buf);
      const H=900, W=800;
      const [a,b]=await Promise.all([sharp(A).resize(W,H,{fit:'cover'}).toBuffer(), sharp(B).resize(W,H,{fit:'cover'}).toBuffer()]);
      heroBuf=await sharp({create:{width:W*2+8,height:H,channels:3,background:'#ffffff'}}).composite([{input:a,left:0,top:0},{input:b,left:W+8,top:0}]).jpeg({quality:90}).toBuffer();
      heroKind='montage'; montage++;
    }catch{}
  }
  // If SV won, re-render it big for the hero (only pay when it's actually used).
  if(heroKind==='sv'){ const big=await svRender(heroC.view,1600); if(big) heroBuf=big; svHero++; }

  // 16:9 crop for the hero
  try{
    const m=await sharp(heroBuf).metadata(); const AR=16/9;
    let w=m.width,h=m.height,x=0,y=0;
    if(w/h>AR){ const nw=Math.round(h*AR); x=Math.round((w-nw)/2); w=nw; } else { const nh=Math.round(w/AR); y=Math.round((h-nh)/2); h=nh; }
    heroBuf=await sharp(heroBuf).extract({left:x,top:y,width:w,height:h}).jpeg({quality:90}).toBuffer();
  }catch{}

  // Wash-type verification (Michael: many "self-serve only" listings clearly show touchless IBA)
  const upd={};
  const wantTouchless = (v.wash_type==='touchless'||v.wash_type==='both');
  if(wantTouchless && l.is_touchless!==true && (v.confidence??0)>=0.7){ upd.is_touchless=true; promoted++; }

  const galleryUrls=[];
  console.log(`• ${l.name} (${l.city}) — hero ${heroKind==='montage'?'MONTAGE':heroC.id}${heroKind==='sv'?` (Street View ${heroC.view.date})`:''} | type=${v.wash_type}${upd.is_touchless?' → PROMOTED to touchless':''} | sign="${v.signage_name}" match=${v.name_matches} | conf ${v.confidence}`);

  if(APPLY){
    backup.push({id:l.id,name:l.name,prev_hero:l.hero_image,prev_photos:l.photos,prev_is_touchless:l.is_touchless,prev_source:l.self_service_source});
    const hUrl=await hostBuffer(heroBuf,l.id,'hero');
    if(hUrl){ upd.hero_image=hUrl; upd.hero_image_source='autopilot'; }
    for(const gid of (v.gallery||[]).slice(0,5)){
      const g=byId[gid]; if(!g||gid===v.hero) continue;
      if(g.kind==='existing'&&g.url){ galleryUrls.push(g.url); continue; } // keep curated as-is — `continue` skips this PHOTO; `return` here abandoned the whole listing after paying for its vision call
      const u=await hostBuffer(g.buf,l.id,gid); if(u) galleryUrls.push(u);
    }
    if(galleryUrls.length) upd.photos=galleryUrls.slice(0,6);
    // The bay photo is the EVIDENCE, not decoration: a self-serve listing showing only a
    // handsome exterior proves nothing to a visitor. Record whether the published hero or
    // gallery actually contains a frame with visible wand-bay equipment — honestly, including
    // when it doesn't, so "claims self-serve with no proof" is a queryable defect.
    if(v.wash_type==='self_serve'||v.wash_type==='both'){
      const bayIds=(v.self_serve_bay_ids||[]).filter(id=>byId[id]);
      const published=new Set([v.hero,...(v.hero_montage||[]),...(v.gallery||[]).slice(0,5)]);
      upd.self_serve_bay_photo = bayIds.some(id=>published.has(id));
      if(!upd.self_serve_bay_photo && bayIds.length){
        // We HAVE bay evidence but didn't publish it — the art-director optimised for looks.
        // Force one bay frame into the gallery: proof beats prettiness on a self-serve page.
        const id=bayIds[0], g=byId[id];
        const u = g.kind==='existing'&&g.url ? g.url : await hostBuffer(g.buf,l.id,id);
        if(u){ upd.photos=[u,...(upd.photos||[]).filter(x=>x!==u)].slice(0,6); upd.self_serve_bay_photo=true; bayForced++; }
      }
      if(!upd.self_serve_bay_photo) noBayEvidence++;
    }
    // Name/signage mismatch = the accuracy problem → exception for ME, don't publish silently.
    if(v.name_matches===false){ upd.self_service_source='autopilot_name_mismatch'; exceptions++; }
    else if((v.confidence??0)<0.55){ upd.self_service_source='autopilot_exception'; exceptions++; }
    else upd.self_service_source='autopilot_ok';
    // Mark the listing done, or the queue never shrinks and a re-run pays for it all again.
    upd.self_service_reviewed_at=new Date().toISOString();
    const {error}=await sb.from('listings').update(upd).eq('id',l.id);
    if(error){ console.log(`• ${l.name} — ⚠ WRITE FAILED (not marked done, will retry next run): ${error.message}`); return; }
  }
  done++;
  if(done%10===0){ saveSpend(); console.log(`   …${done} done | spend $${spend.toFixed(2)}`); }
}
async function worker(){ while(queue.length && !capped){ const l=queue.shift(); if(!l) break; try{ await processOne(l); }catch(e){ console.log(`• ${l.name} — worker error: ${String(e).slice(0,70)}`); } } }
await Promise.all(Array.from({length:CONCURRENCY},worker));
saveSpend();
if(APPLY&&backup.length){ const f=`scripts/_backup_autopilot_${STATE||'review'}_${Date.now()}.json`; writeFileSync(f,JSON.stringify(backup,null,2)); console.log(`\nBacked up ${backup.length} (reversible): ${f}`); }
console.log(`\n==================== AUTOPILOT ${STATE||(NEEDS_REVIEW?'NEEDS-REVIEW':'')} ${APPLY?'APPLIED':'DRY RUN'} ====================`);
console.log(`processed ${done} | Street-View heroes ${svHero} | montages ${montage} | promoted to touchless ${promoted} | exceptions (mine) ${exceptions} | no imagery ${skipped}`);
console.log(`self-serve BAY EVIDENCE: forced a bay shot into gallery ${bayForced} | still NO bay proof ${noBayEvidence}  ← claims self-serve, shows the user nothing`);
console.log(`SPEND: $${spend.toFixed(2)} / $${CAP}  (this run: ${visionCalls} vision calls, ${(tokIn/1000).toFixed(0)}k in + ${(tokOut/1000).toFixed(0)}k out = $${(tokIn*TOK.in+tokOut*TOK.out).toFixed(2)} of Anthropic)`);
