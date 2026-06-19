#!/usr/bin/env node
/**
 * AI label pass for touchless review snippets (supersedes label-touchless-snippets.mjs).
 * One Haiku call per snippet sets ALL THREE fields, replacing the brittle
 * keyword+negation regex that set is_touchless_evidence at mine time:
 *   - is_touchless_evidence (yes/no)  — is this REAL touchless evidence
 *   - sentiment (positive/negative/neutral)
 *   - touchless_about (touchless/other_service/unclear)
 * The miner's regex is now just a cheap pre-filter (which snippets to send here).
 *
 * Haiku decides evidence = yes|no:
 *   yes  → the review indicates THIS location actually has / the customer used a
 *          touchless (touch-free / brushless / laser / no-touch automatic) wash
 *          (a NEGATIVE experience still counts — it confirms the wash exists).
 *   no   → counterfactual ("wish it was touchless"), comparison/distancing
 *          ("not one of those laser wash places"), negation ("not touch free"),
 *          or not about this wash.
 *
 * Modes:
 *   (default)  DRY RUN — sample snippets (incl. a target listing) + print verdicts, no writes.
 *   --apply    Backfill: re-judge ALL is_touchless_evidence=true snippets and flip
 *              the "no" ones to is_touchless_evidence=false. Resumable.
 *   --listing=<id>   restrict to one listing.  --limit=N   cap rows.  --sample=N  dry-run size.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const arg = (f,d)=>{const a=process.argv.find(x=>x.startsWith(f+'='));return a?a.split('=')[1]:d;};
const APPLY = process.argv.includes('--apply');
const LISTING = arg('--listing',null);
const LIMIT = parseInt(arg('--limit','0'),10);
const SAMPLE = parseInt(arg('--sample','30'),10);
const BATCH = 12, POOL = 6;

const SYS = `You evaluate customer car-wash reviews that mention touchless/touch-free/brushless/laser keywords. For EACH review return THREE labels:
- "evidence": yes|no — is this REAL evidence that THIS location offers a touchless car wash (touch-free / brushless / laser / no-touch AUTOMATIC wash)?
    yes = the review indicates this location actually HAS, or the customer USED, a touchless automatic wash here (a NEGATIVE experience still counts as yes — it confirms the wash exists). "laser wash"/"LaserWash" IS a touchless brand, so a plain positive/neutral mention = yes.
    no = the keyword is counterfactual/a wish ("wish it was touchless", "they should add touchless"); a comparison/distancing ("not one of those laser wash places", "unlike a touchless wash"); a negation it offers touchless ("not touchless", "isn't touch free"); about self-serve wand / hand wash / brush tunnel rather than a touchless automatic; or not about this wash.
- "sentiment": positive|negative|neutral — the reviewer's feeling about the TOUCHLESS automatic wash specifically (ignore gas/store/staff/price unless tied to the wash). Only meaningful when evidence=yes.
- "about": touchless|other_service|unclear — is the review about the touchless automatic wash (touchless); a DIFFERENT service here — soft-touch/brush tunnel, self-serve wand, hand wash, detailing, gas, store (other_service); or ambiguous (unclear)?
Reply ONLY a compact JSON array, one object per review IN ORDER: [{"i":1,"evidence":"yes","sentiment":"positive","about":"touchless"},...].`;

async function judge(batch){
  const user = batch.map((s,i)=>`${i+1}. ${(s.review_text||'').slice(0,500).replace(/\s+/g,' ')}`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:1000,system:SYS,messages:[{role:'user',content:user}]})});
  if(!res.ok) throw new Error(res.status+' '+(await res.text()).slice(0,120));
  const txt=(await res.json()).content?.[0]?.text??''; const m=txt.match(/\[[\s\S]*\]/);
  const arr = m?JSON.parse(m[0]):[];
  return batch.map((s,i)=>{const o=arr.find(x=>x.i===i+1)||arr[i]||{};
    const sentiment=['positive','negative','neutral'].includes(o.sentiment)?o.sentiment:'neutral';
    const about=['touchless','other_service','unclear'].includes(o.about)?o.about:'unclear';
    return {id:s.id, listing_id:s.listing_id, text:s.review_text, yes:(o.evidence==='yes'), sentiment, about};});
}

if(!APPLY){
  // DRY RUN: a representative sample + the known false-positive listing (Moo Moo)
  const { data: moo } = await db.from('listings').select('id').ilike('slug','moo-moo-express%pickerington%');
  const seed = [];
  if(moo?.[0]){ const { data } = await db.from('review_snippets').select('id,listing_id,review_text').eq('listing_id',moo[0].id).eq('is_touchless_evidence',true); seed.push(...(data||[])); }
  const { data: rnd } = await db.from('review_snippets').select('id,listing_id,review_text').eq('is_touchless_evidence',true).order('id').range(0, SAMPLE*4);
  // spread the sample across the id space
  const step = Math.max(1, Math.floor((rnd||[]).length / SAMPLE));
  const sample = [...seed, ...(rnd||[]).filter((_,i)=>i%step===0).slice(0,SAMPLE)];
  console.log(`DRY RUN — judging ${sample.length} snippets (no DB writes)\n`);
  const out=[];
  for(let i=0;i<sample.length;i+=BATCH){ out.push(...await judge(sample.slice(i,i+BATCH))); }
  for(const r of out){ console.log(`${r.yes?'✅ KEEP':'❌ DROP'} ${r.yes?`[${r.sentiment}/${r.about}]`:''}\n     "${(r.text||'').replace(/\s+/g,' ').slice(0,140)}"`); }
  const drop=out.filter(r=>!r.yes).length;
  console.log(`\n→ ${out.length-drop} kept as evidence, ${drop} would be flipped to NOT evidence.`);
  process.exit(0);
}

// APPLY: re-judge every touchless-evidence snippet, flip the "no" ones.
let rows=[]; for(let off=0;;off+=1000){
  let q=db.from('review_snippets').select('id,listing_id,review_text').eq('is_touchless_evidence',true);
  if(LISTING) q=q.eq('listing_id',LISTING);
  const{data}=await q.order('id').range(off,off+999);
  if(!data?.length)break; rows.push(...data); if(data.length<1000)break;
}
if(LIMIT) rows=rows.slice(0,LIMIT);
console.log(`Judging ${rows.length} touchless-evidence snippets…`);
const batches=[]; for(let i=0;i<rows.length;i+=BATCH) batches.push(rows.slice(i,i+BATCH));
let done=0, flipped=0, errs=0;
async function worker(qu){ for(;;){ const b=qu.pop(); if(!b)return;
  try{ const out=await judge(b);
    for(const r of out){
      if(!r.yes){ await db.from('review_snippets').update({is_touchless_evidence:false}).eq('id',r.id); flipped++; }
      else { await db.from('review_snippets').update({is_touchless_evidence:true,sentiment:r.sentiment,touchless_about:r.about}).eq('id',r.id); } // re-confirm sentiment+about on kept snippets
    }
  }catch(e){ errs++; }
  if(++done%25===0) console.log(`  …${done}/${batches.length} batches | ${flipped} flipped to NOT-evidence | ${errs} errs`);
}}
const qu=[...batches]; await Promise.all(Array.from({length:POOL},()=>worker(qu)));
console.log(`DONE: re-judged ${rows.length}; flipped ${flipped} to is_touchless_evidence=false (${errs} batch errors).`);
