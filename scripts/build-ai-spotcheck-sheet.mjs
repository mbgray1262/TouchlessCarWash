/**
 * Contact sheet of every AI-touched self-serve listing, for fast visual spot-checking.
 * "AI touched" = approved self-serve where the AI picked the hero (hero_image_source in
 * autopilot/street_view_fix/ai_photo) OR the classification is label-only (google_category
 * / osm_self_service — a label, never a look). Deduped. Hand-curated heroes (the 1,020
 * Michael picked himself) are excluded — he already looked at those.
 *
 * Output is a standalone HTML file (NOT an artifact — artifacts block remote images; this
 * references the live Supabase hero URLs, which load fine when opened locally in a browser).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
// Match the app's own URL builder exactly (components/ListingCard.tsx + lib/constants.ts):
// /state/{stateSlug}/{citySlug}/{slug}. A guessed URL = a broken link = a useless sheet.
// slugify + the code→name map are copied verbatim from lib/constants.ts (can't import .ts here).
const slugify = t => (t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const SN={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'};
const getStateSlug = c => SN[c] ? slugify(SN[c]) : (c||'').toLowerCase();
const listingUrl = r => `${SITE}/state/${getStateSlug(r.state)}/${slugify(r.city||'')}/${r.slug}`;
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const SITE='https://touchlesscarwashfinder.com';

async function pull(){
  let rows=[];
  for(let p=0;;p++){
    let data,error;
    for(let a=0;a<8;a++){
      ({data,error}=await sb.from('listings')
        .select('id,name,slug,city,state,hero_image,hero_image_source,self_service_source,self_serve_bay_photo')
        .eq('is_self_service',true).eq('is_approved',true).not('self_service_reviewed_at','is',null)
        .order('state').order('id').range(p*300,p*300+299));
      if(!error) break;
      await new Promise(s=>setTimeout(s,5000*(a+1)));
    }
    if(error){ console.error('⛔',error.message); process.exit(1); }
    if(!data?.length) break;
    rows.push(...data);
    if(data.length<300) break;
  }
  return rows;
}
const AI_HERO=new Set(['autopilot','street_view_fix','ai_photo']);
const LABEL=new Set(['google_category','osm_self_service']);
const all=await pull();
const touched=all.filter(r=> AI_HERO.has(r.hero_image_source) || LABEL.has(r.self_service_source));
// AI-hero first (visual risk), then label-only; and listings with no bay proof to the very top.
const rank=r=>(r.self_serve_bay_photo===false?0:AI_HERO.has(r.hero_image_source)?1:2);
touched.sort((a,b)=>rank(a)-rank(b) || (a.state||'').localeCompare(b.state||''));

const badge=r=>{ const b=[];
  if(AI_HERO.has(r.hero_image_source)) b.push(`<span class="b ai">AI hero</span>`);
  if(r.self_service_source==='google_category') b.push(`<span class="b g">Google label</span>`);
  if(r.self_service_source==='osm_self_service') b.push(`<span class="b o">OSM tag</span>`);
  if(r.self_serve_bay_photo===false) b.push(`<span class="b no">NO bay proof</span>`);
  return b.join(' '); };

const cards=touched.map(r=>`<a class="c" href="${listingUrl(r)}" target="_blank" rel="noopener">
  <div class="img">${r.hero_image?`<img loading="lazy" src="${r.hero_image}">`:'<div class="nh">no hero</div>'}</div>
  <div class="meta"><div class="nm">${(r.name||'').replace(/</g,'&lt;')}</div><div class="loc">${r.city||''}, ${r.state||''}</div><div class="badges">${badge(r)}</div></div>
</a>`).join('\n');

const noBay=touched.filter(r=>r.self_serve_bay_photo===false).length;
const aiHero=touched.filter(r=>AI_HERO.has(r.hero_image_source)).length;
const html=`<!doctype html><html><head><meta charset="utf-8"><title>AI self-serve spot check</title>
<style>
body{font:14px -apple-system,system-ui,sans-serif;margin:0;background:#0f1622;color:#e8edf4}
header{position:sticky;top:0;background:#0f1622;padding:16px 20px;border-bottom:1px solid #223;z-index:5}
h1{margin:0 0 4px;font-size:18px} .sub{color:#8ba;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;padding:20px}
.c{display:block;background:#18202e;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;border:1px solid #223}
.c:hover{border-color:#4a7}
.img{aspect-ratio:16/10;background:#0b1018;display:flex;align-items:center;justify-content:center}
.img img{width:100%;height:100%;object-fit:cover} .nh{color:#556;font-size:12px}
.meta{padding:9px 11px} .nm{font-weight:600;font-size:13px;line-height:1.25} .loc{color:#8ba;font-size:12px;margin:2px 0 6px}
.b{display:inline-block;font-size:10.5px;padding:2px 6px;border-radius:20px;margin:0 3px 3px 0;font-weight:600}
.b.ai{background:#1e3a5f;color:#9cf} .b.g{background:#5f3a1e;color:#fc9} .b.o{background:#1e5f3a;color:#9fc} .b.no{background:#5f1e2a;color:#f9a}
.f{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
button{background:#223;color:#cde;border:1px solid #345;border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer}
button.on{background:#2a5;color:#031;border-color:#3c6}
</style></head><body>
<header><h1>AI-handled self-serve listings — spot check</h1>
<div class="sub">${touched.length} listings the AI classified or photographed (your ${all.length-touched.length} hand-curated ones are excluded). ${aiHero} AI-picked heroes · ${noBay} with no bay photo (shown first). Click any card to open the live listing.</div>
<div class="f">
<button class="on" onclick="filt(this,'all')">All (${touched.length})</button>
<button onclick="filt(this,'no')">⚠ No bay proof (${noBay})</button>
<button onclick="filt(this,'ai')">AI hero (${aiHero})</button>
<button onclick="filt(this,'g')">Google label</button>
<button onclick="filt(this,'o')">OSM tag</button>
</div></header>
<div class="grid" id="g">${cards}</div>
<script>
function filt(btn,k){document.querySelectorAll('header button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
 document.querySelectorAll('.c').forEach(c=>{const h=c.querySelector('.badges').innerHTML;
   let show=k==='all'||(k==='no'&&h.includes('NO bay'))||(k==='ai'&&h.includes('AI hero'))||(k==='g'&&h.includes('Google'))||(k==='o'&&h.includes('OSM'));
   c.style.display=show?'':'none';});}
</script></body></html>`;
const out='scripts/discovery-output/ai-spotcheck.html';
writeFileSync(out,html);
console.log(`${touched.length} AI-touched listings (${aiHero} AI-hero, ${noBay} no-bay-proof)`);
console.log(`wrote ${out}`);
