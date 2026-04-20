#!/usr/bin/env node
/**
 * AI touchless re-audit — reads the actual review text for each weak-evidence
 * listing and makes a real judgment call. Catches cases like Atomic Express
 * where customers quote the manager saying "the touchless is just a rinse,
 * it's not actually cleaning your car" — which keyword rules miss.
 *
 * Targets: listings with is_touchless=true + is_approved=true + weak evidence
 * (touchless_sentiment=negative AND touchless_review_count <= 1).
 *
 * For each, fetches all review snippets + website hints, asks Claude:
 *   "Is this a REAL working touchless car wash, or a nominal/fake one?"
 * Writes a verdict + reasoning. Reverts only on high-confidence false positives.
 *
 * Invocation: node scripts/ai-touchless-reaudit.mjs [--dry-run] [--limit=N]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const env = readFileSync(resolve(repoRoot, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...r] = l.split('='); if (k) a[k.trim()] = r.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const LOG = resolve(repoRoot, 'scripts/ai-touchless-reaudit.log');
const REPORT = resolve(repoRoot, 'scripts/ai-touchless-reaudit-report.json');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100', 10);

function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function askClaude(listing, snippets) {
  const reviewText = snippets.map((s, i) => `Review ${i + 1} (${s.sentiment}, ${s.rating ?? '?'}★): "${s.review_text}"`).join('\n\n');
  const prompt = `You are auditing a touchless car wash directory. A listing has been classified as touchless based on a small number of customer reviews mentioning the word "touchless" or similar. I need you to read the actual reviews and decide if this is a REAL, WORKING touchless car wash — or a false positive.

Business: ${listing.name}
Location: ${listing.city}, ${listing.state}
Website: ${listing.website || 'none'}
Google category: ${listing.google_category || 'unknown'}

Customer reviews:
${reviewText || '(no reviews available)'}

Decide which bucket this business falls into:

1. LEGITIMATE — A real, working touchless car wash where customers successfully wash their cars without brushes. Include it.
2. MIXED — Offers multiple wash types including a working touchless bay/tunnel. Include it.
3. FAKE — Has a "touchless" option in marketing/menu, but customers report it's broken, manager says it's "just a rinse", or it's primarily a tunnel/brush wash with touchless as a token offering. Exclude it.
4. UNCLEAR — Not enough evidence to decide. Leave unchanged.

Look specifically for these red flags that mean FAKE:
- Manager/staff quoted saying the touchless "isn't really for cleaning" or "is just a rinse"
- Customers saying the touchless "did nothing" and they had to use brushes/tunnel
- Customers warned off from the touchless option by staff
- The business is primarily described as a tunnel, conveyor, or express wash with only incidental touchless mention

Respond in JSON ONLY:
{"verdict": "LEGITIMATE" | "MIXED" | "FAKE" | "UNCLEAR", "confidence": "high" | "medium" | "low", "reason": "1-2 sentences citing specific evidence"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { verdict: 'ERROR', confidence: 'low', reason: `HTTP ${res.status}` };
    const d = await res.json();
    const text = d.content?.[0]?.text ?? '';
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { verdict: 'ERROR', confidence: 'low', reason: 'no JSON in response' };
    return JSON.parse(m[0]);
  } catch (e) {
    return { verdict: 'ERROR', confidence: 'low', reason: e.message };
  }
}

async function run() {
  writeFileSync(LOG, `=== ai-touchless-reaudit starting ${new Date().toISOString()} (dry=${DRY_RUN}) ===\n`);
  // Target: weak evidence (negative sentiment, ≤1 touchless review) AND approved touchless
  const { data: candidates } = await sb.from('listings')
    .select('id, name, city, state, website, google_category, touchless_verified, touchless_review_count, touchless_sentiment, parent_chain, slug')
    .eq('is_approved', true).eq('is_touchless', true)
    .eq('touchless_sentiment', 'negative')
    .lte('touchless_review_count', 1)
    .is('parent_chain', null) // exclude chain-verified (those are reliably touchless)
    .limit(LIMIT);
  log(`Found ${candidates?.length ?? 0} weak-evidence candidates for AI re-audit\n`);

  const results = [];
  let legit = 0, mixed = 0, fake = 0, unclear = 0, err = 0;
  for (let i = 0; i < (candidates ?? []).length; i++) {
    const c = candidates[i];
    // Fetch their review snippets
    const { data: snips } = await sb.from('review_snippets')
      .select('review_text, sentiment, rating, is_touchless_evidence')
      .eq('listing_id', c.id)
      .limit(15);
    const verdict = await askClaude(c, snips ?? []);
    const icon = { LEGITIMATE: '✅', MIXED: '✅', FAKE: '❌', UNCLEAR: '⚠️', ERROR: '⚠️' }[verdict.verdict] || '?';
    log(`[${i + 1}/${candidates.length}] ${icon} ${c.name} (${c.city}, ${c.state}) — ${verdict.verdict} (${verdict.confidence}): ${verdict.reason}`);
    results.push({ ...c, ...verdict, review_count_analyzed: snips?.length ?? 0 });
    if (verdict.verdict === 'LEGITIMATE') legit++;
    else if (verdict.verdict === 'MIXED') mixed++;
    else if (verdict.verdict === 'FAKE') fake++;
    else if (verdict.verdict === 'UNCLEAR') unclear++;
    else err++;

    // Revert high-confidence FAKE verdicts
    if (verdict.verdict === 'FAKE' && verdict.confidence === 'high' && !DRY_RUN) {
      await sb.from('listings').update({
        is_approved: false,
        is_touchless: false,
        touchless_verified: null,
        hero_image: null,
        hero_image_source: null,
        crawl_notes: `[auto ${new Date().toISOString().slice(0, 10)}] Reverted by AI re-audit — FAKE touchless per review evidence: ${verdict.reason}`,
      }).eq('id', c.id);
      log(`  → reverted ${c.name}`);
    }
  }

  const summary = { total: results.length, legitimate: legit, mixed, fake, unclear, error: err };
  writeFileSync(REPORT, JSON.stringify({ summary, results }, null, 2));
  log(`\n=== DONE ===\nLegitimate: ${legit}\nMixed: ${mixed}\nFAKE (reverted): ${fake}\nUnclear: ${unclear}\nErrors: ${err}\nReport: ${REPORT}`);
}

run().catch(e => { log(`FATAL: ${e.message}\n${e.stack}`); process.exit(1); });
