/**
 * One-time backfill: AI descriptions for self-serve-ONLY listings that are
 * launch-ready (is_self_service + is_approved + self_service_reviewed_at) but
 * have no `description`. Mirrors the generate-descriptions edge function's
 * SYSTEM_PROMPT + Claude Haiku path, but writes self-serve wording (never
 * touchless/brushless/paint-safe) and pulls GENERAL review snippets (self-serve
 * listings have no is_touchless_evidence snippets). Run from the project root:
 *   node scripts/selfserve-descriptions.mjs           # dry-run: count + 1 sample
 *   node scripts/selfserve-descriptions.mjs --run      # generate + write all
 * Idempotent: only targets rows where description IS NULL.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase URL/service key');
if (!ANTHROPIC_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const RUN = process.argv.includes('--run');

// Byte-identical to the edge function's SYSTEM_PROMPT so quality is consistent.
const SYSTEM_PROMPT = `You are writing a description for one specific car wash business on a directory site. The directory has thousands of listings, and your job is to make THIS page distinctly different from every other listing — by grounding every claim in the specific facts about THIS business.

CRITICAL RULES (the directory has been flagged for low-quality content; these rules exist because past descriptions read as templated and got the site rejected from Google AdSense):

1. EVERY sentence must contain at least one fact that comes specifically from the data block provided in the user message. If a sentence could appear unchanged on a different car wash's page, delete it.

2. If a tagline is provided, quote it verbatim in double quotes with attribution. Do NOT paraphrase taglines.

3. Use specific named details whenever they exist:
   - Named wash packages (e.g., "the Ultimate Shine package at $19.99")
   - Named membership plans (e.g., "the All-Weather Unlimited tier at $34.99/month")
   - Specific equipment models (e.g., "PDQ LaserWash 360")
   - Specific amenities by name (e.g., "free vacuums", "soft towels", "vending machines")
   - Specific service types from the website's own language

4. BANNED PHRASES — these are generic and will trigger duplicate-content detection. Do not use them or any close variant:
   - "gentle on your vehicle" / "protects your paint"
   - "state-of-the-art" / "cutting-edge" / "advanced technology"
   - "look no further" / "best in town" / "top choice"
   - "trusted" / "reliable" / "convenient choice"
   - "whether you're a local or just passing through"
   - "beyond the car wash" / "more than just a car wash"
   - "in just minutes" / "in no time"
   - "your vehicle will thank you" / "leave looking like new"

5. NEVER invent facts. If the data doesn't say it, don't say it. No assumptions about what the business "probably" offers.

6. Length target: follow the word count specified in the user message. Do not pad with filler to hit the upper bound — shorter is fine if data is limited. Quality > length.

7. Format: 1-3 paragraphs of plain text. No headings. No bullet lists. No emojis.

8. Tone: factual and informative, like a knowledgeable local writing a quick guide. Not promotional. Not sycophantic.

9. Naturally include the business name, city, and state once each (for SEO), but do not stuff keywords.

9a. CHAIN LOCATIONS: when the business is part of a named chain (parent_chain is set), the shared corporate website content will be the same across every location of that chain. You MUST lean heavily on the per-location customer review snippets, address, hours, and any location-specific amenities to differentiate this page from sibling locations. If you have review snippets, paraphrase specific observations customers made about THIS location (e.g. "several customers mention the free vacuums work consistently" or "reviewers highlight the 24-hour availability for late-shift drivers"). Do NOT lean primarily on the corporate tagline, founding year, or franchise-wide claims — those appear on every sibling page and are exactly the "scaled content" signal we are trying to avoid.

10. End with a concrete call to action grounded in real data — e.g., the actual phone number, the actual hours, or "visit during the open hours listed below." Do NOT end with generic exhortations like "stop by today!"

Output ONLY the description text — no preamble, no explanation, no surrounding quotes.`;

function buildUserMessage(listing) {
  const parts = [];
  parts.push(`Business name: ${listing.name}`);
  parts.push(`Location: ${listing.address}, ${listing.city}, ${listing.state}${listing.zip ? ' ' + listing.zip : ''}`);
  // Self-serve type label — the whole point of this backfill.
  parts.push('Type: Self-serve (self-service) car wash — open wand bays where the customer washes their own vehicle with a high-pressure wand and foaming brush they control, paying by coin, card, or app. Do NOT describe it as touchless, touch-free, brushless, or paint-safe.');

  if (listing.rating && listing.rating > 0) {
    const r = `Rating: ${Number(listing.rating).toFixed(1)} stars`;
    parts.push(r + (listing.review_count > 0 ? ` based on ${listing.review_count} customer reviews` : ''));
  }
  if (listing.amenities?.length) parts.push(`Amenities/services: ${listing.amenities.join(', ')}`);
  if (listing.wash_packages?.length) {
    parts.push(`Wash packages: ${listing.wash_packages.map((p) => p.name + (p.price ? ` (${p.price})` : '') + (p.description ? ` — ${p.description}` : '')).join('; ')}`);
  }
  if (listing.hours && Object.keys(listing.hours).length) {
    const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    parts.push(`Hours: ${order.filter((d) => listing.hours[d]).map((d) => `${d[0].toUpperCase() + d.slice(1)}: ${listing.hours[d]}`).join(', ')}`);
  }
  if (listing.typical_time_spent) parts.push(`Typical visit duration: ${listing.typical_time_spent}`);
  if (listing.price_range) parts.push(`Price range: ${listing.price_range}`);
  if (listing.google_description) parts.push(`Google description: ${listing.google_description}`);
  if (listing.google_subtypes) parts.push(`Business subtypes: ${listing.google_subtypes}`);

  const ed = listing.extracted_data;
  if (ed) {
    if (typeof ed.tagline === 'string' && ed.tagline.trim()) parts.push(`Tagline (quote verbatim): "${ed.tagline.trim()}"`);
    if (typeof ed.business_type === 'string' && ed.business_type.trim()) parts.push(`Business type: ${ed.business_type}`);
    if (typeof ed.established === 'string' && ed.established.trim()) parts.push(`Established: ${ed.established}`);
    if (Array.isArray(ed.service_types) && ed.service_types.length) parts.push(`Service types offered: ${ed.service_types.join(', ')}`);
    if (Array.isArray(ed.equipment_technology) && ed.equipment_technology.length) parts.push(`Equipment/Technology: ${ed.equipment_technology.join(', ')}`);
    if (Array.isArray(ed.special_features) && ed.special_features.length) parts.push(`Special features: ${ed.special_features.join(', ')}`);
    if (Array.isArray(ed.payment_methods) && ed.payment_methods.length) parts.push(`Payment methods accepted: ${ed.payment_methods.join(', ')}`);
    if (Array.isArray(ed.unique_selling_points) && ed.unique_selling_points.length) parts.push(`Unique selling points: ${ed.unique_selling_points.join(', ')}`);
  }
  const snapshotMd = listing.crawl_snapshot?.data?.markdown;
  if (snapshotMd && snapshotMd.length > 200) parts.push(`\nWebsite content excerpt:\n${snapshotMd.substring(0, 3000)}`);

  const snippets = listing.review_snippets ?? [];
  if (snippets.length) {
    parts.push(`\nCustomer review snippets from this specific location (quote or paraphrase specific observations):\n${snippets.map((s, i) => `  Review ${i + 1}${s.rating ? ` ${s.rating}★` : ''}${s.sentiment ? ` (${s.sentiment})` : ''}: "${s.review_text.replace(/\s+/g, ' ').trim().slice(0, 240)}"`).join('\n')}`);
  }

  const richCount = ed ? ['tagline', 'wash_packages', 'membership_plans', 'service_types', 'special_features', 'payment_methods', 'equipment_technology', 'unique_selling_points', 'business_type', 'established'].filter((k) => {
    const v = ed[k];
    return v != null && !(Array.isArray(v) && !v.length) && !(typeof v === 'string' && !v.trim());
  }).length : 0;
  const hasSnippets = snippets.length >= 2;
  const isRich = richCount >= 3 || !!snapshotMd || hasSnippets;
  const isVeryRich = richCount >= 5 || (hasSnippets && richCount >= 2);
  const target = isVeryRich ? '180-260' : isRich ? '130-200' : '70-120';

  return `Target length: ${target} words.\n\nBusiness data:\n${parts.join('\n')}\n\nWrite the description now. Remember: every sentence must contain a fact specific to THIS business.`;
}

async function generate(listing) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(listing) }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content?.find((b) => b.type === 'text')?.text ?? '').trim();
}

// --fix-stale: overwrite existing descriptions on self-serve-only launch listings
// that still carry touchless/brushless/paint-safe wording (stale copy from before
// the self-serve reclassification). Backs the old text up to a JSON first.
const FIX_STALE = process.argv.includes('--fix-stale');
const BANNED = /touchless|touch-free|brushless|paint-safe|paint safe/i;
// --prep: pre-approval workflow. Generate descriptions for CONFIRMED self-serve-only
// listings (is_self_service=true, is_touchless=false) missing one, REGARDLESS of
// review/approval status, so a batch is fully review-ready before Michael approves.
// Run AFTER autophoto so listings it demoted (is_self_service=false) are excluded.
const PREP = process.argv.includes('--prep');
// --state XX: restrict to one state (for per-batch runs).
const stateArg = process.argv.find((a) => /^--state=/.test(a));
const STATE = stateArg ? stateArg.split('=')[1].toUpperCase()
  : (process.argv.includes('--state') ? (process.argv[process.argv.indexOf('--state') + 1] || '').toUpperCase() : null);

async function main() {
  const cols = 'id, name, city, state, address, zip, phone, website, rating, review_count, is_touchless, is_self_service, amenities, wash_packages, hours, google_description, google_subtypes, typical_time_spent, price_range, crawl_snapshot, extracted_data, parent_chain';
  let listings;

  if (FIX_STALE) {
    const { data, error } = await sb.from('listings')
      .select(cols + ', description, description_generated_at')
      .eq('is_self_service', true).not('is_touchless', 'is', true).eq('is_approved', true)
      .not('self_service_reviewed_at', 'is', null).not('description', 'is', null)
      .order('review_count', { ascending: false }).limit(500);
    if (error) throw error;
    listings = data.filter((d) => BANNED.test(d.description || ''));
    console.log(`Self-serve-only launch listings with STALE touchless-worded descriptions: ${listings.length}`);
    if (!listings.length) return;
    // Back up the old descriptions so this overwrite is reversible.
    const backup = listings.map((l) => ({ id: l.id, name: l.name, description: l.description, description_generated_at: l.description_generated_at }));
    const path = `scripts/_backup_selfserve_stale_desc_${new Date().toISOString().slice(0, 10)}.json`;
    (await import('fs')).writeFileSync(path, JSON.stringify(backup, null, 2));
    console.log(`Backed up ${backup.length} old descriptions to ${path}`);
    if (!RUN) {
      console.log('\nDry run. Re-run with --fix-stale --run to overwrite them with self-serve copy.');
      return;
    }
  } else {
    let q = sb
      .from('listings')
      .select(cols)
      .eq('is_self_service', true)
      // "not a touchless wash" = is_touchless false OR null. Using .eq(false) here
      // silently skipped the ~23 never-classified (null) self-serve listings, so
      // they launched with no description. Match isSelfServeOnly (!is_touchless).
      .not('is_touchless', 'is', true)
      .is('description', null);
    // Default: only already-launched (approved+reviewed) listings. --prep: any
    // confirmed self-serve-only listing, so descriptions land BEFORE approval.
    if (!PREP) q = q.eq('is_approved', true).not('self_service_reviewed_at', 'is', null);
    if (STATE) q = q.eq('state', STATE);
    const { data, error } = await q.order('review_count', { ascending: false }).limit(1000);
    if (error) throw error;
    listings = data;
    console.log(`Eligible self-serve-only listings missing a description${PREP ? ' [PREP]' : ''}${STATE ? ` [${STATE}]` : ''}: ${listings.length}`);
    if (!listings.length) return;
  }

  if (!RUN) {
    // Dry run: generate ONE as a sample so Michael can eyeball the wording.
    const sample = listings[0];
    const { data: snips } = await sb.from('review_snippets').select('review_text, rating, sentiment').eq('listing_id', sample.id).order('rating', { ascending: false, nullsFirst: false }).limit(5);
    const desc = await generate({ ...sample, review_snippets: snips ?? [] });
    console.log(`\n--- SAMPLE (${sample.name}, ${sample.city} ${sample.state}) ---\n${desc}\n---`);
    console.log('\nDry run only. Re-run with --run to generate + write all.');
    return;
  }

  let ok = 0, fail = 0;
  for (const l of listings) {
    try {
      const { data: snips } = await sb.from('review_snippets').select('review_text, rating, sentiment').eq('listing_id', l.id).order('rating', { ascending: false, nullsFirst: false }).limit(5);
      let desc = '';
      for (let attempt = 0; attempt < 2 && !desc; attempt++) {
        try { desc = await generate({ ...l, review_snippets: snips ?? [] }); }
        catch (e) { if (attempt === 1) throw e; await new Promise((r) => setTimeout(r, 1500)); }
      }
      if (desc && desc.length > 20) {
        const { error: upErr } = await sb.from('listings').update({ description: desc, description_generated_at: new Date().toISOString() }).eq('id', l.id);
        if (upErr) throw upErr;
        ok++;
        console.log(`  [${ok + fail}/${listings.length}] ✓ ${l.name} (${l.city}, ${l.state}) — ${desc.length} chars`);
      } else {
        fail++;
        console.log(`  [${ok + fail}/${listings.length}] ✗ ${l.name} — empty/short output`);
      }
    } catch (e) {
      fail++;
      console.log(`  [${ok + fail}/${listings.length}] ✗ ${l.name} — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`\nDone. Generated ${ok}, failed ${fail}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
