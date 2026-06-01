#!/usr/bin/env node
/**
 * Stage 1 of thin-cluster verification: regenerate candidate car washes near
 * uncovered near-miss clusters (3-4 existing within 20mi) via SerpAPI Google
 * Maps, capturing WEBSITE + phone so stage 2 can crawl + classify touchless.
 * Read-only w.r.t. our DB. Output: scripts/discovery-output/thin-cluster-candidates.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const apiKey = env.SERPAPI_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const d=(a,b,c,e)=>{const R=3958.8,t=x=>x*Math.PI/180;const x=t(c-a),y=t(e-b);
  const h=Math.sin(x/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h));};

const mt=readFileSync('lib/metro-areas.ts','utf8');
const existing=[]; const rx=/slug:\s*'([^']+)',\s*lat:\s*([\-0-9.]+),\s*lng:\s*([\-0-9.]+),\s*radiusMiles:\s*(\d+)/g;
let m; while((m=rx.exec(mt))) existing.push({slug:m[1],lat:+m[2],lng:+m[3],r:+m[4]});

const listings=[];
for(let o=0;o<60000;o+=1000){const{data}=await sb.from('listings').select('latitude,longitude,city,state')
  .eq('is_touchless',true).eq('is_approved',true).not('latitude','is',null).not('longitude','is',null).range(o,o+999);
  if(!data||!data.length)break; listings.push(...data); if(data.length<1000)break;}
let unc=listings.filter(l=>!existing.some(e=>d(l.latitude,l.longitude,e.lat,e.lng)<=e.r));
const used=new Array(unc.length).fill(false); const targets=[];
while(true){let bi=-1,bm=null;
  for(let i=0;i<unc.length;i++){if(used[i])continue;const c=unc[i];const mem=[];
    for(let j=0;j<unc.length;j++){if(!used[j]&&d(c.latitude,c.longitude,unc[j].latitude,unc[j].longitude)<=20)mem.push(j);}
    if(!bm||mem.length>bm.length){bi=i;bm=mem;}}
  if(bi===-1||bm.length<3)break;
  const lat=bm.reduce((s,j)=>s+unc[j].latitude,0)/bm.length, lng=bm.reduce((s,j)=>s+unc[j].longitude,0)/bm.length;
  const cc={}; for(const j of bm){const k=`${(unc[j].city||'').trim()}, ${unc[j].state}`;cc[k]=(cc[k]||0)+1;}
  const top=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0][0];
  targets.push({label:top,lat,lng,have:bm.length});
  for(const j of bm)used[j]=true;}

const have=new Set();
for(let o=0;o<60000;o+=1000){const{data}=await sb.from('listings').select('google_place_id')
  .not('google_place_id','is',null).range(o,o+999);
  if(!data||!data.length)break; for(const r of data)if(r.google_place_id)have.add(r.google_place_id); if(data.length<1000)break;}

const QUERIES=['touchless car wash','automatic car wash'];
let credits=0; const byPid=new Map();
for(const tgt of targets){
  for(const q of QUERIES){
    credits++;
    const p=new URLSearchParams({engine:'google_maps',q,ll:`@${tgt.lat},${tgt.lng},11z`,type:'search',api_key:apiKey});
    try{
      const r=await fetch(`https://serpapi.com/search.json?${p}`); if(!r.ok){console.error(`HTTP ${r.status} ${tgt.label}`);continue;}
      const j=await r.json();
      for(const x of (j.local_results||[])){
        if(!x.place_id||have.has(x.place_id))continue;
        const la=x.gps_coordinates?.latitude, lo=x.gps_coordinates?.longitude;
        if(la==null||lo==null||d(la,lo,tgt.lat,tgt.lng)>22)continue;
        if(!byPid.has(x.place_id)) byPid.set(x.place_id,{place_id:x.place_id,name:x.title||'',address:x.address||'',
          website:x.website||'',phone:x.phone||'',rating:x.rating??null,reviews:x.reviews??null,lat:la,lng:lo,
          types:(x.types||[]).join('|'),cluster:tgt.label,clusterHave:tgt.have});
      }
    }catch(e){console.error(`ERR ${tgt.label}:`,e.message);}
  }
  if(credits%40===0) console.log(`  ${credits} searches, ${byPid.size} candidates`);
}
const candidates=[...byPid.values()];
mkdirSync('scripts/discovery-output',{recursive:true});
writeFileSync('scripts/discovery-output/thin-cluster-candidates.json',
  JSON.stringify({generatedAt:new Date().toISOString(),credits,clusters:targets.length,candidates},null,2));
const withSite=candidates.filter(c=>c.website&&!/facebook|yelp|google|instagram/.test(c.website)).length;
const acct=await(await fetch(`https://serpapi.com/account?api_key=${apiKey}`)).json();
console.log(`\nClusters: ${targets.length} | candidates: ${candidates.length} | with crawlable website: ${withSite}`);
console.log(`SerpAPI used: ${credits} | left: ${acct.total_searches_left}`);
console.log(`Wrote scripts/discovery-output/thin-cluster-candidates.json`);
