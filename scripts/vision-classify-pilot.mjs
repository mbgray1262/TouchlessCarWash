/**
 * VISION PILOT — dual purpose:
 *   (1) Photo selection: pick the best equipment-in-bay + facility-closeup shots, reject junk.
 *   (2) Wash-type classification: touchless / self-serve / friction-tunnel / hand-wash / detailing.
 *
 * Validates against known-type sample listings (curated touchless, tagged self-serve, Google-labeled
 * detailing) so we can measure agreement BEFORE scaling. Uses raw fetch to the Anthropic API (matches
 * existing scripts). Model: claude-opus-4-8 (best quality; pilot cost is a few dollars).
 *
 * Run:  node scripts/vision-classify-pilot.mjs
 * Output: console summary + scripts/_vision_pilot_report.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-opus-4-8';
const MAX_IMAGES = 8;
const MIN_BYTES = 9000;          // free pre-filter: drop tiny icons/logos
const FETCH_TIMEOUT_MS = 9000;

const RUBRIC = `You are the photo editor and classifier for a car-wash directory. You are given a set of candidate images for ONE car-wash location, each labeled "Image N". Do TWO jobs.

JOB 1 — SELECT THE BEST PHOTOS.
Goal: identify at least two excellent images — (A) EQUIPMENT INSIDE THE WASH BAY (the wash arch/gantry, in-bay automatic machine, spray nozzles, tunnel interior, brushes/mitters, or self-serve wand bays), and (B) a clear CLOSE-UP OF THE FACILITY (the wash building/canopy/signage, framed so the wash is the clear subject). Additional relevant shots are welcome (clean bay interiors, vacuum stations, menus/pricing signage).
REJECT as junk: a specific car/vehicle as the subject; dashboards or car interiors; distant/aerial/streetscape shots where the wash is tiny; highway/road/parking-lot scenes; gas pumps as the subject; convenience-store food/snacks/drinks; company logos, banners, clip-art or marketing graphics; maps; screenshots; stock photos; blurry or very low-quality images.
For EACH image return: index, category (one of: equipment_bay, facility_closeup, facility_distant, bay_interior, amenity, vehicle, car_interior, street_or_aerial, gas_pump, food_or_store, logo_or_graphic, map_or_screenshot, other), quality (1-5), keep (true/false), reason (short).
Then choose the final picks.

JOB 2 — CLASSIFY WASH TYPE(S).
A location can offer MULTIPLE types (not exclusive). From the equipment and signage visible, decide which of these it offers:
- "touchless": touch-free / laser in-bay automatic — overhead arch with high-pressure nozzles, NO brushes; "Touch Free"/"LaserWash"/"Touchless" signage.
- "friction_tunnel": conveyor tunnel or soft-touch in-bay using cloth/foam/brushes/mitters; "Tunnel"/"Express"/"Soft Touch" signage.
- "self_serve": self-service wand bays — open bay with a hand-held spray wand, coin/credit box, "Self Serve"/"$ per minute" signage.
- "hand_wash": staff washing vehicles by hand.
- "detailing": interior/exterior detailing service (buffing, polishing, vacuuming as the core service).
If the images don't show enough to tell, say so and lower confidence.

Return ONLY a JSON object, no prose, in EXACTLY this shape:
{
  "images": [ { "index": 0, "category": "...", "quality": 3, "keep": true, "reason": "..." } ],
  "selection": { "equipment_pick": 0, "facility_pick": 2, "extras": [4], "confidence": 0.0, "needs_human": false, "note": "..." },
  "wash_types": { "offers": ["touchless"], "primary": "touchless", "confidence": 0.0, "evidence": "..." }
}
equipment_pick / facility_pick are image indexes or null if none qualifies. Set needs_human=true if you cannot find a good equipment OR a good facility shot, or overall confidence is low.`;

function extJson(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } }

async function grabImage(url) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES) return null;
    let media = ct.startsWith('image/') ? ct : null;
    if (!media) { const m = url.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/); if (m) media = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]); }
    if (!media || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media)) return null;
    return { media, data: buf.toString('base64'), bytes: buf.length, url };
  } catch { return null; }
}

async function analyze(listing) {
  const urls = [...new Set([...(Array.isArray(listing.photos) ? listing.photos : []),
    ...(Array.isArray(listing.website_photos) ? listing.website_photos : [])].filter(u => typeof u === 'string' && u.startsWith('http')))];
  const imgs = [];
  for (const u of urls) { if (imgs.length >= MAX_IMAGES) break; const g = await grabImage(u); if (g) imgs.push(g); }
  if (!imgs.length) return { error: 'no valid images', candidateUrls: urls.length };

  const content = [{ type: 'text', text: `${RUBRIC}\n\nLocation name: ${listing.name}\nCandidate images follow.` }];
  imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.media, data: g.data } }); });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) return { error: `API ${res.status}: ${(await res.text()).slice(0, 200)}`, imagesUsed: imgs.length };
  const j = await res.json();
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const parsed = extJson(text);
  return { imagesUsed: imgs.length, candidateUrls: urls.length, urls: imgs.map(g => g.url), parsed, raw: parsed ? undefined : text.slice(0, 300),
    usage: j.usage };
}

async function main() {
  const sample = [];
  const push = (rows, expect, group) => (rows || []).forEach(r => sample.push({ ...r, __expect: expect, __group: group }));

  // curated touchless (known type = touchless)
  push((await sb.from('listings').select('id,name,photos,website_photos').eq('is_touchless', true).eq('is_approved', true).not('is_self_service', 'is', true).not('photos', 'is', null).limit(8)).data, 'touchless', 'curated-touchless');
  // tagged self-serve (mixed; expect self_serve present)
  push((await sb.from('listings').select('id,name,photos,website_photos').eq('is_self_service', true).eq('is_approved', true).not('photos', 'is', null).limit(4)).data, 'self_serve', 'tagged-selfserve');
  // detailing (Google-labeled)
  { const { data } = await sb.from('listings').select('id,name,photos,website_photos').eq('google_category', 'Car detailing service').not('website_photos', 'is', null).limit(60);
    push((data || []).filter(l => Array.isArray(l.website_photos) && l.website_photos.length >= 4).slice(0, 4), 'detailing', 'google-detailing'); }
  // generic car wash with messy website_photos (no ground truth — selection stress test)
  { const { data } = await sb.from('listings').select('id,name,photos,website_photos').eq('google_category', 'Car wash').not('website_photos', 'is', null).limit(120);
    push((data || []).filter(l => Array.isArray(l.website_photos) && l.website_photos.length >= 6).slice(0, 4), null, 'generic-messy'); }

  console.log(`Analyzing ${sample.length} listings with ${MODEL}...\n`);
  const report = []; let classCorrect = 0, classTotal = 0, selEquip = 0, selFacility = 0, done = 0, totIn = 0, totOut = 0;
  for (const l of sample) {
    const r = await analyze(l);
    done++;
    if (r.error) { console.log(`✗ ${l.name} [${l.__group}] — ${r.error}`); report.push({ name: l.name, group: l.__group, error: r.error }); continue; }
    if (r.usage) { totIn += r.usage.input_tokens || 0; totOut += r.usage.output_tokens || 0; }
    const p = r.parsed || {};
    const wt = p.wash_types || {}; const sel = p.selection || {};
    const offers = (wt.offers || []).join(',');
    const match = l.__expect ? (wt.offers || []).includes(l.__expect) : null;
    if (l.__expect) { classTotal++; if (match) classCorrect++; }
    if (sel.equipment_pick != null) selEquip++;
    if (sel.facility_pick != null) selFacility++;
    const kept = (p.images || []).filter(i => i.keep).length; const rej = (p.images || []).length - kept;
    const mark = l.__expect ? (match ? '✓' : '✗ MISS') : '·';
    console.log(`${mark} ${l.name}  [${l.__group}]`);
    console.log(`     type → offers:[${offers}] primary:${wt.primary} conf:${wt.confidence}` + (l.__expect ? `  (expected: ${l.__expect})` : ''));
    console.log(`     photos → ${r.imagesUsed} candidates | kept ${kept}, rejected ${rej} | equip:#${sel.equipment_pick ?? '—'} facility:#${sel.facility_pick ?? '—'} conf:${sel.confidence} needs_human:${sel.needs_human}`);
    report.push({ id: l.id, name: l.name, group: l.__group, expect: l.__expect, classifiedOffers: wt.offers, classMatch: match, selection: sel, images: p.images, urls: r.urls, evidence: wt.evidence });
  }

  console.log('\n==================== PILOT RESULTS ====================');
  console.log(`Wash-type classification agreement (known-type listings): ${classCorrect}/${classTotal}` + (classTotal ? ` = ${(100 * classCorrect / classTotal).toFixed(0)}%` : ''));
  console.log(`Photo selection: found an equipment shot in ${selEquip}/${done}, a facility shot in ${selFacility}/${done}`);
  console.log(`Approx cost: input ${totIn.toLocaleString()} tok, output ${totOut.toLocaleString()} tok  (~$${((totIn * 5 + totOut * 25) / 1e6).toFixed(2)} on Opus 4.8)`);
  writeFileSync('scripts/_vision_pilot_report.json', JSON.stringify(report, null, 2));
  console.log('\nFull per-listing report (with image URLs + reasons): scripts/_vision_pilot_report.json');
}
main();
