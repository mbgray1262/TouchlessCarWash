import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gteqijdpqjmgxfnyuhvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXFpamRwcWptZ3hmbnl1aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgzOTIsImV4cCI6MjA4Njk3NDM5Mn0.wGXXfGWax_wdQwFLIBZaZLH6-P580Zw6ROjXeSPlE78';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Utility ─────────────────────────────────────────────────────────────────

const toArr = v => Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ── Detection: contactless ordering/payment false positives ─────────────────

// Positive signals for contactless ORDERING/PAYMENT (not car wash)
const CONTACTLESS_PAYMENT_PATTERNS = [
  /touchless\s+(system\s+)?knows?\s+who/i,
  /touchless\s+(ordering|order\s+ahead|order\s+online|pickup|pick[\s-]?up|transaction|check[\s-]?in|check[\s-]?out)/i,
  /touchless\s+payment/i,
  /touchless\s+(food|restaurant|dining)/i,
  /contactless\s+(ordering|order|pickup|pay|payment|transaction|delivery)/i,
  /order\s+(ahead|online)\s+.*touchless/i,
];

// Real touchless CAR WASH evidence — if any of these appear, the listing is legit
const REAL_WASH_PATTERNS = [
  /touchless\s+(wash|car\s*wash|automatic|auto\s*wash|bay|tunnel|in[\s-]?bay|gantry|cleaning\s+system)/i,
  /touch[\s-]?free\s+(wash|car\s*wash|automatic|auto\s*wash|bay|tunnel|cleaning)/i,
  /brushless\s+(wash|car\s*wash|automatic|bay)/i,
  /no[\s-]?touch\s+(wash|car\s*wash|automatic|bay)/i,
  /friction[\s-]?free\s+(wash|car\s*wash)/i,
  /\blaser\s*wash\b/i,
  /\blaserwash\b/i,
  /\btouchfree\b/i,
  /\bpdq\b/i,
  /\bwashworld\b/i,
  /\bpetit\b.*\b(wash|auto)/i,
  /\bbelanger\b/i,
  /\bistobal\b/i,
  /\bryko\b/i,
  /high[\s-]?pressure\s+(water\s+)?jets?\b.*\bno\s+(brushes?|friction|contact)/i,
  /touchless\s+drive/i,  // "touchless drive-through wash" etc.
];

// Known friction/soft-touch chain domains
const KNOWN_SOFT_TOUCH_DOMAINS = [
  'carwashkwik.com',
  'mistercarwash.com',
  'zfranchise.com',
  'takeapride.com',
  'whistle.express',
  'getgowash.com',
  'greencleanexpress.com',
  'tidal-wave.com',
  'mammothholdings.com',
];

// ── Analysis ────────────────────────────────────────────────────────────────

function hasRealWashEvidence(listing) {
  // Check touchless_wash_types
  const washTypes = listing.touchless_wash_types || [];
  if (washTypes.some(t => t === 'touchless_automatic')) return true;

  // Check equipment_brand
  if (listing.equipment_brand) {
    const b = listing.equipment_brand.toLowerCase();
    if (['laserwash', 'pdq', 'washworld', 'petit', 'belanger', 'istobal', 'ryko', 'ds'].includes(b)) return true;
  }

  // Check extracted_data fields for real wash evidence
  const ext = listing.extracted_data || {};
  const textsToCheck = [
    ...toArr(ext.service_types),
    ...toArr(ext.equipment_technology),
    ...toArr(ext.unique_selling_points),
    ...toArr(ext.special_features),
    ...toArr(ext.review_highlights),
  ];
  for (const t of textsToCheck) {
    const s = typeof t === 'string' ? t : JSON.stringify(t);
    if (REAL_WASH_PATTERNS.some(p => p.test(s))) return true;
  }

  // Check touchless_evidence for real wash phrases
  const ev = listing.touchless_evidence || '';
  if (REAL_WASH_PATTERNS.some(p => p.test(ev))) return true;

  return false;
}

