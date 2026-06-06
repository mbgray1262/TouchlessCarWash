import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1) distribution of touchless_verified
console.log('=== touchless_verified distribution (approved listings) ===');
const vals=['user_review','review','website','chain',null];
for(const v of vals){
  let q=sb.from('listings').select('*',{count:'exact',head:true}).eq('is_approved',true);
  q = v===null? q.is('touchless_verified',null) : q.eq('touchless_verified',v);
  const {count}=await q; console.log(`  ${v===null?'(null)':v}: ${count}`);
}

// 2) build Set of listing_ids that HAVE >=1 touchless-evidence snippet
console.log('\nbuilding evidence set (paginating review_snippets)...');
const evi=new Set(); let from=0; const page=1000;
while(true){
  const {data,error}=await sb.from('review_snippets').select('listing_id').eq('is_touchless_evidence',true).range(from,from+page-1);
  if(error){console.error(error.message);break;}
  if(!data.length)break;
  for(const r of data) evi.add(r.listing_id);
  from+=page; if(data.length<page)break;
}
console.log(`listings with >=1 touchless-evidence snippet: ${evi.size}`);

// also any-snippet set
const anySnip=new Set(); from=0;
while(true){
  const {data,error}=await sb.from('review_snippets').select('listing_id').range(from,from+page-1);
  if(error){console.error(error.message);break;}
  if(!data.length)break;
  for(const r of data) anySnip.add(r.listing_id);
  from+=page; if(data.length<page)break;
}
console.log(`listings with >=1 snippet (any): ${anySnip.size}`);

// 3) approved + verified-by-review but NO evidence snippet
for(const v of ['user_review','review']){
  let all=[],last='00000000-0000-0000-0000-000000000000';
  while(true){const {data}=await sb.from('listings').select('id,name,city,state,touchless_review_count').eq('is_approved',true).eq('touchless_verified',v).gt('id',last).order('id').limit(1000);if(!data.length)break;all=all.concat(data);last=all[all.length-1].id;if(data.length<1000)break;}
  const noEvi=all.filter(l=>!evi.has(l.id));
  const noAny=all.filter(l=>!anySnip.has(l.id));
  console.log(`\n=== touchless_verified='${v}': ${all.length} approved ===`);
  console.log(`  WITHOUT touchless-evidence snippet: ${noEvi.length} (${(100*noEvi.length/all.length||0).toFixed(0)}%)`);
  console.log(`  WITHOUT any snippet at all:        ${noAny.length} (${(100*noAny.length/all.length||0).toFixed(0)}%)`);
  console.log('  sample no-evidence:', noEvi.slice(0,8).map(l=>`${l.name}/${l.state}`).join(' | '));
}
process.exit(0);
