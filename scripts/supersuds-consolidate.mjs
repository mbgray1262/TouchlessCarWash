import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = !process.argv.includes('--commit');
const log=(...a)=>console.log(DRY?'[DRY]':'[LIVE]',...a);

const VENDOR=2358; // becomes the single Super Suds Auto Spa vendor

// Real branches (keep) -> by listing id
const KEEP = {
  '044e31ad-0610-45db-836e-87fdd2ad9f60':{b:'Austintown',          flagApprove:false}, // thin, enrich first
  '17b76f61-9e8d-48bd-bc47-ec5a30f17704':{b:'Austintown II',        rename:'Austintown II Auto Spa', live:true},
  'b997608e-3b45-4ffa-b808-d57ee06ba65f':{b:'Boardman',             flagApprove:true},
  '37b93cce-0258-43a5-aded-33d18bc1ef23':{b:'Canfield',             rename:'Canfield Auto Spa', flagApprove:false}, // needs hours
  '17357ecd-e63c-48d3-bc5a-603965c38496':{b:'Champion',            live:true},
  'dd2cd879-5c36-429a-9e4e-dee6168cfb92':{b:'Chardon',             live:true},
  '30c82c23-9c7b-4c3a-a1a6-df4c5d37ed25':{b:'Cornersburg',          flagApprove:true},
  'baf7878f-4e4d-49ce-a52b-a0c152e55f6b':{b:'Cortland',             flagApprove:true},
  'f731bea8-ce5c-4f87-b00f-e9f02f2a07c1':{b:'Elm Road',             flagApprove:true},
  'fe5c2616-ca15-46c1-b9bf-eddca0c60ebe':{b:'Howland',             live:true},
  '35e7438c-c7bd-4d3a-84b0-c0cac1ad5b71':{b:'Niles',                flagApprove:false}, // needs hero
  'bcdd9c05-abf7-4b85-a46e-f6da623b1c82':{b:'Struthers',            flagApprove:true},
};
// Jefferson: on their domain but not on site -> keep vendor link, do NOT approve, flag note
const JEFFERSON='aa25c4cd-5f7a-416b-a880-b10ecceeeda7';
// Empty duplicate rows to DELETE
const DELETE = {
  'eb6335a1-a73d-47da-a5fd-94f2f71d248e':'Canfield empty dup',
  '00290185-7edf-4a84-9ed7-291489bcf871':'Cortland empty dup',
  '0dcadcb4-e791-40d7-98fd-27846a4e93dd':'Struthers empty dup',
};

async function run(){
  // safety: ensure delete targets really have no reviews / are empty
  for(const id of Object.keys(DELETE)){
    const {count}=await sb.from('review_snippets').select('*',{count:'exact',head:true}).eq('listing_id',id);
    log(`check ${DELETE[id]} (${id}): review_snippets=${count}`);
    if(count>0){console.log('  !! has reviews, NOT safe to delete — aborting delete for this row'); delete DELETE[id];}
  }

  // 1) vendor master record
  log('update vendor 2358 -> Super Suds Auto Spa / supersudsautospa.com');
  if(!DRY) await sb.from('vendors').update({canonical_name:'Super Suds Auto Spa',domain:'supersudsautospa.com',website:'https://supersudsautospa.com/',is_chain:true}).eq('id',VENDOR);

  // 2) point all real branches + jefferson at vendor 2358, set parent_chain
  const all=[...Object.keys(KEEP),JEFFERSON];
  log(`set vendor_id=${VENDOR}, parent_chain='Super Suds Auto Spa' on ${all.length} branches`);
  if(!DRY) await sb.from('listings').update({vendor_id:VENDOR,parent_chain:'Super Suds Auto Spa'}).in('id',all);

  // 3) renames
  for(const [id,c] of Object.entries(KEEP)) if(c.rename){ log(`rename ${c.b} -> "${c.rename}"`); if(!DRY) await sb.from('listings').update({name:c.rename}).eq('id',id); }

  // 4) flag + approve the fully-enriched mis-flagged branches
  const fa=Object.entries(KEEP).filter(([id,c])=>c.flagApprove).map(([id])=>id);
  log(`flag is_touchless=true, touchless_verified='website', is_approved=true on ${fa.length}: ${Object.entries(KEEP).filter(([i,c])=>c.flagApprove).map(([i,c])=>c.b).join(', ')}`);
  if(!DRY) await sb.from('listings').update({is_touchless:true,touchless_verified:'website',is_approved:true}).in('id',fa);

  // 5) flag-only (touchless true) for the 3 that still need enrichment before approve
  const flagOnly=Object.entries(KEEP).filter(([id,c])=>c.flagApprove===false && !c.live).map(([id])=>id);
  log(`flag is_touchless=true (NOT yet approved, pending enrichment) on: ${Object.entries(KEEP).filter(([i,c])=>c.flagApprove===false&&!c.live).map(([i,c])=>c.b).join(', ')}`);
  if(!DRY) await sb.from('listings').update({is_touchless:true,touchless_verified:'website'}).in('id',flagOnly);

  // 6) Jefferson note
  log(`Jefferson: leave unapproved, add crawl_note for manual verify`);
  if(!DRY) await sb.from('listings').update({crawl_notes:'On autospaoh.com domain but NOT listed on supersudsautospa.com/location — verify still a Super Suds branch before approving'}).eq('id',JEFFERSON);

  // 7) delete empty dup rows
  for(const id of Object.keys(DELETE)){ log(`DELETE ${DELETE[id]} (${id})`); if(!DRY) await sb.from('listings').delete().eq('id',id); }

  // 8) clean up empty vendors 2426 & 4343 (reassign already done; just verify empty then delete)
  for(const vid of [2426,4343]){
    const {count}=await sb.from('listings').select('*',{count:'exact',head:true}).eq('vendor_id',vid);
    log(`vendor ${vid} now has ${count} listings -> ${count===0?'DELETE':'KEEP (still has rows)'}`);
    if(!DRY && count===0) await sb.from('vendors').delete().eq('id',vid);
  }
  log('DONE');
}
run().then(()=>process.exit(0));
