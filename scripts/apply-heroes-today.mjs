import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STORAGE = 'https://gteqijdpqjmgxfnyuhvy.supabase.co/storage/v1/object/public/listing-photos/chain-brands';
const file = readFileSync('lib/chain-brand-images.ts', 'utf8');
// Parse chain → first URL
const CHAIN_IMAGES = {};
const lines = file.split('\n');
let key = null, urls = [];
const flush = () => { if (key && urls.length) CHAIN_IMAGES[key] = urls.slice(); key = null; urls = []; };
for (const line of lines) {
  const m = line.match(/^\s*['"]([^'"]+)['"]\s*:\s*(.*)$/);
  if (m) {
    flush();
    key = m[1];
    const extracted = line.match(/https?:\/\/[^\s'"`,\]]+|`\$\{STORAGE\}\/[^`]+`/g) || [];
    for (let u of extracted) { u = u.replace(/`\$\{STORAGE\}/g, STORAGE).replace(/`/g, ''); urls.push(u); }
  } else if (key) {
    const extracted = line.match(/https?:\/\/[^\s'"`,\]]+|`\$\{STORAGE\}\/[^`]+`/g) || [];
    for (let u of extracted) { u = u.replace(/`\$\{STORAGE\}/g, STORAGE).replace(/`/g, ''); urls.push(u); }
    if (line.trim().endsWith('],') || line.includes('};')) flush();
  }
}
flush();
for (const k of Object.keys(CHAIN_IMAGES)) CHAIN_IMAGES[k] = CHAIN_IMAGES[k].map(u => u.replace(/[,'"`\]]+$/,'')).filter(u => u.startsWith('http'));
console.log(`Chain images: ${Object.keys(CHAIN_IMAGES).length}`);

// Today's listings missing hero
const sources = ['promoted_apr16_google_inurl', 'promoted_apr16_yelp_review_text', 'promoted_apr16_inurl_v2'];
const { data } = await sb.from('listings')
  .select('id, name, parent_chain')
  .in('classification_source', sources)
  .is('hero_image', null)
  .not('parent_chain','is',null);

function hash(s) { let h=0; for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }
let applied = 0;
for (const l of data || []) {
  const imgs = CHAIN_IMAGES[l.parent_chain];
  if (!imgs || imgs.length === 0) continue;
  const url = imgs[hash(l.id) % imgs.length];
  const { error } = await sb.from('listings').update({ hero_image: url, hero_image_source: 'chain_brand' }).eq('id', l.id);
  if (!error) applied++;
}
console.log(`Chain-brand heroes applied: ${applied}`);

// Also fallback to google_photo_url or street_view_url for those without
const { data: stillNoHero } = await sb.from('listings')
  .select('id, name, google_photo_url, street_view_url')
  .in('classification_source', sources)
  .is('hero_image', null);
let fallback = 0;
for (const l of stillNoHero || []) {
  const url = l.google_photo_url || l.street_view_url;
  if (!url) continue;
  const src = l.google_photo_url ? 'google' : 'street_view';
  await sb.from('listings').update({ hero_image: url, hero_image_source: src }).eq('id', l.id);
  fallback++;
}
console.log(`Fallback heroes applied: ${fallback}`);
