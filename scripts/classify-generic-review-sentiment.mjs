#!/usr/bin/env node
// One-off: clean garbage generic (non-evidence) review_snippets and classify
// their sentiment so the listing "More Customer Reviews" section can show only
// genuinely positive, on-topic reviews. Uses Claude Haiku (the same model the
// review-mine edge function already uses for touchless sentiment).
//
// Usage:
//   node scripts/classify-generic-review-sentiment.mjs           # dry run (counts only)
//   node scripts/classify-generic-review-sentiment.mjs --apply   # delete garbage + write sentiment

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
const ANTHROPIC_KEY = get('ANTHROPIC_API_KEY');
const MODEL = 'claude-haiku-4-5-20251001';
const APPLY = process.argv.includes('--apply');

// JSON-LD scrape fragments + ultra-short junk. These never read as real reviews.
function isGarbage(text) {
  if (!text || text.trim().length < 15) return true;
  if (/"@type"|contentLocation|"PostalAddress"|"addressLocality"/.test(text)) return true;
  return false;
}

async function fetchAllNonEvidence() {
  let from = 0, page = 1000, rows = [], done = false;
  while (!done) {
    const { data, error } = await sb
      .from('review_snippets')
      .select('id, review_text, rating, sentiment')
      .eq('is_touchless_evidence', false)
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < page) done = true; else from += page;
  }
  return rows;
}

// Classify a batch of reviews. Returns array of 'positive'|'negative'|'neutral'
// aligned by index. We ask the model to judge sentiment of the CAR WASH
// experience specifically, and to call off-topic/irrelevant reviews 'neutral'
// so they don't surface as fake positives.
async function classifyBatch(reviews) {
  const numbered = reviews
    .map((r, i) => `${i + 1}. (${r.rating ?? '?'}★) ${r.review_text.replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n');
  const prompt = `You are classifying customer reviews of car washes. For each numbered review, decide the overall sentiment about the CAR WASH / location experience.

Rules:
- "positive" = clearly happy with the wash/location (clean car, good value, friendly, recommended).
- "negative" = clearly unhappy (broke down, dirty, rude, overpriced, scratched car, misleading).
- "neutral" = mixed, lukewarm, OR off-topic for a car wash (e.g. only about gas pumps, food, lottery, bathrooms with no car-wash opinion).

Reviews:
${numbered}

Respond with ONLY a JSON array of lowercase strings, one per review in order, e.g. ["positive","neutral","negative"]. No prose.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = data.content?.[0]?.text ?? '';
  const m = txt.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('No JSON array in response: ' + txt.slice(0, 200));
  const arr = JSON.parse(m[0]);
  return arr.map((s) => {
    const v = String(s).toLowerCase().trim();
    return v === 'positive' || v === 'negative' ? v : 'neutral';
  });
}

(async () => {
  const rows = await fetchAllNonEvidence();
  const garbage = rows.filter((r) => isGarbage(r.review_text));
  const clean = rows.filter((r) => !isGarbage(r.review_text));
  const toClassify = clean.filter((r) => r.sentiment == null);

  console.log(`non-evidence total: ${rows.length}`);
  console.log(`garbage to delete: ${garbage.length}`);
  console.log(`clean: ${clean.length}, needing sentiment: ${toClassify.length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to delete garbage and write sentiment.');
    return;
  }

  // 1) delete garbage
  if (garbage.length) {
    for (let i = 0; i < garbage.length; i += 200) {
      const ids = garbage.slice(i, i + 200).map((g) => g.id);
      const { error } = await sb.from('review_snippets').delete().in('id', ids);
      if (error) throw error;
    }
    console.log(`deleted ${garbage.length} garbage snippets`);
  }

  // 2) classify sentiment in batches of 20
  const BATCH = 20;
  let pos = 0, neg = 0, neu = 0, written = 0;
  for (let i = 0; i < toClassify.length; i += BATCH) {
    const batch = toClassify.slice(i, i + BATCH);
    let sentiments;
    try {
      sentiments = await classifyBatch(batch);
    } catch (e) {
      console.error(`batch ${i} failed: ${e.message} — retrying once`);
      await new Promise((r) => setTimeout(r, 2000));
      sentiments = await classifyBatch(batch);
    }
    for (let j = 0; j < batch.length; j++) {
      const s = sentiments[j] || 'neutral';
      if (s === 'positive') pos++; else if (s === 'negative') neg++; else neu++;
      const { error } = await sb.from('review_snippets').update({ sentiment: s }).eq('id', batch[j].id);
      if (error) throw error;
      written++;
    }
    if (i % 200 === 0) console.log(`  ...${written}/${toClassify.length} classified`);
  }
  console.log(`\nDONE. wrote sentiment on ${written} snippets — positive ${pos}, negative ${neg}, neutral ${neu}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
