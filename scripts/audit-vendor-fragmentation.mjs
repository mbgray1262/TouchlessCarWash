import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// paginate all listings with a website
function regDomain(url){
  if(!url) return null;
  try{ let h=new URL(url.startsWith('http')?url:'http://'+url).hostname.toLowerCase().replace(/^www\./,'');
    // strip common subdomains? keep registrable-ish (last 2 labels, naive)
    const parts=h.split('.'); if(parts.length>2 && !['co','com','org','net'].includes(parts[parts.length-2])) h=parts.slice(-2).join('.'); else if(parts.length>2) h=parts.slice(-3).join('.');
    return h;
  }catch{return null;}
}
let all=[],last='00000000-0000-0000-0000-000000000000';
while(true){
  const {data,error}=await sb.from('listings').select('id,name,city,state,website,vendor_id').gt('id',last).order('id').limit(1000);
  if(error){console.error(error.message);break;}
  if(!data.length)break; all=all.concat(data); last=data[data.length-1].id; if(data.length<1000)break;
}
console.log(`scanned ${all.length} listings`);

// load vendors
const {data:vendors}=await sb.from('vendors').select('id,canonical_name,domain,is_chain');
const vById=new Map(vendors.map(v=>[v.id,v]));
const vByDomain=new Map(); for(const v of vendors){ if(v.domain) vByDomain.set(v.domain.toLowerCase().replace(/^www\./,''),v); }
console.log(`${vendors.length} vendors total`);

// === PATTERN A: same domain spanning multiple vendor_ids ===
const byDom=new Map();
for(const l of all){ const d=regDomain(l.website); if(!d) continue; if(!byDom.has(d))byDom.set(d,[]); byDom.get(d).push(l); }
const fragmented=[];
for(const [d,ls] of byDom){
  if(ls.length<2) continue;
  const vids=new Set(ls.map(l=>l.vendor_id===null?'NULL':l.vendor_id));
  if(vids.size>1) fragmented.push({d,n:ls.length,vids:[...vids],ls});
}
fragmented.sort((a,b)=>b.n-a.n);
console.log(`\n=== PATTERN A: one domain split across multiple vendors (${fragmented.length} domains) ===`);
for(const f of fragmented.slice(0,40)){
  console.log(`${f.d}  | ${f.n} listings across vendors [${f.vids.join(', ')}]`);
}

// === PATTERN B: listing domain matches a vendor.domain but vendor_id null or different ===
let unlinked=0, mislinked=0; const unlinkedDom=new Map();
for(const l of all){ const d=regDomain(l.website); if(!d)continue; const v=vByDomain.get(d); if(!v)continue;
  if(l.vendor_id===null){ unlinked++; unlinkedDom.set(d,(unlinkedDom.get(d)||0)+1);}
  else if(l.vendor_id!==v.id){ mislinked++; }
}
console.log(`\n=== PATTERN B: domain matches an existing vendor but listing NOT linked ===`);
console.log(`unlinked (vendor_id null): ${unlinked} listings across ${unlinkedDom.size} vendor-domains`);
console.log(`mislinked (linked to wrong vendor): ${mislinked} listings`);
const topUn=[...unlinkedDom.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15);
for(const [d,c] of topUn) console.log(`  ${d}: ${c} unlinked listings (vendor: ${vByDomain.get(d).canonical_name})`);

// === PATTERN C: duplicate-ish vendor records sharing same domain ===
const vDom=new Map(); for(const v of vendors){ if(!v.domain)continue; const d=v.domain.toLowerCase().replace(/^www\./,''); if(!vDom.has(d))vDom.set(d,[]); vDom.get(d).push(v);}
const dupVendors=[...vDom.entries()].filter(([d,vs])=>vs.length>1);
console.log(`\n=== PATTERN C: multiple vendor records sharing the same domain (${dupVendors.length}) ===`);
for(const [d,vs] of dupVendors.slice(0,20)) console.log(`  ${d}: vendors ${vs.map(v=>v.id+'="'+v.canonical_name+'"').join(', ')}`);

// summary of total listings missing a vendor entirely
const noVendor=all.filter(l=>l.vendor_id===null).length;
console.log(`\nTotal listings with NO vendor_id: ${noVendor} / ${all.length}`);
process.exit(0);
