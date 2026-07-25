#!/usr/bin/env node
/**
 * AI sentiment + evidence label pass for SELF-SERVE review snippets — the self-serve twin of
 * scripts/ai-evaluate-touchless-evidence.mjs. The self-serve harvester stores snippets with a
 * keyword pre-filter (is_self_serve_evidence=true) but NO sentiment, so the listing page had
 * nothing to bucket. One Haiku call per batch sets, for each snippet:
 *   - "evidence" yes|no  — real evidence the customer used / this place HAS a self-serve
 *                          (coin-op / wand / DIY bay) wash. no → flips is_self_serve_evidence=false
 *                          (automatic/tunnel/detailing/vacuum-only/gas, counterfactual, negation).
 *   - "sentiment" positive|negative|neutral — feeling about the SELF-SERVE wash specifically.
 *
 * Resume = only snippets with sentiment IS NULL (the harvester never sets it, so NULL = unlabeled;
 * every processed row gets a non-null sentiment, so re-runs skip done ones).
 *
 * Gentle by design (the DB is on Micro — see project_supabase_micro_overload_incident): low POOL,
 * a small inter-batch sleep. Never touch is_touchless_evidence or listings.
 *
 *   node scripts/ai-evaluate-selfserve-sentiment.mjs            # DRY RUN, sample
 *   node scripts/ai-evaluate-selfserve-sentiment.mjs --apply    # label unlabeled self-serve snippets
 *   --limit=N   cap rows   --listing=<id>   one listing   --sample=N   dry-run size
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
const BATCH = 12, POOL = 3;   // POOL kept low on purpose — Micro DB, gentle writes
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

const SYS = `You evaluate customer car-wash reviews that mention self-serve keywords (wand, coin, wash bay, "do it yourself", foam brush). A SELF-SERVE car wash is one where the CUSTOMER drives into an open bay and washes their own car with a hand-held spray wand / foam brush, usually coin/card operated. For EACH review return THREE labels:
- "evidence": yes|no — is this REAL evidence that THIS location has, or the customer USED, a self-serve (coin/wand/DIY bay) wash?
    yes = the review indicates this location actually HAS or the customer USED self-serve wand bays here (a NEGATIVE experience still counts as yes — it confirms the bays exist).
    no = the mention is about an AUTOMATIC / touchless / tunnel wash, a DETAILING or hand-wash-by-staff service, the self-service VACUUMS or air pump only (every wash has those — not a wash bay), a counterfactual/wish, a comparison to another business, a negation, or not about this wash.
- "sentiment": positive|negative|neutral — the reviewer's feeling about the SELF-SERVE wash specifically (the bays, wands, water pressure, coin machines, cleanliness of the stalls). Ignore gas/store/staff/price unless tied to the self-serve wash. Only meaningful when evidence=yes.
- "about": self_serve|other_service|unclear — is the review about the self-serve wand bays (self_serve); a DIFFERENT service here — automatic/touchless/tunnel, detailing, vacuums, gas, store (other_service); or ambiguous (unclear)?
Reply ONLY a compact JSON array, one object per review IN ORDER: [{"i":1,"evidence":"yes","sentiment":"positive","about":"self_serve"},...].`;

async function judge(batch){
  const user = batch.map((s,i)=>`${i+1}. ${(s.review_text||'').slice(0,500).replace(/\s+/g,' ')}`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:1000,system:SYS,messages:[{role:'user',content:user}]})});
  if(!res.ok) throw new Error(res.status+' '+(await res.text()).slice(0,120));
  const txt=(await res.json()).content?.[0]?.text??''; const m=txt.match(/\[[\s\S]*\]/);
  const arr = m?JSON.parse(m[0]):[];
  return batch.map((s,i)=>{const o=arr.find(x=>x.i===i+1)||arr[i]||{};
    const sentiment=['positive','negative','neutral'].includes(o.sentiment)?o.sentiment:'neutral';
    const about=['self_serve','other_service','unclear'].includes(o.about)?o.about:'unclear';
    return {id:s.id, listing_id:s.listing_id, text:s.review_text, yes:(o.evidence==='yes'), sentiment, about};});
}

if(!APPLY){
  const { data: rnd } = await db.from('review_snippets').select('id,listing_id,review_text')
    .eq('source','gmaps-selfserve').is('sentiment',null).order('id').range(0, SAMPLE*4);
  const step = Math.max(1, Math.floor((rnd||[]).length / SAMPLE));
  const sample = (rnd||[]).filter((_,i)=>i%step===0).slice(0,SAMPLE);
  console.log(`DRY RUN — judging ${sample.length} self-serve snippets (no DB writes)\n`);
  const out=[]; for(let i=0;i<sample.length;i+=BATCH){ out.push(...await judge(sample.slice(i,i+BATCH))); }
  for(const r of out){ console.log(`${r.yes?'✅ KEEP':'❌ DROP'} ${r.yes?`[${r.sentiment}/${r.about}]`:''}\n     "${(r.text||'').replace(/\s+/g,' ').slice(0,140)}"`); }
  const drop=out.filter(r=>!r.yes).length; const pos=out.filter(r=>r.yes&&r.sentiment==='positive').length; const neg=out.filter(r=>r.yes&&r.sentiment==='negative').length;
  console.log(`\n→ ${out.length-drop} kept (${pos} positive, ${neg} negative), ${drop} would flip to NOT self-serve evidence.`);
  process.exit(0);
}

// APPLY: label every UNLABELED self-serve snippet (sentiment IS NULL).
let rows=[]; for(let off=0;;off+=1000){
  let q=db.from('review_snippets').select('id,listing_id,review_text').eq('source','gmaps-selfserve').is('sentiment',null);
  if(LISTING) q=q.eq('listing_id',LISTING);
  const{data}=await q.order('id').range(off,off+999);
  if(!data?.length)break; rows.push(...data); if(data.length<1000)break;
}
if(LIMIT) rows=rows.slice(0,LIMIT);
console.log(`Labeling ${rows.length} unlabeled self-serve snippets…`);
const batches=[]; for(let i=0;i<rows.length;i+=BATCH) batches.push(rows.slice(i,i+BATCH));
let done=0, flipped=0, pos=0, neg=0, errs=0;
async function worker(qu){ for(;;){ const b=qu.pop(); if(!b)return;
  try{ const out=await judge(b);
    for(const r of out){
      if(!r.yes){ await db.from('review_snippets').update({is_self_serve_evidence:false,sentiment:r.sentiment}).eq('id',r.id); flipped++; }
      else { await db.from('review_snippets').update({sentiment:r.sentiment}).eq('id',r.id); if(r.sentiment==='positive')pos++; else if(r.sentiment==='negative')neg++; }
    }
  }catch(e){ errs++; }
  await sleep(150);   // gentle pacing
  if(++done%20===0) console.log(`  …${done}/${batches.length} batches | +${pos} pos / ${neg} neg | ${flipped} flipped off | ${errs} errs`);
}}
const qu=[...batches]; await Promise.all(Array.from({length:POOL},()=>worker(qu)));
console.log(`DONE: labeled ${rows.length}; ${pos} positive, ${neg} negative, flipped ${flipped} to NOT self-serve (${errs} batch errors).`);
