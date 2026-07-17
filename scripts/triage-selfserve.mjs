/**
 * Nationwide self-serve TRIAGE — one contact-sheet vision call per listing.
 *
 * The funnel's cheap first pass over the ~30k unclassified washes. For each listing it:
 *   1. reads the browser-harvested gallery URLs (scripts/_gallery_urls.json — FREE, no Places/SV)
 *   2. tiles the thumbnails into ONE numbered contact sheet
 *   3. asks Gemini ONCE: is this a SELF-SERVE wand-bay wash? which tiles are bays? best hero tile?
 *
 * Output verdict → is_self_service:
 *   yes   → true  (self_service_source='triage_selfserve')     — real self-serve wand bay seen
 *   no    → false (self_service_source='triage_not_selfserve') — tunnel/express/detailer/store/none
 *   maybe → leave NULL, source='triage_maybe'                  — queue for the deep pass / human
 *
 * Cost: ~1 Gemini call/listing (~$0.0004). NO paid Google APIs. NEVER touches is_approved/is_touchless.
 *
 *   node scripts/triage-selfserve.mjs --ids id1,id2         # dry run, report only
 *   node scripts/triage-selfserve.mjs --ids id1,id2 --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GEMINI_API_KEY;
const APPLY = process.argv.includes('--apply');
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const GALLERY = JSON.parse(readFileSync('scripts/_gallery_urls.json','utf8'));

const COLS=5, CW=300, CH=220, LBL=22, PAD=6, PER_SHEET=20;
// Build ONE contact sheet for urls[start..start+PER_SHEET); tiles are numbered GLOBALLY (#start..).
async function contactSheet(urls, start) {
  const slice=urls.slice(start, start+PER_SHEET);
  const tiles=[];
  for (let i=0;i<slice.length;i++){
    const gi=start+i;
    try { const r=await fetch(slice[i]+'=w300-h220',{signal:AbortSignal.timeout(12000)}); const buf=Buffer.from(await r.arrayBuffer());
      const img=await sharp(buf).resize(CW,CH,{fit:'cover'}).toBuffer();
      const lbl=Buffer.from(`<svg width="${CW}" height="${LBL}"><rect width="100%" height="100%" fill="black"/><text x="4" y="16" fill="white" font-size="15" font-family="sans-serif">#${gi}</text></svg>`);
      tiles.push(await sharp({create:{width:CW,height:CH+LBL,channels:3,background:'#000'}}).composite([{input:img,top:LBL,left:0},{input:lbl,top:0,left:0}]).jpeg().toBuffer());
    } catch { tiles.push(await sharp({create:{width:CW,height:CH+LBL,channels:3,background:'#333'}}).jpeg().toBuffer()); }
  }
  if (!tiles.length) return null;
  const rows=Math.ceil(tiles.length/COLS), W=COLS*(CW+PAD)+PAD, H=rows*(CH+LBL+PAD)+PAD;
  const comp=tiles.map((t,i)=>({input:t,top:PAD+Math.floor(i/COLS)*(CH+LBL+PAD),left:PAD+(i%COLS)*(CW+PAD)}));
  return (await sharp({create:{width:W,height:H,channels:3,background:'#222'}}).composite(comp).jpeg({quality:80}).toBuffer()).toString('base64');
}

const PROMPT = (name, n) => `You are classifying "${name}" for a SELF-SERVE car wash directory. This is a numbered contact sheet of its ${n} Google photos (tiles #0..#${n-1}).

A SELF-SERVE wash = open/covered STALLS where the CUSTOMER THEMSELF holds a high-pressure spray WAND to wash their OWN car. The tell-tale signs are: a coin/token/credit PAYMENT BOX mounted in each bay, a ROW of identical open DIY stalls each with a boom-mounted wand, a function selector dial (SOAP/RINSE/WAX), or explicit "SELF SERVE / SELF SERVICE" signage.

CRITICAL — these are NOT self-serve (→ "no"), even though they have wands, bays, or wet soapy cars:
 - HAND CAR WASH / full-service / attendant washes — STAFF wash the customer's car. Signs: a "HAND CAR WASH" or "FULL SERVICE" banner, workers in the bay washing/drying/soaping cars, one long covered lane with people working on cars. A person holding a wand is NOT self-serve if they look like staff or the place is branded hand-wash/detail.
 - DETAILERS / detail centers / mobile detailing / tint & wrap shops.
 - automatic FRICTION tunnels (brushes/cloth on the car); touchless in-bay automatics with no customer wand.
 - car-wash EQUIPMENT vendors; gas stations/stores with no wash bay; vacuum-only lots.

=== CRITICAL: VACUUM stalls vs self-serve WASH BAYS (the #1 false positive) ===
Many express/tunnel washes have rows of cars parked under long fabric CANOPIES (often blue) at open, flat parking stalls, with hoses hanging from OVERHEAD ARCHES/BOOMS — those are VACUUM stalls (free vacuums), NOT wash bays. A tile is a VACUUM stall, NOT a self-serve bay, when: the car sits in an open flat PARKING space (painted lines, no side walls), the hoses come from a tall overhead arch/canopy, and there is no spray-wand gun / no side walls / no coin wash box. Rows of cars under a canopy being vacuumed ≠ self-serve. Do NOT count vacuum stalls as bays. If ALL a listing's "bay-looking" tiles are actually cars at vacuum canopies (no real 3-walled wash stall with a wand), the verdict is "no".
A real SELF-SERVE WASH BAY has SIDE WALLS (a 3-sided concrete/painted stall), a swing-arm BOOM with a metal spray WAND/lance, and a wet floor — the car is INSIDE a stall, not in open parking.

The disqualifier for self-serve is EVIDENCE OF STAFF doing the washing OR that the "bays" are really vacuum stalls — NOT the absence of a visible coin box (coin boxes are often too small to see in a thumbnail). An OPEN 3-walled wash STALL/BAY with spray hoses or a wand mounted on the WALLS and a wet floor IS a self-serve bay even if it is empty (no car, no person) — that is what a self-serve bay looks like between customers.

IMPORTANT bias: missing a real self-serve wash is worse than being unsure. Only say "no" when you are CONFIDENT it is not self-serve. If any tile shows an open wash bay/stall you cannot rule out, say "maybe", never "no".

Decide:
- "yes"  = at least one tile shows an OPEN DIY WASH STALL/BAY — open/covered, wand or hoses on the walls, wet floor — used by the customer, with NO staff washing cars and NOT branded hand-wash/detail. (Empty stalls count. A row of stalls, coin box, or "self serve" signage confirm it but aren't required.)
- "no"   = CONFIDENT it is not self-serve: a HAND WASH / full-service with staff washing cars or a "HAND CAR WASH"/"FULL SERVICE" banner; OR a pure detailer/tint shop with NO wash stall; OR a friction tunnel; OR a touchless-only automatic; OR a store/gas station/vacuum lot with NO wash stall at all.
- "maybe"= a wash bay/stall is or might be present but you cannot confirm it is customer self-serve (could be automatic or attendant), OR the gallery is mostly detailing/other with a possible bay. When in doubt between yes and no, choose maybe.

Return strict JSON: {"verdict":"yes|no|maybe","reason":"<=12 words","bay_tiles":[tiles showing a customer self-serve bay],"hero_tile":<best tile # for a hero, or -1>}`;

async function gemini(b64, name, n) {
  for (let a=0;a<4;a++){ try {
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:PROMPT(name,n)},{inline_data:{mime_type:'image/jpeg',data:b64}}]}],generationConfig:{thinkingConfig:{thinkingBudget:0},temperature:0,responseMimeType:'application/json'}})});
    if(r.status===429||r.status>=500){await sleep(Math.min(2**a*3,20)*1000);continue;}
    const j=await r.json(); const t=j?.candidates?.[0]?.content?.parts?.[0]?.text||''; const s=t.indexOf('{'),e=t.lastIndexOf('}');
    if(s<0){await sleep(500);continue;} try{return {v:JSON.parse(t.slice(s,e+1)),usage:j.usageMetadata};}catch{await sleep(500);}
  } catch{await sleep(1000*(a+1));} }
  return null;
}

const CURATED = new Set(['manual','upload','pasted','chain-brand','chain-brand-auto','text-verified-pick']);
const ids = (arg('--ids','')).split(',').map(s=>s.trim()).filter(Boolean);
const { data } = await sb.from('listings').select('id,name,city,state,hero_image,hero_image_source').in('id',ids);
console.log(`Triage — ${data.length} listings | ${APPLY?'APPLY':'DRY RUN'}\n`);
let inTok=0,outTok=0,calls=0; const tally={yes:0,no:0,maybe:0,no_photos:0};
for (const l of (data||[])) {
  const g=GALLERY[l.id]; const urls=(g&&g.match)?(g.urls||[]):[];
  if (!urls.length){ tally.no_photos++; console.log(`·  ${l.name} (${l.city}, ${l.state}) — no photos → leave NULL`); continue; }
  // Walk EVERY photo across as many contact sheets as needed. Early-stop the moment a sheet
  // confirms a self-serve wand bay (no need to keep looking once we've found one).
  const nSheets=Math.ceil(urls.length/PER_SHEET);
  let v=null, bayTiles=[], heroTile=-1, verdict='no', reason='no self-serve bay in any photo', sheetsUsed=0;
  for (let s=0;s<nSheets;s++){
    const sheet=await contactSheet(urls, s*PER_SHEET); if(!sheet) continue;
    const res=await gemini(sheet,l.name,urls.length); await sleep(120);
    if(!res) continue;
    calls++; sheetsUsed++; inTok+=res.usage?.promptTokenCount||0; outTok+=res.usage?.candidatesTokenCount||0;
    const rv=res.v;
    if (rv.verdict==='yes'){ verdict='yes'; reason=rv.reason; bayTiles=rv.bay_tiles||[]; heroTile=rv.hero_tile??-1; break; } // found a bay → done
    if (rv.verdict==='maybe' && verdict!=='yes'){ verdict='maybe'; reason=rv.reason; if((rv.hero_tile??-1)>=0)heroTile=rv.hero_tile; }
  }
  if (sheetsUsed===0){ tally.no_photos++; console.log(`?  ${l.name} — all sheets failed`); continue; }
  tally[verdict]=(tally[verdict]||0)+1;
  const icon={yes:'✅',no:'✗',maybe:'?'}[verdict]||'·';
  console.log(`${icon} ${l.name} (${l.city}, ${l.state}) — ${verdict.toUpperCase()} "${reason}" [${urls.length} photos, ${sheetsUsed} sheet(s)${verdict==='yes'?`, bays ${JSON.stringify(bayTiles)} hero #${heroTile}`:''}]`);
  v={verdict};
  if (APPLY) {
    if (v.verdict==='yes') {
      const upd = { is_self_service:true, self_service_source:'triage_selfserve' };
      // Save the AI-picked bay photo as the hero + a small gallery so it's reviewable in the tool.
      // NEVER overwrite a human-curated hero.
      if (!CURATED.has(l.hero_image_source)) {
        const heroUrl = (heroTile>=0 && urls[heroTile]) ? urls[heroTile] : (bayTiles?.[0]!=null && urls[bayTiles[0]]) ? urls[bayTiles[0]] : urls[0];
        const gi = [...new Set([...(bayTiles||[]), 0,1,2,3,4,5])].filter(i=>urls[i]!=null).slice(0,6);
        if (heroUrl) { upd.hero_image = heroUrl+'=w1200-h900'; upd.hero_image_source = 'ai_triage'; }
        upd.photos = gi.map(i=>urls[i]+'=w1200-h900');
      }
      await sb.from('listings').update(upd).eq('id',l.id);
    }
    else if (v.verdict==='no')  await sb.from('listings').update({is_self_service:false,self_service_source:'triage_not_selfserve'}).eq('id',l.id);
    else                         await sb.from('listings').update({self_service_source:'triage_maybe'}).eq('id',l.id);
  }
}
const cost=(inTok*0.30/1e6)+(outTok*2.50/1e6);
console.log(`\n==================== TRIAGE ${APPLY?'APPLIED':'DRY RUN'} ====================`);
console.log(`✅ yes: ${tally.yes||0}   ✗ no: ${tally.no||0}   ? maybe: ${tally.maybe||0}   · no-photos: ${tally.no_photos||0}`);
console.log(`Gemini calls: ${calls} | tokens ${inTok} in / ${outTok} out | cost $${cost.toFixed(4)} = $${(cost/(calls||1)).toFixed(5)}/listing`);
