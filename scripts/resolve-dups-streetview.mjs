/**
 * Resolve the same-site duplicate clusters that photo-signage alone couldn't settle, using
 * DATED Street View (Michael's idea: "can't we use the street view photo and its date to
 * determine the current business?" — it's better evidence than user photos, which carry no
 * usable date, so a 2019 shot of the old brand can mislead).
 *
 * Two refinements that matter:
 *  - `source=outdoor` is REQUIRED. The default metadata call returns the NEAREST pano, which
 *    at 10380 N 59th Ave was a 2017 user photosphere ("© Keith Pond") sitting on the
 *    business. source=outdoor returns Google's official car imagery — dated 2025-01, i.e.
 *    what you see in the Maps UI. Trust `copyright` containing "Google".
 *  - Aim the camera: heading = bearing FROM the pano TO the business coords, so the shot
 *    faces the building instead of the fixed heading=0 that pointed at a backyard.
 * The metadata endpoint (date + pano location) is FREE; only the image costs.
 *
 *   node scripts/resolve-dups-streetview.mjs          # dry run
 *   node scripts/resolve-dups-streetview.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const KEY=env.GOOGLE_PLACES_API_KEY; const AKEY=env.ANTHROPIC_API_KEY;
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const street = a => { let s=(a||'').split(',')[0]; return s.toLowerCase().replace(/[.,#]/g,' ').replace(/\b(ste|suite|unit|apt|bldg)\b.*/,'').replace(/\bnorth\b/g,'n').replace(/\bsouth\b/g,'s').replace(/\beast\b/g,'e').replace(/\bwest\b/g,'w').replace(/\bavenue\b/g,'ave').replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\bdrive\b/g,'dr').replace(/\bhighway\b/g,'hwy').replace(/\bboulevard\b/g,'blvd').replace(/\bparkway\b/g,'pkwy').replace(/\blane\b/g,'ln').replace(/\s+/g,' ').trim(); };

async function svMeta(lat,lng){
  for(let a=0;a<3;a++){
    try{ const r=await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${KEY}`,{signal:AbortSignal.timeout(15000)});
      if(r.ok){ const j=await r.json(); if(j.status==='OK') return j; return null; } }catch{}
    await sleep(1000*(a+1));
  }
  return null;
}
const bearing=(from,to)=>{ const R=d=>d*Math.PI/180, D=r=>r*180/Math.PI;
  const y=Math.sin(R(to.lng-from.lng))*Math.cos(R(to.lat));
  const x=Math.cos(R(from.lat))*Math.sin(R(to.lat))-Math.sin(R(from.lat))*Math.cos(R(to.lat))*Math.cos(R(to.lng-from.lng));
  return (D(Math.atan2(y,x))+360)%360; };
async function svImage(pano,heading){
  try{ const r=await fetch(`https://maps.googleapis.com/maps/api/streetview?size=640x480&pano=${pano}&heading=${heading.toFixed(0)}&fov=90&pitch=0&key=${KEY}`,{signal:AbortSignal.timeout(20000)});
    if(!r.ok) return null; const b=Buffer.from(await r.arrayBuffer()); if(b.length<3000) return null;
    return (await sharp(b).jpeg({quality:75}).toBuffer()).toString('base64');
  }catch{ return null; }
}
async function ask(content){
  for(let a=0;a<4;a++){
    try{ const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':AKEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-5',max_tokens:700,messages:[{role:'user',content}]})});
      if(r.status===429||r.status>=500){ await sleep(Math.min(2**a*2,20)*1000); continue; }
      if(!r.ok){ await sleep(1200); continue; }
      const j=await r.json(); const t=j?.content?.[0]?.text||''; const s=t.indexOf('{'),e=t.lastIndexOf('}');
      if(s<0||e<0){ await sleep(1000); continue; }
      try{ return JSON.parse(t.slice(s,e+1)); }catch{ await sleep(900); }
    }catch{ await sleep(1200*(a+1)); }
  }
  return null;
}

