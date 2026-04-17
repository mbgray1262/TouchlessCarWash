#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const all = [];
for (let o=0; o<10000; o+=1000) {
  const { data } = await sb.from('ai_audits')
    .select('listing_id, verdict, confidence, hero_image_quality, hero_image_recommendation, flags, reasoning')
    .range(o, o+999);
  if (!data || !data.length) break;
  all.push(...data);
  if (data.length<1000) break;
}
console.log(`Total audits: ${all.length}\n`);

const byV = {};
all.forEach(a => byV[a.verdict||'null'] = (byV[a.verdict||'null']||0)+1);
console.log('Verdict distribution:');
Object.entries(byV).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`  ${k.padEnd(22)} ${n}`));

// High-confidence NOT_TOUCHLESS — safe to revert
const highNot = all.filter(a => a.verdict === 'NOT_TOUCHLESS' && (a.confidence||0) >= 0.75);
console.log(`\nNOT_TOUCHLESS with confidence >= 0.75: ${highNot.length}`);
const lowNot = all.filter(a => a.verdict === 'NOT_TOUCHLESS' && (a.confidence||0) < 0.75);
console.log(`NOT_TOUCHLESS with confidence < 0.75: ${lowNot.length}`);

// Hero image quality
const byH = {};
all.forEach(a => byH[a.hero_image_quality||'null'] = (byH[a.hero_image_quality||'null']||0)+1);
console.log('\nHero image quality:');
Object.entries(byH).sort((a,b)=>b[1]-a[1]).forEach(([k,n])=>console.log(`  ${k.padEnd(12)} ${n}`));

// Persist lists for follow-on scripts
import('node:fs').then(fs => {
  fs.writeFileSync('scripts/out/audit-not-touchless-high.json', JSON.stringify(highNot, null, 2));
  fs.writeFileSync('scripts/out/audit-not-touchless-low.json', JSON.stringify(lowNot, null, 2));
  const badHero = all.filter(a => a.hero_image_quality === 'BAD');
  fs.writeFileSync('scripts/out/audit-bad-hero.json', JSON.stringify(badHero, null, 2));
  console.log(`\nWrote: audit-not-touchless-high.json (${highNot.length}), audit-not-touchless-low.json (${lowNot.length}), audit-bad-hero.json (${badHero.length})`);
});
