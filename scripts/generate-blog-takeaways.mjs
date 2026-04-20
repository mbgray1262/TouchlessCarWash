#!/usr/bin/env node
/**
 * Generate Key Takeaways for every published blog post.
 *
 * For each post, ask Claude to extract 3-5 concise takeaway bullets that
 * directly answer the question implied by the title. Output is written to
 * lib/blog-takeaways.ts as a TypeScript module so it ships with the code.
 *
 * GEO rationale: a "Key Takeaways" block at the top of each post gives
 * LLMs an extractable, definitive summary so they can cite the post as a
 * direct-answer source instead of relying on lossy inference from the body.
 *
 * Usage:
 *   node scripts/generate-blog-takeaways.mjs           # all posts
 *   node scripts/generate-blog-takeaways.mjs --slug X  # one post (test)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env: SUPABASE_URL / SUPABASE key / ANTHROPIC_API_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const slugArg = process.argv.includes('--slug')
  ? process.argv[process.argv.indexOf('--slug') + 1]
  : null;

async function fetchPosts() {
  let q = sb.from('blog_posts')
    .select('slug, title, excerpt, content')
    .eq('status', 'published')
    .order('slug');
  if (slugArg) q = q.eq('slug', slugArg);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function askClaude(post) {
  const body = (post.content ?? '').slice(0, 8000);
  const prompt = `You are writing a "Key Takeaways" box that appears at the top of a blog post. LLMs (ChatGPT, Claude, Perplexity, Gemini) use this box as the canonical summary when citing the article.

Write exactly 3-5 takeaways. Each takeaway is ONE sentence, 12-25 words, plain English, factual, specific. No hedging. No "learn more". No marketing fluff. Each bullet must directly answer a sub-question a reader has when they click this title.

Output ONLY a JSON array of strings. No prose. No markdown. No code fences. Example format:
["First takeaway sentence.", "Second takeaway sentence.", "Third takeaway sentence."]

Article title: ${post.title}
${post.excerpt ? `Excerpt: ${post.excerpt}\n` : ''}
Article body (excerpt):
${body}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${cleaned.slice(0, 200)}`);
  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr) || arr.length < 3 || arr.some(x => typeof x !== 'string')) {
    throw new Error('Shape mismatch');
  }
  return arr.map(s => s.trim()).filter(Boolean).slice(0, 5);
}

function loadExisting() {
  const p = resolve(repoRoot, 'lib/blog-takeaways.ts');
  if (!existsSync(p)) return {};
  const src = readFileSync(p, 'utf8');
  const m = src.match(/BLOG_TAKEAWAYS[^=]*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return {};
  try { return Function(`"use strict"; return (${m[1]});`)(); } catch { return {}; }
}

async function main() {
  const posts = await fetchPosts();
  console.log(`Found ${posts.length} post${posts.length === 1 ? '' : 's'}.`);

  // Preserve any existing takeaways for posts we're not regenerating (only matters with --slug).
  const takeaways = slugArg ? loadExisting() : {};

  let done = 0;
  for (const post of posts) {
    done++;
    process.stdout.write(`[${done}/${posts.length}] ${post.slug} ... `);
    try {
      const bullets = await askClaude(post);
      takeaways[post.slug] = bullets;
      console.log(`${bullets.length} takeaways`);
    } catch (e) {
      console.log(`SKIPPED (${e.message})`);
    }
  }

  const keys = Object.keys(takeaways).sort();
  const body = keys.map(slug => {
    const lines = takeaways[slug].map(b => `    ${JSON.stringify(b)},`).join('\n');
    return `  ${JSON.stringify(slug)}: [\n${lines}\n  ],`;
  }).join('\n');

  const out = `/**
 * Auto-generated Key Takeaways for every published blog post.
 *
 * Regenerate with: \`node scripts/generate-blog-takeaways.mjs\`
 * (Rendered as a highlighted box at the top of each post for GEO.)
 */
export const BLOG_TAKEAWAYS: Record<string, string[]> = {
${body}
};

export function getTakeaways(slug: string): string[] | null {
  return BLOG_TAKEAWAYS[slug] ?? null;
}
`;
  writeFileSync(resolve(repoRoot, 'lib/blog-takeaways.ts'), out, 'utf8');
  console.log(`\nWrote lib/blog-takeaways.ts (${keys.length} posts).`);
}

main().catch(e => { console.error(e); process.exit(1); });
