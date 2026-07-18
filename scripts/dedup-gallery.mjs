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
const THRESH = 10;
const dl = async u => { try{ const r=await fetch(u,{signal:AbortSignal.timeout(12000)}); if(r.ok) return Buffer.from(await r.arrayBuffer()); }catch{} return null; };
async function dhash(buf){ try{ const px=await sharp(buf).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer(); let h=0n,b=0n; for(let r=0;r<8;r++)for(let c=0;c<8;c++){const i=r*9+c; if(px[i]<px[i+1])h|=(1n<<b); b++;} return h; }catch{ return null; } }
const ham=(a,b)=>{ let x=a^b,n=0; while(x){n+=Number(x&1n);x>>=1n;} return n; };

let rows=[]; for(let p=0;;p++){ const {data}=await sb.from('listings').select('id,name,hero_image,photos').eq('is_self_service',true).is('self_service_reviewed_at',null).not('photos','is',null).order('id').range(p*1000,p*1000+999); if(!data?.length)break; rows.push(...data); if(data.length<1000)break; }
console.log(`${rows.length} listings with a gallery | ${APPLY?'APPLY':'DRY RUN'}`);
let totalDropped=0, touched=0;
for(const l of rows){
  const photos=(l.photos||[]).filter(Boolean); if(photos.length<2) continue;
  const heroHash = l.hero_image ? await dhash(await dl(l.hero_image)) : null;
  const kept=[], keptHashes=[];
  for(const u of photos){
    const buf=await dl(u); const h=buf?await dhash(buf):null;
    if(h===null){ kept.push(u); continue; }  // can't hash → keep (don't lose it)
    if(heroHash!==null && ham(h,heroHash)<=THRESH) continue;         // ~= hero → drop
    if(keptHashes.some(kh=>ham(h,kh)<=THRESH)) continue;             // ~= an already-kept → drop
    kept.push(u); keptHashes.push(h);
  }
  const dropped=photos.length-kept.length;
  if(dropped>0){ totalDropped+=dropped; touched++;
    if(touched<=12) console.log(`  ${l.name}: ${photos.length} → ${kept.length} (-${dropped})`);
    if(APPLY) await sb.from('listings').update({photos:kept}).eq('id',l.id);
  }
}
console.log(`\n${touched} listings had near-dupes | ${totalDropped} photos ${APPLY?'removed':'would be removed'}`);
