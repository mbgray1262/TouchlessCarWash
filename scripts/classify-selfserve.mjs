/**
 * Self-serve classifier v2 — FULL-RESOLUTION photos + the "walls vs open parking" test.
 *
 * The lesson from the vacuum false positives (Racewash, BlueWave): thumbnails + fuzzy prompts
 * couldn't tell a self-serve BAY from a VACUUM lot. Proven fix (5/5 on the cases that failed):
 * score EACH photo at full res and ask the single crisp question —
 *   is the car INSIDE a walled wash stall, or in OPEN parking under hose arches?
 *
 * Per photo → {shows: self_serve_bay | touchless_arch | vacuum | friction_tunnel | other, side_walls}.
 * Listing verdict:
 *   self_serve  = >=1 photo is a walled self_serve_bay          → is_self_service = true
 *   touchless   = no bay, but >=1 brushless touchless_arch      → (belongs to touchless dir, not self-serve)
 *   no          = neither                                        → is_self_service = false
 * Reads harvested galleries from scripts/_gallery_urls.json (browser-harvested; no paid Google APIs).
 *
 *   node scripts/classify-selfserve.mjs --ids a,b,c          # dry run
 *   node scripts/classify-selfserve.mjs --ids a,b,c --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';
// Name filters live in ONE module shared with the queue-cleanup pass so they can't drift.
import { nameVerdict } from './selfserve-name-filters.mjs';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GEMINI_API_KEY;
const APPLY = process.argv.includes('--apply');
// --reject-only: for cleaning an existing review queue. ONLY demote confident non-self-serve
// (is_self_service=false). Never confirm, never set/overwrite a hero, never touch reviewed_at.
const REJECT_ONLY = process.argv.includes('--reject-only');
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
// --gallery lets a side job (e.g. a queue-cleanup pass) read its OWN harvested gallery file
// instead of the shared one the nationwide sweep is concurrently read-modify-writing.
const GALLERY = JSON.parse(readFileSync(arg('--gallery','scripts/_gallery_urls.json'),'utf8'));
const MAX_PHOTOS = 16;
const CURATED = new Set(['manual','upload','pasted','chain-brand','chain-brand-auto','text-verified-pick']);

const PROMPT = `One full-size photo from a car-wash listing. Classify EXACTLY what it shows. Only bays and facility shots are useful; close-ups of a car are useless.
 - "self_serve_bay" = a car (or empty stall) INSIDE a wash bay with concrete/painted SIDE WALLS on the left & right, a spray WAND on a swing-arm boom, wet floor. The customer drives INTO the stall and washes their own car. Must see the STALL/walls, not just a car.
 - "touchless_arch" = an automatic BRUSHLESS arch/gantry over the car inside a bay (no brushes, no customer wand).
 - "facility_exterior" = a WIDE shot of the car-wash BUILDING / row of bays / the property from outside — the place itself. Signage of the business counts.
 - "friction_tunnel" = spinning cloth/foam BRUSHES touching the car.
 - "vacuum" = a car in OPEN parking (painted lines, NO side walls) under a canopy/overhead hose arches. After-wash vacuum area.
 - "car_closeup" = a CUSTOMER'S CAR is the subject — a shiny car, a body panel, wheel, grille, headlight, a soapy car, a car being detailed/on a lift. USELESS: shows off a car, not the facility.
 - "interior" = inside of a car (seats, dashboard, console, floor mats). USELESS.
 - "other" = sign-only, people, food, unrelated, blurry.
Decisive cues: self_serve_bay/touchless_arch = car INSIDE a stall with SIDE WALLS. vacuum = OPEN parking, overhead hoses, no walls. If the SUBJECT is a car (not a building or a bay stall), it is car_closeup or interior — NOT a bay.
Return strict JSON: {"shows":"self_serve_bay|touchless_arch|facility_exterior|friction_tunnel|vacuum|car_closeup|interior|other","side_walls":true|false,"note":"<=8 words"}`;

const dl = async u => { for(let a=0;a<2;a++){try{const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(r.ok)return Buffer.from(await r.arrayBuffer());}catch{}await sleep(400);} return null; };
const b64 = async b => { try{return (await sharp(b).resize(1024,1024,{fit:'inside'}).jpeg({quality:85}).toBuffer()).toString('base64');}catch{return null;} };
let calls=0,inTok=0,outTok=0;
async function score(s){for(let a=0;a<4;a++){try{
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:PROMPT},{inline_data:{mime_type:'image/jpeg',data:s}}]}],generationConfig:{thinkingConfig:{thinkingBudget:0},temperature:0,responseMimeType:'application/json'}})});
  if(r.status===429||r.status>=500){await sleep(Math.min(2**a*3,20)*1000);continue;}
  const j=await r.json();calls++;inTok+=j.usageMetadata?.promptTokenCount||0;outTok+=j.usageMetadata?.candidatesTokenCount||0;
  const t=j?.candidates?.[0]?.content?.parts?.[0]?.text||'';const p=t.indexOf('{'),e=t.lastIndexOf('}');
  if(p<0){await sleep(500);continue;} try{return JSON.parse(t.slice(p,e+1));}catch{await sleep(500);}
}catch{await sleep(1000*(a+1));}} return null; }

// Perceptual difference-hash (dHash): 9x8 grayscale, compare adjacent pixels → 64-bit fingerprint.
// Two photos within HAMMING<=DEDUP_THRESH are the same shot (same building/angle, different file) —
// so the gallery never shows the reviewer the same photo twice. Computed from the =w1024 buffer we
// already downloaded for vision (no extra fetch).
const DEDUP_THRESH = 10;
async function dhash(buf){ try{ const px=await sharp(buf).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer(); let h=0n,b=0n; for(let r=0;r<8;r++)for(let c=0;c<8;c++){const i=r*9+c; if(px[i]<px[i+1])h|=(1n<<b); b++;} return h; }catch{ return null; } }
const ham=(a,b)=>{ if(a==null||b==null)return 99; let x=a^b,n=0; while(x){n+=Number(x&1n);x>>=1n;} return n; };

async function classify(l){
  const nv = nameVerdict(l.name);
  if (nv) return { verdict:nv.verdict, reason:nv.reason, bay:0,touch:0,fac:0,vac:0,fric:0,closeup:0,other:0, chain:true };
  const g=GALLERY[l.id];
  const urls=(g&&g.match)?(g.urls||[]).slice(0,MAX_PHOTOS):[];
  if(!urls.length) return {verdict:'no_photos'};
  let bay=0,touch=0,fac=0,vac=0,fric=0,closeup=0,other=0;
  const bayIdxs=[],touchIdxs=[],facIdxs=[];   // ONLY these are usable for hero/gallery
  const hashes=[];   // perceptual fingerprint per photo index → near-dup removal in the gallery
  // Score photos in PARALLEL batches (was one-at-a-time = ~80s/listing). Check early-stop
  // after each batch so a clear self-serve wash finishes fast.
  const BATCH=6;
  for(let start=0; start<urls.length; start+=BATCH){
    const slice=urls.slice(start,start+BATCH);
    const vs=await Promise.all(slice.map(async u=>{ const buf=await dl(u+'=w1024'); if(!buf)return null; const s=await b64(buf); if(!s)return null; const v=await score(s); if(v)v._h=await dhash(buf); return v; }));
    for(let k=0;k<vs.length;k++){ const v=vs[k]; if(!v)continue; const i=start+k; hashes[i]=v._h;
      if(v.shows==='self_serve_bay'&&v.side_walls){ bay++; bayIdxs.push(i); }
      else if(v.shows==='touchless_arch'){ touch++; touchIdxs.push(i); }
      else if(v.shows==='facility_exterior'){ fac++; facIdxs.push(i); }
      else if(v.shows==='vacuum')vac++; else if(v.shows==='friction_tunnel')fric++;
      else if(v.shows==='car_closeup'||v.shows==='interior')closeup++; else other++;
    }
    if(bay>=2 && fac>=1) break;   // enough proof + a facility shot for the hero
  }
  bayIdxs.sort((a,b)=>a-b); facIdxs.sort((a,b)=>a-b); touchIdxs.sort((a,b)=>a-b);
  // Hero/gallery come ONLY from usable photos (bay > touchless > facility) — NEVER a car
  // close-up, interior, vacuum or tunnel shot. Order so a real bay leads, facility backs it up.
  let usable=[...bayIdxs,...touchIdxs,...facIdxs];
  // Drop near-duplicate shots so the gallery never shows the same photo twice (keep the first of
  // each visually-distinct group; hero leads, so a dup of the hero further down is also removed).
  { const kept=[],keptH=[]; for(const i of usable){ const h=hashes[i]; if(h!=null&&keptH.some(kh=>ham(h,kh)<=DEDUP_THRESH))continue; kept.push(i); if(h!=null)keptH.push(h); } usable=kept; }
  // Cap the gallery to the most visually-distinct shots so a listing with several near-identical
  // exterior/street-view frames of the SAME building doesn't fill the gallery with clones. Keep the
  // hero (usable[0]) fixed, then farthest-point-pick up to 4 more, most-different from the hero and
  // from each other. (Same idea as scripts/dedup-gallery.mjs.)
  if(usable.length>5){
    const hero=usable[0], anchors=[hashes[hero]].filter(h=>h!=null), pool=usable.slice(1), picked=[];
    while(picked.length<4 && pool.length){
      let best=0,bestD=-1;
      for(let k=0;k<pool.length;k++){ const h=hashes[pool[k]]; const refs=[...anchors,...picked.map(i=>hashes[i]).filter(x=>x!=null)]; const d=h==null?999:(refs.length?Math.min(...refs.map(r=>ham(h,r))):999); if(d>bestD){bestD=d;best=k;} }
      picked.push(pool[best]); pool.splice(best,1);
    }
    usable=[hero,...picked];
  }
  const heroIdx=usable.length?usable[0]:-1;
  const heroUrl=heroIdx>=0?urls[heroIdx]:null;
  let verdict = bay>0 ? 'self_serve' : (touch>0 ? 'touchless' : 'no');
  let reviewRecovered=false;
  // Review-evidence recovery: if vision didn't confirm a bay but >=2 customer reviews are
  // flagged as self-serve evidence, trust the customers (the listing already passed the
  // express-chain filter above). Recovers real washes whose bay photos are poor/missing.
  if (verdict!=='self_serve') {
    const { count } = await sb.from('review_snippets').select('id',{count:'exact',head:true}).eq('listing_id',l.id).eq('is_self_serve_evidence',true);
    // Reviews vouch for it, but we have NO usable photo — keep the classification, leave the hero
    // empty (a car close-up is worse than no hero; a human picks one). Never fall back to junk.
    if ((count||0) >= 2) { verdict='self_serve'; reviewRecovered=true; }
  }
  return {verdict,bay,touch,fac,vac,fric,closeup,other,heroUrl,usable,urls,reviewRecovered};
}

const ids=(arg('--ids','')).split(',').map(s=>s.trim()).filter(Boolean);
let rows=null; for(let a=0;a<5&&!rows;a++){const r=await sb.from('listings').select('id,name,city,state,hero_image_source').in('id',ids);if(!r.error)rows=r.data;else await sleep(1200);}
console.log(`Classifier v2 — ${rows.length} listings | ${APPLY?'APPLY':'DRY RUN'}\n`);
const tally={self_serve:0,touchless:0,no:0,truck:0,no_photos:0};
const results={};
for(const l of rows){
  const r=await classify(l); tally[r.verdict]=(tally[r.verdict]||0)+1; results[l.id]=r.verdict;
  const icon={self_serve:'✅',touchless:'◆',no:'✗',truck:'🚛',no_photos:'·'}[r.verdict];
  console.log(`${icon} ${l.name} (${l.city}, ${l.state}) — ${r.verdict.toUpperCase()}${r.verdict!=='no_photos'?` [bay=${r.bay} touch=${r.touch} fac=${r.fac} vac=${r.vac} fric=${r.fric} closeup=${r.closeup}]`:''}`);
  if(APPLY&&r.verdict!=='no_photos'){
    // Truck washes → out of self-serve, tagged 'truck_wash' for a possible future truck category.
    if(r.verdict==='truck'){ await sb.from('listings').update({is_self_service:false,self_service_source:'truck_wash'}).eq('id',l.id); }
    else if(REJECT_ONLY){
      // Queue-cleanup: demote only confident non-self-serve; leave real ones + heroes + reviewed_at alone.
      if(r.verdict==='no'||r.verdict==='touchless') await sb.from('listings').update({is_self_service:false,self_service_source:'vision_cleanup_not_ss'}).eq('id',l.id);
    } else
    // Tags match the Photo Audit tool's tabs: triage_selfserve = 🆕 AI Self-Serve, etc.
    if(r.verdict==='self_serve'){
      const upd={is_self_service:true,self_service_source:'triage_selfserve'};
      // Hero + gallery come ONLY from usable photos (bay/touchless/facility) — never a car
      // close-up or interior. If none are usable (e.g. review-recovered), leave the hero for a human.
      if(!CURATED.has(l.hero_image_source)&&r.heroUrl){ upd.hero_image=r.heroUrl+'=w1200-h900'; upd.hero_image_source='ai_v2'; upd.photos=r.usable.slice(0,6).map(i=>r.urls[i]+'=w1200-h900'); }
      await sb.from('listings').update(upd).eq('id',l.id);
    } else {
      // 'no' and 'touchless' are both NOT self-serve for this pass (touchless belongs to the
      // touchless directory, not here). Only touches is_self_service — never is_touchless.
      await sb.from('listings').update({is_self_service:false,self_service_source:'triage_not_selfserve'}).eq('id',l.id);
    }
  }
}
const jsonOut=arg('--json','');
if(jsonOut) writeFileSync(jsonOut, JSON.stringify(results));
const cost=(inTok*0.30/1e6)+(outTok*2.50/1e6);
console.log(`\n=== CLASSIFY v2 ${APPLY?'APPLIED':'DRY RUN'} ===`);
console.log(`✅ self_serve: ${tally.self_serve}  ◆ touchless: ${tally.touchless}  ✗ no: ${tally.no}  · no_photos: ${tally.no_photos}`);
console.log(`Gemini calls: ${calls} | cost $${cost.toFixed(4)} ($${(cost/(rows.length||1)).toFixed(4)}/listing)`);
