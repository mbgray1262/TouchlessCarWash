#!/usr/bin/env node
/**
 * EMERGENCY REVERT — the closed-detector dry-run incorrectly marked 20
 * listings as MISSING because "not found" in Google Maps HTML caused
 * false positives. Revert them to OPERATIONAL + is_approved=true.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const audit = JSON.parse(readFileSync('scripts/discovery-output/closed-detection-audit.json', 'utf8'));
const ids = audit.changes.map(c => c.id);
console.log(`Reverting ${ids.length} listings incorrectly marked as MISSING...`);

const { error } = await sb.from('listings').update({
  business_status: 'OPERATIONAL',
  is_approved: true,
  crawl_notes: 'Reverted false MISSING detection from Apr 16 dry-run (pattern was too broad, matched "not found" in unrelated HTML).',
}).in('id', ids);

if (error) { console.error(error); process.exit(1); }
console.log(`Reverted: ${ids.length}`);
