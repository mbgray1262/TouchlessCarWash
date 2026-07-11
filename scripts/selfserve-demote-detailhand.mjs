/**
 * Free demotion of PURE detailers and hand-washes wrongly tagged self-serve.
 * Precise: only names that are clearly a detailer ("...Detailing", no "car wash")
 * or a hand-wash ("...Hand Car Wash"), and do NOT self-identify as self-serve.
 * Leaves mixed "Car Wash & Detail" places (may have self-serve bays) to vision.
 * is_self_service=false, source='namecat_rejected'. Backup first. Reversible.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb=createClient(env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SELF=/self.?serv|coin.?op|\bwand\b/i;
const CARWASH=/\bcar\s?wash\b|\bcarwash\b/i;
const DETAIL=/\bdetail(ing|er|s)?\b/i;
const HAND=/\bhand[\s-]?(car[\s-]?)?wash\b/i;

const rows=[];let from=0;
while(true){const{data}=await sb.from('listings').select('id,name,google_category,self_service_source').eq('is_self_service',true).order('id').range(from,from+999);if(!data||!data.length)break;rows.push(...data);from+=data.length;if(data.length<1000)break;}

const demote=rows.filter(r=>{
  const n=r.name||'', cat=r.google_category||'';
  if(SELF.test(n)) return false;               // self-identifies self-serve -> keep
  const isHand=HAND.test(n);
  const isPureDetail=DETAIL.test(n+' '+cat) && !CARWASH.test(n); // "Detailing" but not "...Car Wash & Detail"
  return isHand || isPureDetail || /detailing/i.test(cat);
});

writeFileSync(`scripts/_backup_demote_detailhand_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(demote.map(r=>({id:r.id,name:r.name,prev_source:r.self_service_source})),null,2));
console.log('Pure detailer/hand-wash to demote:', demote.length);
console.log('samples:', demote.slice(0,15).map(r=>r.name).join(' | '));
let done=0;
for(let i=0;i<demote.length;i+=200){const ids=demote.slice(i,i+200).map(r=>r.id);const{error}=await sb.from('listings').update({is_self_service:false,self_service_source:'namecat_rejected'}).in('id',ids);if(error){console.log('ERR',error.message);break;}done+=ids.length;}
console.log('Demoted:', done);

// show what we deliberately KEPT (mixed car wash & detail) so it's transparent
const keptMixed=rows.filter(r=>CARWASH.test(r.name||'')&&DETAIL.test(r.name||'')&&!SELF.test(r.name||'')).slice(0,10);
console.log('\nKEPT (mixed "Car Wash & Detail" — left for vision/manual):', keptMixed.map(r=>r.name).join(' | '));
