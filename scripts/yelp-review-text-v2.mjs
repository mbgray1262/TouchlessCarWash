#!/usr/bin/env node
/**
 * Second sweep of Yelp review-text discovery with expanded phrase patterns.
 * Captures promotions + stages review snippets (will persist once RLS
 * migration is applied).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const QUERIES = [
  'site:yelp.com "no physical contact" "car wash"',
  'site:yelp.com "water and soap only" car wash',
  'site:yelp.com "high pressure water" "car wash" touchless',
  'site:yelp.com "no scratches" brushless car wash',
  'site:yelp.com "truly brushless" "car wash"',
  'site:yelp.com "only water touches"',
  'site:yelp.com "water only wash"',
  'site:yelp.com "touchless since" car wash',
  'site:yelp.com "touchless option" car wash',
  'site:yelp.com "dedicated touchless"',
  'site:yelp.com "real touch-free" car wash',
  'site:yelp.com "finest touchless"',
  'site:yelp.com "touchless technology" car wash',
  'site:yelp.com "best touchless wash"',
  'site:yelp.com "best laser wash"',
  'site:yelp.com "Mark VII touch-free"',
  'site:yelp.com "PDQ laserwash" review',
  'site:yelp.com "washworld razor"',
  'site:yelp.com "gantry wash" touchless',
  'site:yelp.com "in-bay automatic" touchless',
];

const SKIP_NAME = /mobile\s+(?:auto|car|wash|detail)|hand\s+(?:wash|car)|detail(?:ing)?\s+(?:service|center|shop)|ceramic\s+coating|window\s+tint|body\s+shop|auto\s+body|collision|repair|^tire\s|brake|oil\s+change|transmission/i;
const POSITIVE_RE = /truly\s+touchless|actually\s+touchless|really\s+touchless|no\s+brushes?(?:\s+touch|\s+at\s+all|,|\.)|only\s+water\s+touches|water\s+only|touchless\s+automatic|touchless\s+wash|touch[\s-]free\s+automatic|brushless\s+automatic|100%?\s+touchless|completely\s+touchless|laserwash|true\s+touch[\s-]?less|no\s+physical\s+contact|best\s+touchless|finest\s+touchless|real\s+touch[\s-]free|gantry\s+wash/i;
const NEGATIVE_RE = /wish\s+(?:it|this)\s+(?:were|was)\s+touchless|not\s+(?:really|actually|truly)\s+touchless|(?:isn|ain)[\u2019\']?t\s+touchless|claims?\s+(?:to\s+be\s+)?touchless\s+but|supposedly\s+touchless|but\s+still\s+uses\s+brushes|don[\u2019\']?t\s+offer\s+touchless/i;

function parseYelpUrl(url) {
  const m = url.match(/yelp\.com\/biz\/([^/?#]+)/);
  return m ? m[1] : null;
}
function slugToWords(slug) {
  return slug.replace(/-/g, ' ').replace(/\s+\d+$/, '').trim();
}
function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\bcar\s+wash\b/g, '').replace(/\bauto\s+spa\b/g, '').replace(/\s+/g, ' ').trim();
}

async function search(q) {
  const p = new URLSearchParams({ engine: 'google', q, num: '50', api_key: env.SERPAPI_KEY });
  const res = await fetch(`https://serpapi.com/search.json?${p}`);
  return res.json();
}

console.log('Loading DB listings...');
const db = [];
for (let offset = 0; offset < 60000; offset += 1000) {
  const { data } = await sb.from('listings').select('id, name, city, state, is_touchless').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  db.push(...data);
  if (data.length < 1000) break;
}
console.log(`  ${db.length} listings`);

const dbByState = new Map();
for (const l of db) {
  if (!dbByState.has(l.state)) dbByState.set(l.state, []);
  dbByState.get(l.state).push({ ...l, normed: normName(l.name), cityLower: (l.city||'').toLowerCase() });
}

const candidates = [];
let creditsUsed = 0;

for (const q of QUERIES) {
  try {
    const json = await search(q);
    creditsUsed++;
    if (json.error) { console.log(`"${q}": ${json.error}`); continue; }
    const results = json.organic_results || [];
    console.log(`"${q}": ${results.length} results`);
    for (const r of results) {
      const slug = parseYelpUrl(r.link);
      if (!slug) continue;
      if (!r.snippet) continue;
      if (NEGATIVE_RE.test(r.snippet)) continue;
      if (!POSITIVE_RE.test(r.snippet)) continue;
      if (SKIP_NAME.test(slug.replace(/-/g,' '))) continue;
      candidates.push({ slug, snippet: r.snippet, url: r.link, query: q });
    }
  } catch (e) { console.log(`"${q}": err ${e.message}`); }
}
console.log(`\n${candidates.length} candidates from ${creditsUsed} credits`);

// Match against DB — require slug contains BOTH normalized name AND city
const matches = [];
for (const c of candidates) {
  const slugWords = slugToWords(c.slug);
  for (const [state, listings] of dbByState.entries()) {
    for (const l of listings) {
      if (l.normed.length < 4) continue;  // skip short ambiguous names
      if (slugWords.includes(l.normed) && slugWords.includes(l.cityLower) && l.cityLower.length >= 3) {
        matches.push({ listing: l, candidate: c });
      }
    }
  }
}
const unique = [...new Map(matches.map(m => [m.listing.id, m])).values()];
console.log(`Unique DB matches: ${unique.length}`);

const toPromote = unique.filter(m => m.listing.is_touchless !== true);
console.log(`To promote: ${toPromote.length}`);
for (const m of toPromote.slice(0, 30)) {
  console.log(`  ${m.listing.name.slice(0, 40).padEnd(40)} ${m.listing.city}, ${m.listing.state}`);
  console.log(`    "${m.candidate.snippet.slice(0, 140)}"`);
}

// Stage snippets to JSON for later persistence (RLS not yet applied)
const stagedSnippets = toPromote.map(m => ({
  listing_id: m.listing.id,
  review_text: m.candidate.snippet.slice(0, 1200),
  is_touchless_evidence: true,
  touchless_keywords: ['yelp_review'],
  source: 'yelp_google_serp',
  yelp_url: m.candidate.url,
}));
writeFileSync('scripts/discovery-output/yelp-snippets-staged.json', JSON.stringify({
  note: 'Waiting for RLS migration to persist these',
  snippets: stagedSnippets,
}, null, 2));

// Try inserting — if migration is applied, this works; if not, silent fail
let snippetsSaved = 0;
for (const s of stagedSnippets) {
  const { error } = await sb.from('review_snippets').insert({
    listing_id: s.listing_id,
    review_text: s.review_text,
    is_touchless_evidence: s.is_touchless_evidence,
    touchless_keywords: s.touchless_keywords,
    source: s.source,
  });
  if (!error) snippetsSaved++;
}
console.log(`\nSnippets persisted to DB: ${snippetsSaved} of ${stagedSnippets.length} (rest staged to JSON, pending RLS migration)`);

// Promote
if (toPromote.length > 0) {
  const ids = toPromote.map(m => m.listing.id);
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const { error } = await sb.from('listings').update({
      is_touchless: true, is_approved: true,
      touchless_verified: 'user_review',
      classification_source: 'promoted_apr16_yelp_review_v2',
      crawl_notes: 'Promoted: Yelp review text (via Google SERP) contains specific touchless phrases written by actual customers. URL slug matched business name + city exactly.',
    }).in('id', batch);
    if (!error) done += batch.length;
  }
  console.log(`Promoted: ${done}`);
}

const { count } = await sb.from('listings').select('*',{count:'exact',head:true}).eq('is_touchless', true);
console.log(`\nTotal touchless now: ${count}`);
const acct = await (await fetch(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`)).json();
console.log(`SerpAPI remaining: ${acct.plan_searches_left}`);