// The clusters photo-signage left unresolved = sites that STILL have 2+ approved listings.
let rows=[],page=0;
while(true){ const {data}=await sb.from('listings').select('id,name,address,city,state,latitude,longitude,review_count').eq('is_approved',true).order('id').range(page*1000,page*1000+999); if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break; page++; }
const by={}; for(const l of rows){ const s=street(l.address); if(!s||!/\d/.test(s)||s.length<6)continue; const k=`${l.state}|${(l.city||'').toLowerCase().trim()}|${s}`; (by[k]||=[]).push(l); }
const clusters=Object.entries(by).filter(([,v])=>v.length>1);
console.log(`${clusters.length} unresolved same-site clusters — judging by DATED official Street View.\n`);

const backup=[]; let resolved=0, stillUnclear=0, noSV=0;
for(const [key,L] of clusters){
  const [state,city,addr]=key.split('|');
  const anchor=L.find(l=>l.latitude!=null&&l.longitude!=null);
  if(!anchor){ noSV++; console.log(`• ${addr} (${city}, ${state}) — no coords; left alone`); continue; }
  const meta=await svMeta(anchor.latitude,anchor.longitude);
  if(!meta){ noSV++; console.log(`• ${addr} (${city}, ${state}) — no official Street View; left alone`); continue; }
  const official=(meta.copyright||'').toLowerCase().includes('google');
  const heading=bearing(meta.location,{lat:anchor.latitude,lng:anchor.longitude});
  const img=await svImage(meta.pano_id,heading);
  if(!img){ noSV++; console.log(`• ${addr} (${city}, ${state}) — Street View image unavailable; left alone`); continue; }

  const content=[{type:'text',text:
`This is Google Street View of ${addr}, ${city}, ${state}, captured ${meta.date}${official?' (official Google imagery)':' (user photosphere — treat as weaker evidence)'}. The camera is aimed at the business.

These directory listings all claim this SAME address:
${L.map((l,i)=>`  [${i}] "${l.name}"`).join('\n')}

Read the SIGNAGE on the building. Which listing names the business actually operating here as of ${meta.date}?
Rules: signage often shows the SERVICE ("TOUCHLESS", "AUTOMATIC", "LASERWASH" = a machine model) rather than the business — don't pick a listing just for those words. If two DIFFERENT businesses genuinely share the site (e.g. a fuel station and a separately-branded car wash), set keep=-1. If the sign is unreadable or matches none, keep=-1.

Return ONLY JSON: {"sign_reads":"<what the sign says>","keep":<index or -1>,"why":"<8 words>"}`},
    {type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}}];
  const v=await ask(content); await sleep(600);
  if(!v){ stillUnclear++; console.log(`• ${addr} (${city}, ${state}) — vision unavailable; left alone`); continue; }
  if(!Number.isInteger(v.keep) || v.keep<0 || !L[v.keep]){
    stillUnclear++;
    console.log(`• ${addr} (${city}, ${state}) [SV ${meta.date}] — sign: "${v.sign_reads||'?'}" → still unclear; LEFT ALONE (${L.map(l=>l.name).join(' | ')})`);
    continue;
  }
  const keep=L[v.keep]; const losers=L.filter(l=>l.id!==keep.id);
  console.log(`• ${addr} (${city}, ${state}) [SV ${meta.date}] — sign reads "${v.sign_reads}" → keep "${keep.name}"; closing: ${losers.map(l=>`${l.name} [${l.review_count||0} rev]`).join(', ')}`);
  resolved++;
  if(APPLY) for(const l of losers){ backup.push({id:l.id,name:l.name,was_approved:true,reason:`same-site dup of ${keep.name} — Street View ${meta.date} sign reads "${v.sign_reads}"`}); await sb.from('listings').update({is_approved:false}).eq('id',l.id); }
}
if(APPLY&&backup.length){ const f=`scripts/_backup_sv_dups_${Date.now()}.json`; writeFileSync(f,JSON.stringify(backup,null,2)); console.log(`\nBacked up ${backup.length} (reversible): ${f}`); }
console.log(`\n==================== STREET-VIEW DUP RESOLUTION ${APPLY?'APPLIED':'DRY RUN'} ====================`);
console.log(`clusters ${clusters.length} | resolved by dated signage ${resolved} | still unclear (left alone) ${stillUnclear} | no Street View ${noSV}`);
