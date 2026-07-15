/**
 * Resolve the photo-autopilot's exceptions — the listings it refused to decide.
 *
 * These are LIVE listings that already have a hero. Nothing is visibly broken; the autopilot
 * just wasn't confident. Two flags:
 *   autopilot_name_mismatch — it read the signage and it didn't match the listing name.
 *   autopilot_exception     — no candidate clearly won / confidence below the bar.
 *
 * Re-running the autopilot on these would just re-roll the same dice with the same prompt.
 * The question that actually resolves them is different, so this asks it directly:
 *
 *   name_mismatch → is the name a PLAUSIBLE VARIANT of the signage, or a DIFFERENT BUSINESS?
 *     Most are benign: "Touchless Loving Car Wash" is signed "TLC Car Wash"; "The Car Wash,
 *     LLC" never puts LLC on a building; "Self Service Car Wash and TouchFree automatic" is a
 *     description Google stored as a name. But some are the Weiss-Guys/Elephant-Wash case —
 *     a hero showing the business that USED to be there, or the one next door. Only the
 *     second kind is a defect.
 *   exception → is the existing hero actually acceptable, or genuinely poor?
 *
 * Street View (official outdoor imagery, dated, aimed at the building) is the anchor: it is
 * the only source that reliably shows what is standing at that address NOW.
 *
 *   node scripts/resolve-photo-exceptions.mjs            # dry run
 *   node scripts/resolve-photo-exceptions.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import sharp from 'sharp';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GKEY = env.GOOGLE_PLACES_API_KEY, AKEY = env.ANTHROPIC_API_KEY;
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Shared budget ledger with photo-autopilot — same $200 cap Michael set.
const LEDGER = 'scripts/_autopilot_spend.json', CAP = 200;
let spend = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')).usd || 0) : 0;
const TOK = { in: 2 / 1e6, out: 10 / 1e6 };          // Sonnet 5 intro rates
let tokIn = 0, tokOut = 0;
const saveSpend = () => writeFileSync(LEDGER, JSON.stringify({ usd: Number(spend.toFixed(4)), updated: new Date().toISOString() }, null, 2));

const dl = async u => { for (let a = 0; a < 3; a++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch {} await sleep(500 * (a + 1)); } return null; };
const b64 = async b => { try { return (await sharp(b).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 74 }).toBuffer()).toString('base64'); } catch { return null; } };

const bearing = (f, t) => { const R = d => d * Math.PI / 180, D = r => r * 180 / Math.PI;
  const y = Math.sin(R(t.lng - f.lng)) * Math.cos(R(t.lat));
  const x = Math.cos(R(f.lat)) * Math.sin(R(t.lat)) - Math.sin(R(f.lat)) * Math.cos(R(t.lat)) * Math.cos(R(t.lng - f.lng));
  return (D(Math.atan2(y, x)) + 360) % 360; };

async function streetView(lat, lng) {
  if (lat == null || lng == null) return null;
  // Metadata is FREE and gives the capture date + the pano's own position, so the camera can
  // be aimed at the building. source=outdoor forces official Google car imagery — the default
  // returns stale user photospheres (a 2017 one showed the previous owner's branding).
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=120&key=${GKEY}`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (j.status !== 'OK') return null;
    const h = bearing(j.location, { lat, lng });
    const img = await dl(`https://maps.googleapis.com/maps/api/streetview?size=640x480&pano=${j.pano_id}&heading=${h.toFixed(0)}&fov=80&pitch=2&key=${GKEY}`);
    spend += 0.007;
    return img ? { buf: img, date: j.date } : null;
  } catch { return null; }
}

async function ask(content) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1500, messages: [{ role: 'user', content }] }) }); // never send temperature (deprecated → 400)
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(2 ** a * 2, 20) * 1000); continue; }
      if (!r.ok) { await sleep(1200); continue; }
      const j = await r.json();
      const u = j?.usage; if (u) { tokIn += u.input_tokens || 0; tokOut += u.output_tokens || 0; spend += (u.input_tokens || 0) * TOK.in + (u.output_tokens || 0) * TOK.out; }
      if (j?.stop_reason === 'max_tokens') return null;
      // Thinking blocks come FIRST in content[] on a prompt like this — content[0] is not the
      // text. Concatenate every text block or the JSON is silently missed.
      const t = (j?.content || []).filter(c => c?.type === 'text').map(c => c.text || '').join('');
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s < 0 || e < 0) { await sleep(800); continue; }
      try { return JSON.parse(t.slice(s, e + 1)); } catch { await sleep(700); }
    } catch { await sleep(1200 * (a + 1)); }
  }
  return null;
}

const { data: rows, error } = await sb.from('listings')
  .select('id,name,city,state,address,latitude,longitude,hero_image,photos,self_service_source')
  .in('self_service_source', ['autopilot_exception', 'autopilot_name_mismatch'])
  .eq('is_approved', true).not('self_service_reviewed_at', 'is', null).order('id');
if (error) { console.error('⛔ query failed:', error.message); process.exit(1); }

console.log(`${rows.length} LIVE exceptions | spend $${spend.toFixed(2)}/$${CAP} | ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

const out = { confirmed: [], wrong_business: [], poor_hero: [], unresolved: [] };
for (const l of rows) {
  if (spend >= CAP) { console.log('⛔ budget cap reached — stopping cleanly.'); break; }
  const heroBuf = l.hero_image ? await dl(l.hero_image) : null;
  if (!heroBuf) { out.unresolved.push({ ...l, why: 'hero image unreachable' }); console.log(`• ${l.name} — hero unreachable`); continue; }
  const sv = await streetView(l.latitude, l.longitude);
  const hb = await b64(heroBuf), svb = sv ? await b64(sv.buf) : null;
  if (!hb) { out.unresolved.push({ ...l, why: 'hero unreadable' }); continue; }

  const content = [{ type: 'text', text:
`Listing: "${l.name}" — ${l.address}, ${l.city}, ${l.state}

IMAGE 1 = the hero photo currently published on our directory for this listing.
${svb ? `IMAGE 2 = official Google Street View of this address, captured ${sv.date}. This is ground truth for what stands here NOW.` : 'No Street View available — judge from the hero alone.'}

Our automation flagged this listing because the signage it read did not match the listing name. Most such mismatches are HARMLESS — the listing name is a Google Maps artifact, not what's on the building:
  • an abbreviation ("Touchless Loving Car Wash" is signed "TLC Car Wash")
  • a legal suffix nobody paints on a wall ("The Car Wash, LLC")
  • a description Google stored as a name ("Self Service Car Wash and TouchFree automatic")
  • a chain's location suffix ("... - Easton II")
A mismatch is only a REAL DEFECT if the hero shows a DIFFERENT BUSINESS — e.g. the wash that used to occupy the site under a former brand, or a neighbouring business.

Decide:
1. same_business — the hero plausibly shows this business (name is a variant/abbreviation/artifact of the signage, or signage is absent/unreadable but the building matches Street View). This is the common case.
2. different_business — the hero clearly shows a DIFFERENT, named business than the one at this address per Street View. A real defect.
3. poor_hero — right business, but the photo is genuinely bad as a hero: blurry, dark, badly framed, a close-up of a sign/price board, an interior, or not a car wash facility.
4. unclear — you cannot tell.

Return ONLY JSON, nothing else:
{"verdict":"same_business|different_business|poor_hero|unclear","signage_read":"<what the hero's sign says, or 'none visible'>","why":"<12 words max>","confidence":0.0-1.0}` },
    { type: 'text', text: 'IMAGE 1 — current hero:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: hb } }];
  if (svb) { content.push({ type: 'text', text: `IMAGE 2 — Street View ${sv.date}:` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: svb } }); }

  const v = await ask(content); await sleep(300);
  if (!v?.verdict) { out.unresolved.push({ ...l, why: 'vision inconclusive' }); console.log(`• ${l.name} — vision inconclusive`); continue; }
  const tag = { same_business: 'confirmed', different_business: 'wrong_business', poor_hero: 'poor_hero', unclear: 'unresolved' }[v.verdict] || 'unresolved';
  out[tag].push({ id: l.id, name: l.name, city: l.city, state: l.state, sign: v.signage_read, why: v.why, conf: v.confidence, sv: sv?.date });
  const icon = { confirmed: '✅', wrong_business: '🚨', poor_hero: '⚠️', unresolved: '❓' }[tag];
  console.log(`${icon} ${l.name} (${l.city}) — ${v.verdict} | sign="${v.signage_read}" | ${v.why}`);
  if (APPLY && tag === 'confirmed') await sb.from('listings').update({ self_service_source: 'autopilot_ok' }).eq('id', l.id);
  saveSpend();
}
saveSpend();
const stamp = Date.now();
writeFileSync(`scripts/_exceptions_resolved_${stamp}.json`, JSON.stringify(out, null, 2));
console.log(`\n==================== EXCEPTIONS ${APPLY ? 'RESOLVED' : 'DRY RUN'} ====================`);
console.log(`✅ confirmed (flag cleared) .... ${out.confirmed.length}`);
console.log(`🚨 WRONG BUSINESS — real defect  ${out.wrong_business.length}`);
console.log(`⚠️  poor hero — needs a better one ${out.poor_hero.length}`);
console.log(`❓ still unclear ............... ${out.unresolved.length}`);
console.log(`SPEND: $${spend.toFixed(2)} / $${CAP}  (${(tokIn / 1000).toFixed(0)}k in + ${(tokOut / 1000).toFixed(0)}k out)`);
console.log(`detail: scripts/_exceptions_resolved_${stamp}.json`);