function hasContactlessPaymentEvidence(listing) {
  const reasons = [];

  // Check touchless_evidence
  const ev = listing.touchless_evidence || '';
  if (ev) {
    for (const p of CONTACTLESS_PAYMENT_PATTERNS) {
      const m = ev.match(p);
      if (m) {
        reasons.push(`touchless_evidence mentions: "${m[0]}"`);
        break;
      }
    }
  }

  // Check extracted_data fields
  const ext = listing.extracted_data || {};
  const fieldsToCheck = {
    service_types: toArr(ext.service_types),
    equipment_technology: toArr(ext.equipment_technology),
    special_features: toArr(ext.special_features),
    unique_selling_points: toArr(ext.unique_selling_points),
    payment_methods: toArr(ext.payment_methods),
    review_highlights: toArr(ext.review_highlights),
  };

  for (const [field, values] of Object.entries(fieldsToCheck)) {
    for (const val of values) {
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      for (const p of CONTACTLESS_PAYMENT_PATTERNS) {
        const m = str.match(p);
        if (m) {
          reasons.push(`${field} contains: "${str.substring(0, 120)}"`);
          break;
        }
      }
    }
  }

  return reasons;
}

function isKnownSoftTouchDomain(listing) {
  const domain = extractDomain(listing.website);
  if (!domain) return null;
  const match = KNOWN_SOFT_TOUCH_DOMAINS.find(d => domain.includes(d));
  return match ? domain : null;
}

