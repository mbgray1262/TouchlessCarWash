#!/usr/bin/env node
/**
 * Kick off description generation for today's promoted listings that still
 * lack a description. Uses the edge function with Gemini 2.5 Flash.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data, error } = await sb.from('listings')
  .select('id, name, city, state, classification_source')
  .like('classification_source', '%promoted_apr16%')
  .eq('is_touchless', true)
  .is('description', null);

if (error) { console.error(error); process.exit(1); }
console.log(`${data.length} apr16-promoted listings missing descriptions`);
if (data.length === 0) { console.log('Nothing to do'); process.exit(0); }

const ids = data.map(l => l.id);
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-descriptions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  body: JSON.stringify({ action: 'start', listing_ids: ids })
});
const j = await res.json();
console.log('start response:', j);
