import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SERP=process.env.SERPAPI_KEY;
const DRY=process.argv.includes('--dry-run');
const TP=/\btouchless\b|\btouch[\s-]free\b|\btouchfree\b|\bno[\s-]?touch\b|\blaser\s*wash\b|\blaserwash\b|\bbrushless\b|\bbrush[\s-]?free\b/gi;
const NEG=/\b(?:not|isn[’']?t|wasn[’']?t|aren[’']?t|don[’']?t|doesn[’']?t)\s+(?:a\s+|really\s+)?(?:touchless|touch[\s-]?free|touchfree|brushless|laser)/i;
const SNEG=/\bbrushes?\s+(?:touched|came\s+down|scratched|hit|went\s+down)|\bhas\s+brushes|\bhad\s+brushes|\bclaims?\s+(?:to\s+be\s+)?touchless\s+but\b|\bsupposedly\s+touchless\b/i;
function classify(t){if(!t||t.length<10)return null;if(SNEG.test(t))return{evidence:false,kw:['negative:brushes']};const p=[...t.matchAll(TP)];if(!p.length)return null;for(const m of p){const s=Math.max(0,m.index-60),e=Math.min(t.length,m.index+m[0].length+60);if(NEG.test(t.slice(s,e)))return{evidence:false,kw:['negative-context']};}return{evidence:true,kw:[...new Set(p.map(m=>m[0].toLowerCase()))]};}
async function fetchReviews(pid){let u=`https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${encodeURIComponent(pid)}&num=20&query=touchless&api_key=${SERP}`;try{const j=await(await fetch(u)).json();return j.reviews||[];}catch(e){return [];}}
const ids=JSON.parse(fs.readFileSync('/tmp/noevi_ids.json','utf8'));
let restored=0,downgraded=0,errs=0;
for(const id of ids){
  const {data:l}=await sb.from('listings').select('id,name,city,state,google_place_id').eq('id',id).single();
  const revs=await fetchReviews(l.google_place_id);
  const rows=[];
  for(const r of revs){const text=r.snippet||r.extracted_snippet?.original;if(!text)continue;const c=classify(text);if(!c)continue;
    rows.push({listing_id:id,reviewer_name:r.user?.name||null,rating:typeof r.rating==='number'?r.rating:null,review_text:text,review_date:r.date||null,iso_date:r.iso_date||null,review_id:r.review_id||null,touchless_keywords:c.kw,is_touchless_evidence:c.evidence,source:'serpapi'});}
  const evi=rows.filter(r=>r.is_touchless_evidence);
  if(evi.length>0){
    if(!DRY){await sb.from('review_snippets').insert(rows);await sb.from('listings').update({touchless_review_count:evi.length,review_mine_status:'mined'}).eq('id',id);}
    restored++; console.log(`✅ RESTORED ${l.name}/${l.state}: +${rows.length} snippets (${evi.length} touchless-evidence)`);
  } else {
    if(!DRY) await sb.from('listings').update({touchless_verified:null,review_mine_status:'mined_no_evidence'}).eq('id',id);
    downgraded++; console.log(`⬇️  DOWNGRADED ${l.name}/${l.state}: no touchless evidence in ${revs.length} reviews → touchless_verified=null`);
  }
}
console.log(`\n=== ${DRY?'DRY ':''}done: restored=${restored} downgraded=${downgraded} of ${ids.length} ===`);
process.exit(0);
