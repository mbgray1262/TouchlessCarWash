/**
 * Photo-contamination detector + fixer — permanent safety net.
 *
 * Finds listings that share IDENTICAL photo URLs with an UNRELATED listing (different name, not
 * the same chain, and >0.3 mi apart). That's the signature of the two contamination bugs we hit:
 *   - the photo-audit save race (fixed by the candidatesOwnerId guard in useFastCuration.ts), and
 *   - the gallery harvester pinning one wash's photos onto many (fixed by the stale-page +
 *     navigation guards in maps_gallery.py).
 * Legitimate chain-brand sharing (Kwik Trip etc. using one brand photo) is NOT flagged.
 *
 *   node scripts/detect-photo-contamination.mjs          # report only (exit 1 if any live found)
 *   node scripts/detect-photo-contamination.mjs --fix    # strip the borrowed photos too
 *
 * Ownership when stripping: a storage file is kept on the listing whose id is in its path; a
 * non-storage URL is kept on the lexicographically-smallest listing id (stable) and stripped from
 * the rest — so exactly one listing keeps each shared photo.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const FIX = process.argv.includes('--fix');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// NB .order('id') is REQUIRED — without a stable sort, Postgres returns rows in arbitrary order
// and .range() pagination silently misses/duplicates rows differently each run, making detection
// non-deterministic (the source of earlier flapping counts).
async function pageAll(cols){ let out=[],from=0; for(;;){ const {data}=await sb.from('listings').select(cols).not('photos','is',null).order('id').range(from,from+999); out=out.concat(data||[]); if(!data||data.length<1000)break; from+=1000; } return out; }
const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/carwash|touchless|selfserve|automatic|the|llc|inc/g,'');
function miles(a,b,c,d){ if([a,b,c,d].some(x=>x==null))return null; const R=3959,t=x=>x*Math.PI/180; const dl=t(c-a),dn=t(d-b); const h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
const embOwner = u => { const m=(u||'').match(/listing-photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/); return m?m[1]:null; };

const rows = await pageAll('id,name,parent_chain,hero_image,hero_image_source,photos,is_approved,latitude,longitude');
const byId = new Map(rows.map(r=>[r.id,r]));
const urlUsers = new Map();
for (const l of rows) for (const u of (l.photos||[])) { if(!urlUsers.has(u)) urlUsers.set(u,new Set()); urlUsers.get(u).add(l.id); }

function related(a,b){ if(!a||!b)return false;
  if(a.parent_chain&&b.parent_chain&&a.parent_chain===b.parent_chain) return true;
  if(norm(a.name)&&norm(a.name)===norm(b.name)) return true;
  const d=miles(a.latitude,a.longitude,b.latitude,b.longitude); return d!=null&&d<0.3; }

const stripFrom = new Map(); // listingId -> Set(urls)
let crossUrls = 0;
for (const [u,ids] of urlUsers) {
  if (ids.size < 2) continue;
  const arr = [...ids].map(id=>byId.get(id));
  let unrelated=false;
  for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++) if(!related(arr[i],arr[j])) unrelated=true;
  if (!unrelated) continue;
  crossUrls++;
  const keep = embOwner(u) || [...ids].sort()[0];
  for (const id of ids) { if(id===keep) continue; if(!stripFrom.has(id)) stripFrom.set(id,new Set()); stripFrom.get(id).add(u); }
}

const liveCount = [...stripFrom.keys()].filter(id=>byId.get(id)?.is_approved).length;
console.log(`cross-shared photo URLs (unrelated listings): ${crossUrls}`);
console.log(`listings with borrowed photos: ${stripFrom.size} (live: ${liveCount})`);
for (const [id] of [...stripFrom].slice(0,15)) { const l=byId.get(id); console.log(`  ${l.is_approved?'🔴':'  '} ${l.name} (${l.city ?? ''})`); }

if (FIX && stripFrom.size) {
  let n=0;
  for (const [id,urls] of stripFrom) {
    const l=byId.get(id); const kept=(l.photos||[]).filter(u=>!urls.has(u));
    const upd={ photos: kept };
    if (l.hero_image && urls.has(l.hero_image)) { upd.hero_image=null; upd.hero_image_source=null; }
    const { error } = await sb.from('listings').update(upd).eq('id', id);
    if (!error) n++;
    if (n%25===0) await sleep(120);
  }
  console.log(`\n--fix: stripped borrowed photos from ${n} listings`);
} else if (!FIX && liveCount > 0) {
  process.exitCode = 1;   // non-zero so a scheduled run surfaces it
}
