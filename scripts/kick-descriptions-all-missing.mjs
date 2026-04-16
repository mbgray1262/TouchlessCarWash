#!/usr/bin/env node
/**
 * Kick off Gemini description generation for ALL is_touchless=true
 * listings missing a description. Picks up today's 79 promotions + 94
 * new imports + anything else missing.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Start a job without listing_ids — the edge function naturally picks up
// all is_touchless=true listings with description=null when regenerate
// is false (default). Much simpler than passing 500+ UUIDs in a URL.
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-descriptions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  body: JSON.stringify({ action: 'start' })  // no listing_ids → picks up all is_touchless=true with description=null
});
const j = await res.json();
console.log('start response:', j);
