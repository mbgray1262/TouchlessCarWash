#!/usr/bin/env node
/**
 * Extract HowTo steps from the how-to blog posts using Claude.
 *
 * Writes lib/blog-howto-steps.ts as a slug → { name, description, steps[] }
 * map that feeds HowTo JSON-LD on each matching post page. HowTo schema
 * earns step-by-step rich results in Google Search and is a strong signal
 * to AI assistants that the post is actionable instructional content.
 *
 * Usage: node scripts/generate-blog-howto-steps.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

// The 4 posts with step-by-step instructional content.
const HOW_TO_SLUGS = [
  'touchless-car-wash-tips',
  'how-to-remove-water-spots-after-car-wash',
  'how-to-wash-a-new-car-first-time',
  'how-to-wash-car-in-winter-without-damaging-paint',
];

async function fetchPost(slug) {
  const { data, error } = await sb.from('blog_posts')
    .select('slug, title, excerpt, content')
    .eq('slug', slug).eq('status', 'published').maybeSingle();
  if (error) throw error;
  return data;
}

async function askClaude(post) {
  const body = (post.content ?? '').slice(0, 10000);
  const prompt = `Extract the step-by-step instructions from this blog post into a JSON structure suitable for Schema.org HowTo markup. The goal is to help Google show step-by-step rich results AND help AI assistants cite this post as authoritative actionable content.

Rules:
- Identify 4-8 clear, sequential steps that a reader would follow to accomplish the task in the title.
- Each step needs a short "name" (3-8 words, imperative mood, e.g. "Pre-rinse the vehicle") and a longer "text" (1-2 sentences, 20-50 words, concrete and specific — describe what to do, not why).
- Do NOT invent steps not supported by the article. Only what the article actually teaches.
- Steps must be in execution order.
- Write in plain, factual language. No marketing fluff.

Also provide:
- A top-level "name" — what the reader is learning to do (short, imperative: e.g. "How to Remove Water Spots After a Car Wash")
- A top-level "description" — 1 sentence, 15-25 words, summarizing the task and outcome.

Output JSON ONLY — no prose, no markdown fences. Exact shape:
{
  "name": "...",
  "description": "...",
  "steps": [
    { "name": "...", "text": "..." },
    ...
  ]
}

Article title: ${post.title}
${post.excerpt ? `Excerpt: ${post.excerpt}\n` : ''}
Article body (excerpt):
${body}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in response: ${cleaned.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  if (!parsed.name || !parsed.description || !Array.isArray(parsed.steps) || parsed.steps.length < 3) {
    throw new Error('Shape mismatch');
  }
  return parsed;
}

async function main() {
  const out = {};
  for (let i = 0; i < HOW_TO_SLUGS.length; i++) {
    const slug = HOW_TO_SLUGS[i];
    process.stdout.write(`[${i + 1}/${HOW_TO_SLUGS.length}] ${slug} ... `);
    try {
      const post = await fetchPost(slug);
      if (!post) { console.log('NOT FOUND'); continue; }
      const howTo = await askClaude(post);
      out[slug] = howTo;
      console.log(`${howTo.steps.length} steps`);
    } catch (e) {
      console.log(`SKIPPED (${e.message})`);
    }
  }

  const keys = Object.keys(out).sort();
  const body = keys.map(slug => {
    const h = out[slug];
    const stepsSrc = h.steps.map(s =>
      `      { name: ${JSON.stringify(s.name)}, text: ${JSON.stringify(s.text)} },`
    ).join('\n');
    return `  ${JSON.stringify(slug)}: {
    name: ${JSON.stringify(h.name)},
    description: ${JSON.stringify(h.description)},
    steps: [
${stepsSrc}
    ],
  },`;
  }).join('\n');

  const file = `/**
 * Auto-generated HowTo step data for the instructional blog posts.
 *
 * Regenerate with: \`node scripts/generate-blog-howto-steps.mjs\`
 * Powers the HowTo JSON-LD emitted on each listed post.
 */
export type HowToStepData = { name: string; text: string };

export type HowToPostData = {
  name: string;
  description: string;
  steps: HowToStepData[];
};

export const BLOG_HOWTO_STEPS: Record<string, HowToPostData> = {
${body}
};

export function getHowTo(slug: string): HowToPostData | null {
  return BLOG_HOWTO_STEPS[slug] ?? null;
}
`;

  writeFileSync(resolve(repoRoot, 'lib/blog-howto-steps.ts'), file, 'utf8');
  console.log(`\nWrote lib/blog-howto-steps.ts (${keys.length} posts).`);
}

main().catch(e => { console.error(e); process.exit(1); });
