#!/usr/bin/env node
/**
 * Sets the featured_image_url for the best-touchless-car-wash-subscriptions-2026
 * blog post. Free Unsplash CDN image (no API key required).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(__dirname, '../.env.local'),
  '/Users/michaelgray/Projects/TouchlessCarWash/.env.local',
];
const envPath = envCandidates.find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
const env = readFileSync(envPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Silver Audi RS7 against mountain backdrop — clean, premium, conveys the
// "car worth keeping pristine" aspirational angle for unlimited wash plans.
const heroUrl = 'https://images.unsplash.com/photo-1616422285623-13ff0162193c?w=1200&h=630&fit=crop&q=80';

const { error } = await sb.from('blog_posts')
  .update({ featured_image_url: heroUrl })
  .eq('slug', 'best-touchless-car-wash-subscriptions-2026');

if (error) { console.error('Update failed:', error); process.exit(1); }
console.log('Set hero image:', heroUrl);
