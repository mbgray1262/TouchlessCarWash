/**
 * FIRECRAWL → CLASSIFY → SELECT proof.
 * For untyped listings that have a website but no stored text, Firecrawl the site,
 * classify wash type from the text (Claude), and pick photos from the operator's
 * own images (Claude vision). Serial scrapes (free-plan max concurrency 2).
 *
 * Run: node scripts/firecrawl-proof.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY, FC_KEY = env.FIRECRAWL_API_KEY, MODEL = 'claude-opus-4-8';
const MAX_IMAGES = 8, MIN_BYTES = 9000;

const extJson = s => { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function firecrawl(url) {
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST', headers: { Authorization: `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'html'], onlyMainContent: false, timeout: 25000 }),
    });
    const j = await r.json();
    if (!r.ok || !j.success) return { error: `FC ${r.status}: ${JSON.stringify(j.error || j).slice(0, 120)}` };
    return { markdown: j.data?.markdown || '', html: j.data?.html || '' };
  } catch (e) { return { error: 'FC ' + e.message }; }
}

function imagesFromHtml(html, base) {
  const out = []; const seen = new Set();
  const junk = /logo|icon|sprite|pixel|avatar|badge|\.svg|facebook|instagram|twitter|linkedin|yelp|tripadvisor|gravatar|emoji|flag-/i;
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    let src = m[1]; if (!src || src.startsWith('data:')) continue;
    try { src = new URL(src, base).href; } catch { continue; }
    if (junk.test(src) || seen.has(src)) continue; seen.add(src); out.push(src);
  }
  return out;
}

async function grabImage(url) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t); if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < MIN_BYTES) return null;
    let media = ct.startsWith('image/') ? ct : (url.toLowerCase().match(/\.(jpe?g|png|webp|gif)(\?|$)/) ? 'image/' + RegExp.$1.replace('jpg', 'jpeg') : null);
    // sniff magic bytes to avoid media_type mismatch (fixes the pilot's 400s)
    if (buf.slice(0, 3).toString('hex') === 'ffd8ff') media = 'image/jpeg';
    else if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') media = 'image/png';
    else if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') media = 'image/webp';
    else if (buf.slice(0, 3).toString('ascii') === 'GIF') media = 'image/gif';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media)) return null;
    return { media, data: buf.toString('base64'), url };
  } catch { return null; }
}

async function claude(content, maxTok = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTok, thinking: { type: 'disabled' }, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json();
  if (!r.ok) return { error: `API ${r.status}: ${JSON.stringify(j).slice(0, 150)}` };
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { json: extJson(text), usage: j.usage };
}

const TEXT_PROMPT = `Classify a car wash from its website text. Which wash types does this location OFFER (can be multiple)?
- "touchless": touch-free/laser in-bay automatic, NO brushes
- "friction_tunnel": conveyor tunnel or soft-touch with cloth/foam/brushes
- "self_serve": self-service wand bays (coin/credit, $ per minute)
- "hand_wash": staff hand-wash
- "detailing": detailing service
Return ONLY JSON: {"offers":[],"primary":"","confidence":0.0,"evidence":"short quote or reason"}. If the text doesn't say, use low confidence.
--- WEBSITE TEXT ---
`;

const VISION_PROMPT = `You are a car-wash directory photo editor. Given candidate images (labeled "Image N") for ONE location, pick the best EQUIPMENT-IN-BAY shot and the best FACILITY-CLOSEUP shot; reject junk (cars as subject, car interiors, distant/street/aerial, gas pumps, store food, logos/graphics, maps, screenshots, blurry, duplicates).
Return ONLY JSON: {"images":[{"index":0,"category":"equipment_bay|facility_closeup|facility_distant|bay_interior|amenity|vehicle|car_interior|street_or_aerial|gas_pump|food_or_store|logo_or_graphic|map_or_screenshot|other","quality":1,"keep":true,"reason":""}],"selection":{"equipment_pick":null,"facility_pick":null,"extras":[],"confidence":0.0,"needs_human":false}}`;

async function main() {
  const { data: rows } = await sb.from('listings')
    .select('id,name,website,review_count')
    .eq('google_category', 'Car wash').is('parent_chain', null)   // real, independent car washes
    .ilike('website', '%wash%')                                    // domain looks like an independent car-wash site
    .not('website', 'ilike', '%take5%').not('website', 'ilike', '%mistercarwash%').not('website', 'ilike', '%quickquack%')
    .not('is_touchless', 'is', true).not('is_self_service', 'is', true)
    .not('google_subtypes', 'ilike', '%self serv%').not('google_subtypes', 'ilike', '%touchless%')
    .not('website', 'is', null).is('crawl_snapshot', null)
    .gte('review_count', 15)
    .order('review_count', { ascending: false, nullsFirst: false }).limit(10);

  console.log(`Firecrawl → classify → select on ${rows.length} untyped-with-website listings\n`);
  const report = []; let fcCredits = 0, cIn = 0, cOut = 0;

  for (const l of rows) {
    process.stdout.write(`• ${l.name}\n   scraping ${String(l.website).slice(0, 60)} ... `);
    const fc = await firecrawl(l.website); fcCredits++;
    if (fc.error) { console.log(fc.error); report.push({ name: l.name, error: fc.error }); continue; }
    const imgUrls = imagesFromHtml(fc.html, l.website);
    console.log(`ok (${fc.markdown.length} chars text, ${imgUrls.length} images on page)`);

    // text classification
    const tc = await claude([{ type: 'text', text: TEXT_PROMPT + fc.markdown.slice(0, 7000) }], 700);
    if (tc.usage) { cIn += tc.usage.input_tokens; cOut += tc.usage.output_tokens; }
    const t = tc.json || {};
    console.log(`   TEXT → offers:[${(t.offers || []).join(',')}] primary:${t.primary} conf:${t.confidence}  ("${(t.evidence || '').slice(0, 90)}")`);

    // photo selection from operator images
    const imgs = []; for (const u of imgUrls) { if (imgs.length >= MAX_IMAGES) break; const g = await grabImage(u); if (g) imgs.push(g); }
    let sel = {};
    if (imgs.length) {
      const content = [{ type: 'text', text: `${VISION_PROMPT}\nLocation: ${l.name}` }];
      imgs.forEach((g, i) => { content.push({ type: 'text', text: `Image ${i}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: g.media, data: g.data } }); });
      const vc = await claude(content, 1500);
      if (vc.usage) { cIn += vc.usage.input_tokens; cOut += vc.usage.output_tokens; }
      sel = (vc.json || {}).selection || {};
      const kept = ((vc.json || {}).images || []).filter(i => i.keep).length;
      console.log(`   PHOTOS → ${imgs.length} valid | kept ${kept} | equip:#${sel.equipment_pick ?? '—'} facility:#${sel.facility_pick ?? '—'} conf:${sel.confidence} needs_human:${sel.needs_human}`);
      report.push({ id: l.id, name: l.name, website: l.website, textClass: t, validImages: imgs.map(g => g.url), photoPick: sel, imageDetail: (vc.json || {}).images });
    } else {
      console.log(`   PHOTOS → 0 usable images extracted`);
      report.push({ id: l.id, name: l.name, website: l.website, textClass: t, validImages: [], note: 'no usable images' });
    }
    console.log('');
  }

  console.log('==================== PROOF SUMMARY ====================');
  console.log(`Firecrawl credits used: ~${fcCredits}`);
  console.log(`Claude tokens: ${cIn.toLocaleString()} in / ${cOut.toLocaleString()} out  (~$${((cIn * 5 + cOut * 25) / 1e6).toFixed(2)} on Opus 4.8)`);
  const typed = report.filter(r => r.textClass && (r.textClass.offers || []).length && (r.textClass.confidence || 0) >= 0.5).length;
  console.log(`Confidently classified from website text: ${typed}/${rows.length}`);
  writeFileSync('scripts/_firecrawl_proof_report.json', JSON.stringify(report, null, 2));
  console.log('Full report: scripts/_firecrawl_proof_report.json');
}
main();
