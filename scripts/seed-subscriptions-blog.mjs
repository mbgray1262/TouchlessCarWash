#!/usr/bin/env node
/**
 * Seeds the `best-touchless-car-wash-subscriptions-2026` blog_posts row.
 * The actual content is generated dynamically by lib/dynamic-blog-subscriptions.ts
 * at request time, so the `content` column is just a placeholder.
 *
 * Usage: node scripts/seed-subscriptions-blog.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Try worktree .env.local first, then fall back to repo root
const candidates = [
  resolve(__dirname, '../.env.local'),
  resolve(__dirname, '../../../../.env.local'),
  '/Users/michaelgray/Projects/TouchlessCarWash/.env.local',
];
const envPath = candidates.find(p => { try { readFileSync(p, 'utf8'); return true; } catch { return false; } });
if (!envPath) { console.error('No .env.local found'); process.exit(1); }
const env = readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l && !l.startsWith('#'))
  .reduce((acc, line) => {
    const [k, ...rest] = line.split('=');
    if (k) acc[k.trim()] = rest.join('=').trim();
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing Supabase URL or key');
  process.exit(1);
}

const supabase = createClient(url, key);

const slug = 'best-touchless-car-wash-subscriptions-2026';
const now = new Date().toISOString();

const row = {
  slug,
  title: 'Best Touchless Car Wash Subscriptions in 2026 — Unlimited Plans Ranked',
  excerpt:
    'A data-driven ranking of every touchless car wash chain offering an unlimited monthly subscription in 2026, with live location counts, pricing bands, and state coverage.',
  meta_title: 'Best Touchless Car Wash Subscriptions 2026 — Unlimited Monthly Plans Ranked',
  meta_description:
    'Compare every touchless car wash chain with an unlimited monthly plan in 2026. Live location counts, pricing, coverage, and ratings — all brushless, all verified.',
  content: '<!-- Content generated dynamically by lib/dynamic-blog-subscriptions.ts at request time. -->',
  author: 'Touchless Car Wash Finder',
  status: 'published',
  published_at: now,
  tags: ['subscriptions', 'unlimited', 'memberships', 'chains', 'touchless'],
  category: 'Guides',
};

const { data: existing } = await supabase
  .from('blog_posts')
  .select('id')
  .eq('slug', slug)
  .maybeSingle();

if (existing) {
  const { error } = await supabase
    .from('blog_posts')
    .update(row)
    .eq('slug', slug);
  if (error) { console.error('Update failed:', error); process.exit(1); }
  console.log('Updated existing post:', slug);
} else {
  const { error } = await supabase
    .from('blog_posts')
    .insert(row);
  if (error) { console.error('Insert failed:', error); process.exit(1); }
  console.log('Inserted new post:', slug);
}
