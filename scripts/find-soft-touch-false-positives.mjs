import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Pull all approved touchless listings with crawl_snapshot
const all = [];
for (let o=0; o<10000; o+=500) {
  const { data } = await sb.from('listings')
    .select('id, name, city, state, website, crawl_snapshot, touchless_verified')
    .eq('is_touchless', true).eq('is_approved', true)
    .not('crawl_snapshot','is',null)
    .range(o, o+499);
  if (!data || !data.length) break;
  all.push(...data);
  if (data.length<500) break;
}
console.log(`Approved touchless with crawl_snapshot: ${all.length}`);

// Red-flag patterns
const FLAGS = [
  { pat: /closed[- ]?cell\s+foam/i, label: 'closed-cell foam' },
  { pat: /foam\s+brush(es)?/i, label: 'foam brushes' },
  { pat: /soft[- ]?touch\s+(wash|clean|bay|system|facility)/i, label: 'soft-touch wash/clean' },
  { pat: /soft[- ]?cloth\s+(wash|tunnel)/i, label: 'soft-cloth wash/tunnel' },
  { pat: /neoglide\s+foam/i, label: 'neoglide foam' },
  { pat: /rotating\s+brush(es)?/i, label: 'rotating brushes' },
  { pat: /spinning\s+brush(es)?/i, label: 'spinning brushes' },
  { pat: /mitter\s+(curtain|drape)/i, label: 'mitter curtain' },
  { pat: /foam\s+(wrap|curtain)/i, label: 'foam wrap/curtain' },
];

const negPat = /(not|no|isn['\u2019]?t|without)\s+.{0,15}(touch[- ]?free|touchless|brush|cloth|foam)/i;

const suspects = [];
for (const l of all) {
  const md = l.crawl_snapshot?.markdown || '';
  if (!md) continue;
  // Filter to snapshots from the business's OWN website (not third-party like our comparison blog)
  const flags_hit = [];
  for (const f of FLAGS) {
    if (f.pat.test(md)) flags_hit.push(f.label);
  }
  // Also require "soft touch" to appear NOT in a negation context
  if (flags_hit.length === 0) continue;
  // Exclude if the page also explicitly says touchless/touch-free (mixed-facility case — OK to keep)
  const hasPositive = /touch[- ]?(less|free)\s+(car\s+)?wash|touchless\s+bay|our\s+touch[- ]?free/i.test(md);
  suspects.push({ l, flags_hit, hasPositive });
}
console.log(`\nSuspects: ${suspects.length}`);
const pureContra = suspects.filter(s => !s.hasPositive);
console.log(`  No positive touchless signal at all: ${pureContra.length}  (likely pure false positive)`);
console.log(`  Mixed signals (has both): ${suspects.length - pureContra.length}`);

// Sample pure contra
console.log(`\nSample PURE contra (strong revert candidates):`);
for (const s of pureContra.slice(0, 20)) {
  console.log(`  ${s.l.name} | ${s.l.city}, ${s.l.state} | flags: ${s.flags_hit.join(',')}`);
}

// Save to file for review/action
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/fp-suspects.json', JSON.stringify({
  pureContra: pureContra.map(s => ({ id: s.l.id, name: s.l.name, city: s.l.city, state: s.l.state, website: s.l.website, verified_by: s.l.touchless_verified, flags: s.flags_hit })),
  mixed: suspects.filter(s => s.hasPositive).map(s => ({ id: s.l.id, name: s.l.name, city: s.l.city, state: s.l.state, website: s.l.website, flags: s.flags_hit }))
}, null, 2));
console.log('\nWrote /tmp/fp-suspects.json');