// Detect listings where evidence text says it's NOT touchless (classifier said no)
function evidenceSaysNotTouchless(listing) {
  const ev = (listing.touchless_evidence || '').toLowerCase();
  if (!ev) return false;
  // The classifier explicitly says it's not touchless
  const negPatterns = [
    /not\s+touchless/i,
    /no\s+touchless.*language/i,
    /no\s+(?:touchless|touch[\s-]?free|contactless|brushless)\s+(?:language|mention|terminology|indication|evidence)/i,
    /characteristics?\s+of\s+(?:a\s+)?(?:friction|soft[\s-]?touch|tunnel|brush)/i,
    /(?:friction|soft[\s-]?touch|brush|cloth)\s+(?:tunnel\s+)?wash/i,
    /does\s+not\s+(?:qualify|meet)\s+(?:as\s+)?touchless/i,
    /not\s+(?:a\s+)?touchless\s+(?:system|wash|facility|operation)/i,
    /disqualif/i,
    /upgraded\s+from\s+(?:a\s+)?touchless/i,
    /self[\s-]?service\s+(?:wand|spray|bay)/i,
  ];
  return negPatterns.some(p => p.test(ev));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching all listings where is_touchless = true...\n');

  const PAGE_SIZE = 1000;
  let allListings = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, name, city, state, website, touchless_wash_types, touchless_evidence, extracted_data, equipment_brand, equipment_model')
      .eq('is_touchless', true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Query error:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allListings.push(...data);
    console.log(`  Fetched ${data.length} rows (offset ${offset}, total so far: ${allListings.length})`);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`\nTotal touchless listings fetched: ${allListings.length}\n`);

  // ── Categorize ──────────────────────────────────────────────────────────

  const contactlessFPs = [];       // Category 1: contactless ordering/payment false positives
  const knownSoftTouchFPs = [];    // Category 2: known soft-touch chain domains
  const evidenceContradictsFlag = []; // Category 3: evidence says NOT touchless but is_touchless=true
  const noEvidenceAtAll = [];      // Category 4: no evidence, no wash types, nothing

  for (const listing of allListings) {
    const real = hasRealWashEvidence(listing);
    if (real) continue; // Has real touchless evidence — skip

    // Category 1: contactless payment/ordering false positives
    const paymentReasons = hasContactlessPaymentEvidence(listing);
    if (paymentReasons.length > 0) {
      contactlessFPs.push({ listing, reasons: paymentReasons });
      continue;
    }

    // Category 2: known soft-touch chain
    const softDomain = isKnownSoftTouchDomain(listing);
    if (softDomain) {
      knownSoftTouchFPs.push({ listing, domain: softDomain });
      continue;
    }

    // Category 3: evidence text says NOT touchless
    if (evidenceSaysNotTouchless(listing)) {
      evidenceContradictsFlag.push(listing);
      continue;
    }

    // Category 4: no evidence at all
    const ev = listing.touchless_evidence || '';
    const ext = listing.extracted_data || {};
    const washTypes = listing.touchless_wash_types || [];
    if (!ev && washTypes.length === 0 && !listing.equipment_brand) {
      noEvidenceAtAll.push(listing);
    }
  }

  // ── Print results ─────────────────────────────────────────────────────────

  console.log('='.repeat(80));
  console.log('FALSE POSITIVE ANALYSIS RESULTS');
  console.log('='.repeat(80));
  console.log(`Total touchless listings checked:                    ${allListings.length}`);
  console.log(`Category 1 - Contactless ordering/payment FPs:      ${contactlessFPs.length}`);
  console.log(`Category 2 - Known soft-touch chain domains:        ${knownSoftTouchFPs.length}`);
  console.log(`Category 3 - Evidence contradicts is_touchless:     ${evidenceContradictsFlag.length}`);
  console.log(`Category 4 - No evidence at all:                    ${noEvidenceAtAll.length}`);
  console.log('='.repeat(80));

  // Category 1: The main ask
  if (contactlessFPs.length > 0) {
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  CATEGORY 1: CONTACTLESS ORDERING/PAYMENT FALSE POSITIVES                   ║');
    console.log('║  These have "touchless" only in non-car-wash context (payment/ordering)      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    for (const { listing, reasons } of contactlessFPs) {
      console.log(`ID:       ${listing.id}`);
      console.log(`Name:     ${listing.name}`);
      console.log(`Location: ${listing.city}, ${listing.state}`);
      console.log(`Website:  ${listing.website || '(none)'}`);
      console.log(`Wash Types: ${JSON.stringify(listing.touchless_wash_types || [])}`);
      console.log(`Evidence: ${listing.touchless_evidence || '(none)'}`);
      console.log(`Flags:`);
      for (const r of reasons) {
        console.log(`  - ${r}`);
      }
      if (listing.extracted_data?.service_types) {
        console.log(`Service Types: ${JSON.stringify(listing.extracted_data.service_types)}`);
      }
      console.log('-'.repeat(60));
    }
  }

  // Category 2
  if (knownSoftTouchFPs.length > 0) {
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  CATEGORY 2: KNOWN SOFT-TOUCH CHAIN DOMAINS                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    for (const { listing, domain } of knownSoftTouchFPs) {
      console.log(`  ${listing.id} | ${listing.name} | ${listing.city}, ${listing.state} | ${domain}`);
    }
  }

  // Category 3
  if (evidenceContradictsFlag.length > 0) {
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  CATEGORY 3: EVIDENCE CONTRADICTS is_touchless=true                          ║');
    console.log('║  The classifier\'s own evidence says this is NOT touchless                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    for (const listing of evidenceContradictsFlag) {
      console.log(`ID:       ${listing.id}`);
      console.log(`Name:     ${listing.name}`);
      console.log(`Location: ${listing.city}, ${listing.state}`);
      console.log(`Website:  ${listing.website || '(none)'}`);
      console.log(`Evidence: ${(listing.touchless_evidence || '').substring(0, 200)}`);
      console.log('-'.repeat(60));
    }
  }

  // Category 4
  if (noEvidenceAtAll.length > 0) {
    console.log(`\n\n╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║  CATEGORY 4: NO EVIDENCE AT ALL (${noEvidenceAtAll.length} listings)${' '.repeat(Math.max(0, 37 - String(noEvidenceAtAll.length).length))}║`);
    console.log('║  is_touchless=true but no touchless_evidence, no wash_types, no equipment    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    for (const listing of noEvidenceAtAll.slice(0, 30)) {
      console.log(`  ${listing.id} | ${listing.name} | ${listing.city}, ${listing.state} | ${listing.website || '(none)'}`);
    }
    if (noEvidenceAtAll.length > 30) {
      console.log(`  ... and ${noEvidenceAtAll.length - 30} more`);
    }
  }

  console.log('\n\nDone. No changes were made. This is analysis only.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
