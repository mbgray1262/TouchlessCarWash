import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DRY=!process.argv.includes('--commit');
async function q(b){for(let i=0;i<8;i++){const r=await b();if(!r.error)return r;await sleep(700);}throw new Error('query fail');}
function keyBearing(u){if(!u)return false;try{return new URL(u).hostname.toLowerCase().includes('maps.googleapis.com');}catch{return false;}}
// gather approved with key-bearing hero
let all=[],last='00000000-0000-0000-0000-000000000000';
while(true){const data=(await q(()=>sb.from('listings').select('id,name,hero_image,photos').eq('is_approved',true).gt('id',last).order('id').limit(1000))).data;if(!data.length)break;all=all.concat(data);last=all[all.length-1].id;if(data.length<1000)break;}
const targets=all.filter(l=>keyBearing(l.hero_image));
console.log(`${DRY?'[DRY] ':''}key-bearing hero targets: ${targets.length}`);
const ts=Date.now();
let ok=0,failed=0,nulled=0;
for(const l of targets){
  let buf=null;
  try{const r=await fetch(l.hero_image,{redirect:'follow'});if(r.ok){const ab=await r.arrayBuffer();if(ab.byteLength>1500)buf=Buffer.from(ab);}}catch{}
  if(!buf){ // image dead → null hero so fallback shows
    failed++; nulled++;
    if(!DRY) await q(()=>sb.from('listings').update({hero_image:null}).eq('id',l.id));
    console.log(`✗ DEAD -> nulled: ${l.name}`); continue;
  }
  if(DRY){ ok++; console.log(`would rehost: ${l.name} (${(buf.length/1024|0)}KB)`); continue; }
  const path=`${l.id}/google-${ts}.jpg`;
  const up=await sb.storage.from('listing-photos').upload(path,buf,{contentType:'image/jpeg',upsert:true});
  if(up.error){failed++;console.log(`upload err ${l.name}: ${up.error.message}`);continue;}
  const pub=sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
  const newPhotos=(l.photos||[]).map(p=>keyBearing(p)?pub:p);
  await q(()=>sb.from('listings').update({hero_image:pub,photos:newPhotos.length?newPhotos:[pub],google_photo_url:pub}).eq('id',l.id));
  ok++; if(ok%10===0)console.log(`  ...${ok} rehosted`);
}
console.log(`\n${DRY?'[DRY] ':''}done: rehosted=${ok} nulled(dead)=${nulled} failed=${failed-nulled}`);
process.exit(0);
