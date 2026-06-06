import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const UA = { 'User-Agent': 'TouchlessCarWashFinder/1.0 (one-time geo audit; michael@touchlesscarwashfinder.com)' };
const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');

// Paginate past the 1000-row cap.
async function fetchAll() {
  const out = []; const PAGE = 1000;
  for (let from=0; ; from+=PAGE) {
    const { data, error } = await sb.from('listings')
      .select('id,name,slug,address,city,state,zip,latitude,longitude')
      .eq('is_approved',true).eq('is_touchless',true)
      .not('latitude','is',null).not('city','is',null).neq('city','')
      .order('id', { ascending: true }).range(from, from+PAGE-1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function reverse(lat, lon) {
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`, { headers: UA });
      if (r.ok) return r.json();
    } catch {}
    await sleep(2000);
  }
  return null;
}

const rows = await fetchAll();
console.log(`[${new Date().toISOString()}] auditing ${rows.length} listings...`);

const stateMismatch = [];   // coords in a different STATE — the real bug
let done=0, errs=0;
for (const l of rows) {
  const j = await reverse(l.latitude, l.longitude);
  await sleep(1100);
  done++;
  if (!j?.address) { errs++; continue; }
  const a=j.address;
  const gState=(a['ISO3166-2-lvl4']||'').replace('US-','');
  const gCity=a.city||a.town||a.village||a.hamlet||a.municipality||a.suburb||'';
  const gZip=a.postcode||'';
  if (gState && gState !== l.state) {
    const rec = { id:l.id, name:l.name, slug:l.slug, stored:{city:l.city,state:l.state,zip:l.zip}, coords:{lat:l.latitude,lng:l.longitude}, geocoded:{city:gCity,state:gState,zip:gZip}, display:j.display_name };
    stateMismatch.push(rec);
    console.log(`  ⚠️ STATE: "${l.name}" stored=${l.city},${l.state} → coords in ${gCity},${gState}`);
  }
  if (done % 100 === 0) {
    console.log(`[${new Date().toISOString()}] ${done}/${rows.length} | state-mismatches=${stateMismatch.length} | errs=${errs}`);
    fs.writeFileSync('scripts/geo_audit_state_mismatch.json', JSON.stringify(stateMismatch,null,2));
  }
}

fs.writeFileSync('scripts/geo_audit_state_mismatch.json', JSON.stringify(stateMismatch,null,2));
console.log(`\n[${new Date().toISOString()}] DONE. audited=${done} errors=${errs}`);
console.log(`STATE mismatches (wrong-state coords): ${stateMismatch.length}`);
console.log(`Wrote scripts/geo_audit_state_mismatch.json`);
