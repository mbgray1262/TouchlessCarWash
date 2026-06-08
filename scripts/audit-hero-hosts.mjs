import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function q(b){for(let i=0;i<8;i++){const r=await b();if(!r.error)return r;await sleep(700);}throw new Error('fail');}
function cat(url){if(!url)return '(null)';try{const h=new URL(url).hostname.toLowerCase();if(h.includes('supabase.co'))return 'supabase (safe/rehosted)';if(h.includes('googleusercontent.com'))return 'google CDN (lh3 - semi-stable)';if(h.includes('maps.googleapis.com'))return 'google maps API (key-bearing! bad)';if(h.includes('streetview'))return 'streetview';return 'EXTERNAL hotlink: '+h;}catch{return 'malformed';}}
let all=[],last='00000000-0000-0000-0000-000000000000';
while(true){const data=(await q(()=>sb.from('listings').select('id,hero_image,is_approved').eq('is_approved',true).gt('id',last).order('id').limit(1000))).data;if(!data.length)break;all=all.concat(data);last=all[all.length-1].id;if(data.length<1000)break;}
console.log(`approved listings: ${all.length}`);
const buckets={};const extHosts={};
for(const l of all){const c=cat(l.hero_image);const key=c.startsWith('EXTERNAL')?'EXTERNAL hotlink (fragile)':c;buckets[key]=(buckets[key]||0)+1;if(c.startsWith('EXTERNAL')){const h=c.replace('EXTERNAL hotlink: ','');extHosts[h]=(extHosts[h]||0)+1;}}
console.log('\n=== hero_image host categories (approved) ===');
for(const [k,v] of Object.entries(buckets).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log('\n=== top external hotlink hosts (fragile) ===');
for(const [h,c] of Object.entries(extHosts).sort((a,b)=>b[1]-a[1]).slice(0,25)) console.log(`  ${String(c).padStart(5)}  ${h}`);
const ext=Object.entries(extHosts).reduce((a,[,c])=>a+c,0);
console.log(`\nTOTAL external-hotlink heroes (fragile): ${ext} across ${Object.keys(extHosts).length} hosts`);
process.exit(0);
