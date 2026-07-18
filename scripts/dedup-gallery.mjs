/**
 * Remove NEAR-DUPLICATE photos from listing galleries (same shot, different file — URL dedup
 * can't catch these). Uses a perceptual difference-hash (dHash): resize to 9x8 grayscale, compare
 * adjacent pixels → 64-bit fingerprint; two photos within HAMMING<=THRESH are "the same shot".
 * Keeps one representative per group; drops the rest. Also drops gallery photos ~= the hero.
 *   node scripts/dedup-gallery.mjs            # dry run over the self-serve review queue
 *   node scripts/dedup-gallery.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import sharp from 'sharp';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const THRESH = 10;                 // hamming <= THRESH = the SAME shot (exact/near dup) → drop
// Cap the gallery size. Many listings collect several near-identical exterior/street-view frames of
// the SAME building (different angle → hamming 20-35, so NOT caught by THRESH, but visually
// repetitive to a reviewer). A perceptual threshold can't separate "same building, different angle"
// from "genuinely different photo", so we hard-cap and keep the MOST VISUALLY DISTINCT ones
// (farthest-point selection anchored on the hero). Tune with MAX_GALLERY env.
const MAX_GALLERY = Number(process.env.MAX_GALLERY || 4);
const dl = async u => { try{ const r=await fetch(u,{signal:AbortSignal.timeout(12000)}); if(r.ok) return Buffer.from(await r.arrayBuffer()); }catch{} return null; };
async function dhash(buf){ try{ const px=await sharp(buf).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer(); let h=0n,b=0n; for(let r=0;r<8;r++)for(let c=0;c<8;c++){const i=r*9+c; if(px[i]<px[i+1])h|=(1n<<b); b++;} return h; }catch{ return null; } }
const ham=(a,b)=>{ let x=a^b,n=0; while(x){n+=Number(x&1n);x>>=1n;} return n; };

let rows=[]; for(let p=0;;p++){ const {data}=await sb.from('listings').select('id,name,hero_image,photos').eq('is_self_service',true).is('self_service_reviewed_at',null).not('photos','is',null).order('id').range(p*1000,p*1000+999); if(!data?.length)break; rows.push(...data); if(data.length<1000)break; }
console.log(`${rows.length} listings with a gallery | ${APPLY?'APPLY':'DRY RUN'}`);
let totalDropped=0, touched=0;
for(const l of rows){
  const photos=(l.photos||[]).filter(Boolean); if(photos.length<2) continue;
  const heroHash = l.hero_image ? await dhash(await dl(l.hero_image)) : null;
  // Pass 1 — drop exact/near duplicates (same shot) and anything ~= the hero.
  const cand=[], candHashes=[];
  for(const u of photos){
    const buf=await dl(u); const h=buf?await dhash(buf):null;
    if(h===null){ cand.push({u,h:null}); continue; }  // can't hash → keep (don't lose it)
    if(heroHash!==null && ham(h,heroHash)<=THRESH) continue;         // ~= hero → drop
    if(candHashes.some(kh=>ham(h,kh)<=THRESH)) continue;             // ~= an already-kept → drop
    cand.push({u,h}); candHashes.push(h);
  }
  // Pass 2 — cap to MAX_GALLERY, keeping the most visually-distinct (farthest-point from the hero
  // and from each other). Unhashable photos are treated as maximally distinct so they're preserved.
  let keptSet;
  if(cand.length>MAX_GALLERY){
    const anchors = heroHash!==null ? [heroHash] : [];
    const pool=[...cand], picked=[];
    while(picked.length<MAX_GALLERY && pool.length){
      let best=0,bestD=-1;
      for(let k=0;k<pool.length;k++){
        const h=pool[k].h;
        const refs=[...anchors,...picked.filter(p=>p.h!=null).map(p=>p.h)];
        const d = h==null ? 999 : (refs.length? Math.min(...refs.map(r=>ham(h,r))) : 999);
        if(d>bestD){bestD=d;best=k;}
      }
      picked.push(pool[best]); pool.splice(best,1);
    }
    keptSet=new Set(picked.map(p=>p.u));
  } else keptSet=new Set(cand.map(p=>p.u));
  const kept=photos.filter(u=>keptSet.has(u));   // preserve original order
  const dropped=photos.length-kept.length;
  if(dropped>0){ totalDropped+=dropped; touched++;
    if(touched<=12) console.log(`  ${l.name}: ${photos.length} → ${kept.length} (-${dropped})`);
    if(APPLY) await sb.from('listings').update({photos:kept}).eq('id',l.id);
  }
}
console.log(`\n${touched} listings had near-dupes | ${totalDropped} photos ${APPLY?'removed':'would be removed'}`);
