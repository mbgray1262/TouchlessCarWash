import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DRY=!process.argv.includes('--commit');
const log=(...a)=>console.log(DRY?'[DRY]':'[LIVE]',...a);
async function q(b){for(let i=0;i<6;i++){const r=await b();if(!r.error)return r;await sleep(600);}throw new Error('query failed');}

// ---------- SUPER WASH ----------
const SW_ORPHAN='3f3e6a04-d135-4f78-8e56-235622976b4f';
log(`Super Wash: link orphan ${SW_ORPHAN} -> vendor 1826`);
if(!DRY) await q(()=>sb.from('listings').update({vendor_id:1826}).eq('id',SW_ORPHAN));

// ---------- BP MERGE (1387 -> 1808) ----------
const cnt1387a=(await q(()=>sb.from('listings').select('*',{count:'exact',head:true}).eq('vendor_id',1387))).count;
log(`BP: vendor 1387 has ${cnt1387a} listings to merge into 1808`);
// fill parent_chain='BP' only where null (preserve Amoco sub-brand etc.)
const nullPc=(await q(()=>sb.from('listings').select('*',{count:'exact',head:true}).eq('vendor_id',1387).is('parent_chain',null))).count;
log(`  set parent_chain='BP' on ${nullPc} (currently null) before reassign`);
if(!DRY) await q(()=>sb.from('listings').update({parent_chain:'BP'}).eq('vendor_id',1387).is('parent_chain',null));
// reassign vendor
log(`  reassign vendor_id 1387 -> 1808`);
if(!DRY) await q(()=>sb.from('listings').update({vendor_id:1808}).eq('vendor_id',1387));
// fix canonical domain on 1808
log(`  fix vendor 1808 domain map.bp.com -> bp.com`);
if(!DRY) await q(()=>sb.from('vendors').update({domain:'bp.com'}).eq('id',1808));
// verify empty + delete 1387
const cnt1387b=DRY?cnt1387a:(await q(()=>sb.from('listings').select('*',{count:'exact',head:true}).eq('vendor_id',1387))).count;
log(`  vendor 1387 now has ${cnt1387b} listings -> ${(!DRY&&cnt1387b===0)?'DELETE':'(dry: would delete if 0)'}`);
if(!DRY && cnt1387b===0) await q(()=>sb.from('vendors').delete().eq('id',1387));

log('DONE');
process.exit(0);
