#!/usr/bin/env node
/**
 * Step 2 of the Review-Mined Score method: LABEL touchless-evidence review snippets.
 * Sets review_snippets.sentiment (positive|negative|neutral) + touchless_about
 * (touchless|other_service|unclear) via Haiku, for is_touchless_evidence=true rows
 * that aren't labeled yet (sentiment IS NULL). The scorer then counts pos/neg over
 * touchless+unclear snippets (excludes other_service). Resumable + batched.
 *
 * Permanent (NOT _tmp_ — the prior labeler was gitignored & deleted).
 * Run: node scripts/label-touchless-snippets.mjs [--source=gmaps-search-clean] [--limit=N]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const arg = (f,d)=>{const a=process.argv.find(x=>x.startsWith(f+'='));return a?a.split('=')[1]:d;};
const SOURCE = arg('--source','gmaps-search-clean');
const LIMIT = parseInt(arg('--limit','0'),10);
const LISTING = arg('--listing',null); // one-off: only label a single listing's unlabeled snippets
const BATCH = 10, POOL = 6;

const SYS = `You label customer car-wash reviews that mention touchless/brushless/touch-free/laser keywords. For EACH review output two labels:
- "sentiment": positive | negative | neutral — the reviewer's feeling about the TOUCHLESS automatic wash specifically (ignore gas/store/staff/price unless tied to the wash).
- "about": touchless | other_service | unclear — is the review describing the TOUCHLESS automatic wash (touchless); a DIFFERENT service at this location — soft-touch/brush tunnel, self-serve wand bay, hand wash, detailing, gas, or store (other_service); or ambiguous (unclear)?
Reply ONLY a compact JSON array, one object per review IN ORDER: [{"i":1,"sentiment":"positive","about":"touchless"},...]`;

async function label(batch) {
  const user = batch.map((s,i)=>`${i+1}. ${(s.review_text||'').slice(0,500).replace(/\s+/g,' ')}`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:900,system:SYS,messages:[{role:'user',content:user}]})});
  if(!res.ok) throw new Error(res.status+' '+(await res.text()).slice(0,120));
  const txt=(await res.json()).content?.[0]?.text??''; const m=txt.match(/\[[\s\S]*\]/);
  const arr = m?JSON.parse(m[0]):[];
  return batch.map((s,i)=>{const o=arr.find(x=>x.i===i+1)||arr[i]||{};
    const sent=['positive','negative','neutral'].includes(o.sentiment)?o.sentiment:'neutral';
    const about=['touchless','other_service','unclear'].includes(o.about)?o.about:'unclear';
    return {id:s.id, sentiment:sent, touchless_about:about};});
}

// fetch all unlabeled
let rows=[]; for(let off=0;;off+=1000){
  let q=db.from('review_snippets').select('id,review_text').eq('source',SOURCE).eq('is_touchless_evidence',true).is('sentiment',null);
  if(LISTING) q=q.eq('listing_id',LISTING);
  const{data}=await q.range(off,off+999);
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break;
}
if(LIMIT) rows=rows.slice(0,LIMIT);
console.log(`unlabeled touchless-evidence snippets: ${rows.length}`);
const batches=[]; for(let i=0;i<rows.length;i+=BATCH) batches.push(rows.slice(i,i+BATCH));

let done=0, labeled=0, errors=0;
async function worker(q){ for(;;){ const b=q.pop(); if(!b)return;
  try{ const out=await label(b);
    for(const u of out){ await db.from('review_snippets').update({sentiment:u.sentiment,touchless_about:u.touchless_about}).eq('id',u.id); labeled++; }
  }catch(e){ errors++; }
  if(++done%20===0) console.log(`  …${done}/${batches.length} batches | ${labeled} labeled | ${errors} errs`);
}}
const q=[...batches]; await Promise.all(Array.from({length:POOL},()=>worker(q)));
console.log(`DONE: labeled ${labeled} snippets (${errors} batch errors)`);
