/**
 * Resolve SAME-SITE duplicate listings (two+ public listings for ONE physical car wash).
 * Found by street-address clustering; e.g. 10380 N 59th Ave Glendale AZ was listed as BOTH
 * "Elephant Car Wash" and "Weiss Guys Express Wash" — same site, Weiss Guys is the stale
 * pre-handover listing Google never closed.
 *
 * HOW IT DECIDES (the important part):
 *  - Review count is a TRAP: the stale Weiss Guys listing had MORE reviews (294) than the
 *    real current operator Elephant (187). Never rank by reviews.
 *  - The reliable signal is the SIGNAGE in the authoritative Places photos — photos are
 *    recent and show whichever brand is physically on the building today (a user photo on
 *    the Weiss Guys listing literally showed the Elephant sign). So: pull each listing's
 *    authoritative photos and let vision read the signage to pick the real operator.
 *  - Safe default: if vision can't tell, or the two are genuinely DIFFERENT businesses,
 *    change NOTHING.
 *  - Fuel-brand vs car-wash-name at one site (e.g. "Sunoco" + "Mitchell Touchless Car
 *    Wash"): keep the CAR-WASH-named listing — this is a car wash directory.
 *
 * Losers are SOFT-closed (is_approved=false → 308 redirect, place_id kept) per the
 * closed-listing policy. Fully backed up + reversible.
 *   node scripts/resolve-site-duplicates.mjs          # dry run
 *   node scripts/resolve-site-duplicates.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const SB_URL=env.NEXT_PUBLIC_SUPABASE_URL; const sb=createClient(SB_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const AKEY=env.ANTHROPIC_API_KEY; const MODEL='claude-sonnet-5';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clusters=JSON.parse(readFileSync('scripts/_dupclusters.json','utf8'));

const dl=async u=>{ for(let a=0;a<3;a++){ try{const r=await fetch(u,{signal:AbortSignal.timeout(20000)}); if(r.ok) return Buffer.from(await r.arrayBuffer());}catch{} await sleep(700*(a+1)); } return null; };
const small=async b=>{ try{ return (await sharp(b).resize(420,420,{fit:'inside',withoutEnlargement:true}).jpeg({quality:70}).toBuffer()).toString('base64'); }catch{ return null; } };
async function authPhotos(pid){
  if(!pid) return [];
  for(let a=0;a<3;a++){
    try{ const r=await fetch(`${SB_URL}/functions/v1/google-place-photos?place_id=${pid}&offset=0&limit=4`,{headers:{Authorization:`Bearer ${ANON}`},signal:AbortSignal.timeout(20000)});
      if(r.ok){ const j=await r.json(); return (j.photos||[]).map(p=>p.url); } }catch{}
    await sleep(1200*(a+1));
  }
  return [];
}
async function ask(content){
  for(let a=0;a<5;a++){
    try{
      const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':AKEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
        body:JSON.stringify({model:MODEL,max_tokens:900,messages:[{role:'user',content}]})}); // never send temperature (deprecated → 400)
      if(r.status===429||r.status===529||r.status>=500){ const ra=parseFloat(r.headers.get('retry-after')||'')||Math.min(2**a*2,30); await sleep(ra*1000); continue; }
      if(!r.ok){ await sleep(1500); continue; }
      const j=await r.json(); if(j?.stop_reason==='max_tokens'){ await sleep(1000); continue; }
      const t=j?.content?.[0]?.text||''; const s=t.indexOf('{'), e=t.lastIndexOf('}');
      if(s<0||e<0){ await sleep(1200); continue; }
      try{ return JSON.parse(t.slice(s,e+1)); }catch{ await sleep(1000); }
    }catch{ await sleep(1500*(a+1)); }
  }
  return null;
}

// Same business listed twice under the SAME name (Google didn't merge them). Vision can't
// pick between identical listings, and it was closing the RICHER record (e.g. "OTTO Car
// Wash" 575 reviews vs an identical empty OTTO). For these, skip vision and keep the
// listing with the most data — reviews then hero.
const nameKey = n => (n||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/\b(llc|inc)\b/g,'');
const richest = arr => arr.slice().sort((a,b)=>(b.rev-a.rev)||((b.hero?1:0)-(a.hero?1:0))||((b.pid?1:0)-(a.pid?1:0)))[0];

// A listing whose name is ONLY service/equipment words ("Touchless Automatic", "Automatic
// Laserwash", "Car Wash") is not a business name — it's the SERVICE LABEL painted on the
// sign, or the machine model (LaserWash is a PDQ unit). Vision reads that signage and
// wrongly concludes the generic listing is the real business, closing the actual brand
// (it wanted to close "Mr Sparkle Car Wash" [338 rev] for "Touchless Automatic"). So when
// exactly one listing in a cluster has a real brand name, that one wins outright.
const GENERIC = new Set(['car','cars','wash','washes','carwash','touchless','touch','free','automatic','auto','self','serve','service','services','laser','laserwash','express','coin','op','bay','bays','clean','spot','spotless','the','at','and','of','a','24','hr','hrs','hour','hours','vacuum','dog','pet','full','shine','soft','gloss','maxx','iii','ii','i','n','inc','llc','co']);
const distinctive = n => (n||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t=>t && !GENERIC.has(t)).length > 0;

const backup=[]; let closed=0, keptAmbiguous=0, autoStub=0, noEvidence=0, sameName=0, genericDup=0;
for(const c of clusters){
  const [state,city,addr]=c.key.split('|');
  const L=c.listings;

  // ── Case 0: identical names at one address → true duplicate; keep the richer record.
  if(new Set(L.map(l=>nameKey(l.name))).size===1){
    const keep=richest(L); const losers=L.filter(l=>l.id!==keep.id);
    console.log(`• ${addr} (${city}, ${state}) — identical-name duplicate → keep "${keep.name}" [${keep.rev} rev]; closing ${losers.length} emptier copy(ies) [${losers.map(l=>l.rev+' rev').join(', ')}]`);
    sameName++;
    if(APPLY) for(const l of losers){ backup.push({id:l.id,name:l.name,was_approved:true,reason:`identical-name dup of ${keep.name} (${keep.id})`}); await sb.from('listings').update({is_approved:false}).eq('id',l.id); closed++; }
    continue;
  }

  // ── Case 0b: exactly one real brand name vs service-label/equipment-named listing(s) →
  // the branded one is the business; the generic one is a signage/equipment artifact.
  const named = L.filter(l => distinctive(l.name));
  if(named.length === 1 && L.length > named.length){
    const keep = named[0]; const losers = L.filter(l=>l.id!==keep.id);
    console.log(`• ${addr} (${city}, ${state}) — branded vs service-label → keep "${keep.name}" [${keep.rev} rev]; closing generic: ${losers.map(l=>`${l.name} [${l.rev} rev]`).join(', ')}`);
    genericDup++;
    if(APPLY) for(const l of losers){ backup.push({id:l.id,name:l.name,was_approved:true,reason:`service-label dup of ${keep.name} (${keep.id})`}); await sb.from('listings').update({is_approved:false}).eq('id',l.id); closed++; }
    continue;
  }

  const strong=L.filter(l=>l.pid && l.rev>=5);

  // ── Case 1: one real listing + thin stubs → close the stubs (safe, no vision needed)
  if(strong.length<=1){
    const keep = strong[0] || L.slice().sort((a,b)=>(b.rev-a.rev)||((b.hero?1:0)-(a.hero?1:0)))[0];
    const losers = L.filter(l=>l.id!==keep.id);
    if(!losers.length) continue;
    console.log(`• ${addr} (${city}, ${state}) — keep "${keep.name}" (${keep.rev} rev); closing ${losers.length} thin stub(s): ${losers.map(l=>l.name).join(', ')}`);
    autoStub++;
    if(APPLY) for(const l of losers){ backup.push({id:l.id,name:l.name,was_approved:true,reason:`same-site stub dup of ${keep.name}`}); await sb.from('listings').update({is_approved:false}).eq('id',l.id); closed++; }
    continue;
  }

  // ── Case 2: 2+ real listings → read the SIGNAGE in each one's authoritative photos
  const blocks=[]; const imgs=[];
  for(let i=0;i<L.length;i++){
    const urls=await authPhotos(L[i].pid);
    const b64=[]; for(const u of urls.slice(0,3)){ const buf=await dl(u); const s=buf&&await small(buf); if(s) b64.push(s); }
    blocks.push({i, name:L[i].name, n:b64.length}); imgs.push(b64);
  }
  if(!imgs.some(a=>a.length)){ noEvidence++; console.log(`• ${addr} (${city}, ${state}) — no photos to judge; left alone (${L.map(l=>l.name).join(' | ')})`); continue; }

  const content=[{type:'text',text:
`These directory listings all claim the SAME street address: ${addr}, ${city}, ${state}. Photos from each listing's own Google profile follow.

Listings:
${L.map((l,i)=>`  [${i}] "${l.name}"`).join('\n')}

Decide, from the SIGNAGE and buildings in the photos:
1. same_site: do the photos show ONE physical business/site (a rebrand or duplicate), or genuinely DIFFERENT neighbouring businesses?
2. If ONE site: which listing index names the business whose signage is ACTUALLY on the building now? Photos are recent, so trust the signage over the listing name — a stale listing often carries photos of the NEW operator's sign.
3. If the site is a fuel station whose car wash is separately branded and BOTH are legitimately present, pick the index naming the CAR WASH (this is a car-wash directory).
4. CAUTION: a building's sign usually shows the SERVICE ("TOUCHLESS AUTOMATIC", "LASERWASH" = a PDQ machine model) rather than the business name. Never pick a listing just because those words appear on the sign — prefer the listing with a real brand name.
Be conservative: if you cannot tell, or they look like different businesses, set keep=-1.

Return ONLY JSON: {"same_site":true|false,"keep":<index or -1>,"why":"<10 words>"}`}];
  for(let i=0;i<L.length;i++){ content.push({type:'text',text:`Listing [${i}] "${L[i].name}" photos:`}); for(const b of imgs[i]) content.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:b}}); }

  const v=await ask(content); await sleep(700);
  if(!v || v.keep===undefined){ noEvidence++; console.log(`• ${addr} (${city}, ${state}) — vision unavailable; left alone`); continue; }
  if(!v.same_site || v.keep<0 || !L[v.keep]){ keptAmbiguous++; console.log(`• ${addr} (${city}, ${state}) — LEFT ALONE (${v.same_site?'cannot tell which is current':'genuinely different businesses'}): ${L.map(l=>l.name).join(' | ')}`); continue; }
  const keep=L[v.keep]; const losers=L.filter(l=>l.id!==keep.id);
  console.log(`• ${addr} (${city}, ${state}) — SAME SITE → keep "${keep.name}" (${v.why}); closing: ${losers.map(l=>`${l.name} [${l.rev} rev]`).join(', ')}`);
  if(APPLY) for(const l of losers){ backup.push({id:l.id,name:l.name,was_approved:true,reason:`same-site dup of ${keep.name} — ${v.why}`}); await sb.from('listings').update({is_approved:false}).eq('id',l.id); closed++; }
}

if(APPLY && backup.length){ const f=`scripts/_backup_site_dups_${Date.now()}.json`; writeFileSync(f,JSON.stringify(backup,null,2)); console.log(`\nBacked up ${backup.length} closed listings (reversible): ${f}`); }
console.log(`\n==================== SITE-DUP RESOLUTION ${APPLY?'APPLIED':'DRY RUN'} ====================`);
console.log(`clusters ${clusters.length} | identical-name dups ${sameName} | service-label dups ${genericDup} | stub-clusters ${autoStub} | listings soft-closed ${closed} | left alone (ambiguous/different) ${keptAmbiguous} | no evidence ${noEvidence}`);
