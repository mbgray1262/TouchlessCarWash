import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ── Types ──────────────────────────────────────────────────────────────────

interface ListingRow {
  id: string;
  name: string;
  city: string;
  state: string;
  google_category: string | null;
  google_subtypes: string | null;
  google_description: string | null;
  description: string | null;
  crawl_snapshot: { data?: { markdown?: string } } | null;
  extracted_data: Record<string, unknown> | null;
  crawl_notes: string | null;
  website: string | null;
  amenities: string[] | null;
  touchless_wash_types: string[] | null;
  created_at: string | null;
  google_id: string | null;
}

interface VerifyResult {
  id: string;
  name: string;
  verdict: 'touchless' | 'not_touchless' | 'needs_review';
  confidence: number; // 0-100
  reasoning: string;
  evidence: string[];
}

// ── Keyword scanning (fast pre-filter before AI) ──────────────────────────

const TOUCHLESS_KEYWORDS = [
  'touchless', 'touch-free', 'touchfree', 'touch free',
  'brushless', 'brush-free', 'brushfree', 'brush free',
  'laser wash', 'laserwash',
  'no-touch', 'no touch', 'notouch',
  'frictionless', 'friction-free',
];

// These phrases contain touchless-related words but do NOT indicate touchless washing:
// - "contactless" almost always means contactless PAYMENT (tap-to-pay, NFC)
// - "touchless drying/dry/dryer/blower" refers to air-drying equipment, not wash type
const FALSE_POSITIVE_KEYWORDS = ['contactless'];

// Phrases where "touchless/touch-free" refers to DRYING, not washing
const DRYING_FALSE_POSITIVE_PHRASES = [
  'touchless dry', 'touchless drying', 'touchless dryer', 'touchless blower',
  'touchless air dry', 'touch-free dry', 'touch-free drying', 'touch-free dryer',
  'touch free dry', 'touch free drying', 'touch free dryer',
];

// Phrases that confirm actual touchless WASH services (not just drying)
const TOUCHLESS_WASH_CONFIRMATION = [
  'touchless wash', 'touchless car wash', 'touch-free wash', 'touch free wash',
  'touchless bay', 'touchless option', 'touchless tunnel', 'touchless automatic',
  'touchless service', 'touchless menu', 'brushless wash', 'brushless car wash',
  'brush-free wash', 'brush free wash', 'laser wash', 'laserwash',
  'no-touch wash', 'no touch wash', 'frictionless wash',
];

const NOT_TOUCHLESS_KEYWORDS = [
  'hand wash only', 'hand car wash', 'handwash only',
  'detail only', 'detailing only', 'auto detail',
  'body shop', 'auto body', 'collision',
  'oil change', 'lube center', 'tire shop',
  'dog wash', 'pet wash', 'laundromat',
  'mobile detailing', 'paint protection',
];

function scanForKeywords(text: string): {
  touchlessHits: string[];
  notTouchlessHits: string[];
  falsePositiveHits: string[];
  dryingOnlyFalsePositive: boolean;
} {
  const lower = text.toLowerCase();
  const touchlessHits = TOUCHLESS_KEYWORDS.filter((kw) => lower.includes(kw));
  const notTouchlessHits = NOT_TOUCHLESS_KEYWORDS.filter((kw) =>
    lower.includes(kw),
  );
  const falsePositiveHits = FALSE_POSITIVE_KEYWORDS.filter((kw) =>
    lower.includes(kw),
  );

  // Detect "touchless drying" false positive:
  // If the text mentions touchless/touch-free drying but NOT touchless washing,
  // the word "touchless" likely refers to the drying system, not the wash itself.
  const hasDryingPhrase = DRYING_FALSE_POSITIVE_PHRASES.some((p) => lower.includes(p));
  const hasWashConfirmation = TOUCHLESS_WASH_CONFIRMATION.some((p) => lower.includes(p));
  const dryingOnlyFalsePositive = hasDryingPhrase && !hasWashConfirmation;

  return { touchlessHits, notTouchlessHits, falsePositiveHits, dryingOnlyFalsePositive };
}

// ── Gather all evidence for a listing ─────────────────────────────────────

function gatherEvidence(listing: ListingRow): {
  evidenceSummary: string;
  quickVerdict: 'touchless' | 'not_touchless' | null;
} {
  const evidence: string[] = [];
  let allText = listing.name + ' ';

  // Google data
  if (listing.google_category)
    evidence.push(`Google category: ${listing.google_category}`);
  if (listing.google_subtypes)
    evidence.push(`Google types: ${listing.google_subtypes}`);
  if (listing.google_description) {
    evidence.push(`Google editorial summary: ${listing.google_description}`);
    allText += listing.google_description + ' ';
  }
  // NOTE: We intentionally SKIP listing.description here because it's auto-generated
  // by our own template with phrases like "touchless wash options" — using it would be
  // circular reasoning. We only use google_description (from Google) and website content.

  // Skip crawl_notes too — they contain our own template text like
  // "Imported from Google Places. Touchless status needs verification."

  // Website content
  const markdown = listing.crawl_snapshot?.data?.markdown || '';
  if (markdown.length > 100) {
    evidence.push(
      `Website content available (${markdown.length} chars)`,
    );
    allText += markdown + ' ';

    // Extract relevant sections from website
    const lower = markdown.toLowerCase();
    const relevantSections: string[] = [];
    for (const kw of [
      'touchless', 'brushless', 'touch free', 'laser', 'automatic',
      'tunnel', 'express', 'self-serve', 'self serve', 'packages',
      'services', 'our wash', 'wash options',
    ]) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(markdown.length, idx + 120);
        relevantSections.push(markdown.substring(start, end).replace(/\n+/g, ' ').trim());
      }
    }
    if (relevantSections.length > 0) {
      evidence.push(
        `Website excerpts mentioning services: ${relevantSections.slice(0, 5).join(' | ')}`,
      );
    }
  }

  // Extracted data
  if (listing.extracted_data) {
    const ext = listing.extracted_data;
    if (ext.service_types)
      evidence.push(`Extracted service types: ${JSON.stringify(ext.service_types)}`);
    if (ext.equipment_technology)
      evidence.push(`Equipment/technology: ${JSON.stringify(ext.equipment_technology)}`);
    if (ext.special_features)
      evidence.push(`Special features: ${JSON.stringify(ext.special_features)}`);
    if (ext.unique_selling_points)
      evidence.push(`Selling points: ${JSON.stringify(ext.unique_selling_points)}`);
  }

  // Amenities
  if (listing.amenities?.length) {
    evidence.push(`Amenities: ${listing.amenities.join(', ')}`);
  }

  // Existing wash type tags
  if (listing.touchless_wash_types?.length) {
    evidence.push(`Tagged wash types: ${listing.touchless_wash_types.join(', ')}`);
  }

  // Quick keyword scan across ALL text
  const { touchlessHits, notTouchlessHits, falsePositiveHits, dryingOnlyFalsePositive } = scanForKeywords(allText);

  if (touchlessHits.length > 0) {
    evidence.push(`Touchless keywords found: ${touchlessHits.join(', ')}`);
  }
  if (notTouchlessHits.length > 0) {
    evidence.push(`Non-touchless keywords found: ${notTouchlessHits.join(', ')}`);
  }
  if (falsePositiveHits.length > 0) {
    evidence.push(`WARNING — false positive keywords found: ${falsePositiveHits.join(', ')} (e.g. "contactless" usually means contactless payment, NOT touchless washing)`);
  }
  if (dryingOnlyFalsePositive) {
    evidence.push(`CRITICAL WARNING — "touchless/touch-free" appears ONLY in the context of DRYING (e.g. "touchless drying system", "touch-free dry"). This does NOT indicate touchless washing — many soft-cloth/brush washes use touchless air dryers. Do NOT classify as touchless unless there is separate evidence of touchless WASHING.`);
  }

  // Quick verdict for obvious cases (skip AI)
  let quickVerdict: 'touchless' | 'not_touchless' | null = null;
  // If touchless only refers to drying, do NOT quick-approve — send to AI for careful analysis
  if (touchlessHits.length >= 2 && notTouchlessHits.length === 0 && !dryingOnlyFalsePositive) {
    quickVerdict = 'touchless';
  } else if (
    notTouchlessHits.length >= 2 &&
    touchlessHits.length === 0
  ) {
    quickVerdict = 'not_touchless';
  }

  return { evidenceSummary: evidence.join('\n'), quickVerdict };
}

// ── AI verification ──────────────────────────────────────────────────────

async function verifyWithAI(
  listing: ListingRow,
  evidenceSummary: string,
  apiKey: string,
): Promise<{ verdict: string; confidence: number; reasoning: string }> {
  const prompt = `You are verifying whether a car wash business offers TOUCHLESS (also called brushless, no-touch, laser wash, or friction-free) car wash services.

IMPORTANT FALSE POSITIVES TO WATCH FOR:
1. The word "contactless" almost always refers to CONTACTLESS PAYMENT (tap-to-pay, NFC), NOT touchless car washing.
2. "Touchless drying", "touch-free dry", "touchless blower", "touchless air dry" refer to the DRYING system, NOT the wash itself. Many soft-cloth/brush car washes use touchless air dryers. If "touchless" ONLY appears in the context of drying equipment, this is NOT a touchless car wash.
Do NOT treat either of these as evidence of touchless wash services.

IMPORTANT CONTEXT: This business appeared in Google Places search results when someone searched for "touchless car wash" in ${listing.city}, ${listing.state}. This is a meaningful signal — Google returns relevant results, and many car washes offer touchless wash as one of several options even if "touchless" isn't in their name.

Business: ${listing.name}
Location: ${listing.city}, ${listing.state}
Website: ${listing.website || 'None'}

Evidence gathered:
${evidenceSummary}

Based on ALL available evidence, determine:
1. Does this business offer touchless/brushless car wash services (even as one option among others)?
2. How confident are you? (0-100)

A car wash can be verified as touchless if:
- Its name or website mentions touchless/brushless/laser wash/no-touch
- Its website describes automatic or express wash services (many are touchless without explicitly saying so)
- It appeared in Google's "touchless car wash" search results AND is a car wash business
- Its equipment or services suggest touchless technology

A car wash should be REJECTED if:
- It's clearly not a car wash (detail shop, body shop, oil change, pet wash, etc.)
- It's exclusively a hand wash or self-serve coin-op with no automatic bays
- Strong evidence it uses brushes/cloth exclusively with no touchless option

If evidence is limited (no website content, generic name), consider that Google returned it for "touchless car wash" as moderate evidence in favor.

Respond with ONLY valid JSON:
{"verdict": "touchless" | "not_touchless" | "needs_review", "confidence": 0-100, "reasoning": "Brief 1-2 sentence explanation"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  const text: string = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { verdict: 'needs_review', confidence: 0, reasoning: 'Failed to parse AI response' };
  }
  return JSON.parse(jsonMatch[0]);
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ── STATUS ──────────────────────────────────────────────────────────
    if (action === 'status') {
      const { count: pendingCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('is_touchless', null);

      const { count: withSnapshot } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('is_touchless', null)
        .not('crawl_snapshot', 'is', null);

      const { count: recentImports } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .is('is_touchless', null)
        .gte('created_at', '2026-03-05');

      return Response.json(
        {
          pending_verification: pendingCount ?? 0,
          with_website_snapshot: withSnapshot ?? 0,
          recent_imports: recentImports ?? 0,
        },
        { headers: corsHeaders },
      );
    }

    // ── VERIFY ──────────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!anthropicKey) {
        return Response.json(
          { error: 'ANTHROPIC_API_KEY not configured' },
          { status: 500, headers: corsHeaders },
        );
      }

      const limit: number = body.limit ?? 50;
      const offset: number = body.offset ?? 0;
      const listingIds: string[] | undefined = body.listing_ids;
      const autoApply: boolean = body.auto_apply ?? false;
      const approveThreshold: number = body.approve_threshold ?? 70;
      const rejectThreshold: number = body.reject_threshold ?? 30;

      // Query medium-confidence listings
      let query = supabase
        .from('listings')
        .select(
          'id, name, city, state, google_category, google_subtypes, google_description, description, crawl_snapshot, extracted_data, crawl_notes, website, amenities, touchless_wash_types',
        )
        .is('is_touchless', null)
        .order('created_at', { ascending: false });

      if (listingIds?.length) {
        query = query.in('id', listingIds);
      }

      if (offset > 0)
        query = query.range(offset, offset + limit - 1);
      else if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) {
        return Response.json(
          { error: listErr.message },
          { status: 500, headers: corsHeaders },
        );
      }

      if (!listings?.length) {
        return Response.json(
          { message: 'No listings to verify', total: 0 },
          { headers: corsHeaders },
        );
      }

      const results: VerifyResult[] = [];
      let autoApproved = 0;
      let autoRejected = 0;
      let needsReview = 0;
      let quickVerdicts = 0;

      for (const listing of listings) {
        const row = listing as unknown as ListingRow;
        const { evidenceSummary, quickVerdict } = gatherEvidence(row);

        let verdict: string;
        let confidence: number;
        let reasoning: string;

        if (quickVerdict) {
          // Obvious case — skip AI call
          verdict = quickVerdict;
          confidence = quickVerdict === 'touchless' ? 90 : 85;
          reasoning =
            quickVerdict === 'touchless'
              ? 'Multiple touchless keywords found in business data'
              : 'Multiple non-touchless keywords found; no touchless indicators';
          quickVerdicts++;
        } else {
          // Use AI for ambiguous cases
          try {
            const aiResult = await verifyWithAI(row, evidenceSummary, anthropicKey);
            verdict = aiResult.verdict;
            confidence = aiResult.confidence;
            reasoning = aiResult.reasoning;
          } catch (e) {
            verdict = 'needs_review';
            confidence = 0;
            reasoning = `AI error: ${(e as Error).message}`;
          }
        }

        const result: VerifyResult = {
          id: listing.id,
          name: listing.name,
          verdict: verdict as VerifyResult['verdict'],
          confidence,
          reasoning,
          evidence: evidenceSummary.split('\n').filter(Boolean),
        };
        results.push(result);

        // Auto-apply if enabled
        if (autoApply) {
          if (verdict === 'touchless' && confidence >= approveThreshold) {
            await supabase
              .from('listings')
              .update({
                is_touchless: true,
                verification_status: 'approved',
                classification_confidence: confidence,
                touchless_confidence: confidence >= 85 ? 'high' : 'medium',
                crawl_notes: `AI verified: ${reasoning}`,
              })
              .eq('id', listing.id);
            autoApproved++;
          } else if (
            verdict === 'not_touchless' &&
            confidence >= (100 - rejectThreshold)
          ) {
            await supabase
              .from('listings')
              .update({
                is_touchless: false,
                verification_status: 'rejected',
                classification_confidence: confidence,
                crawl_notes: `AI rejected: ${reasoning}`,
              })
              .eq('id', listing.id);
            autoRejected++;
          } else {
            needsReview++;
          }
        } else {
          if (verdict === 'touchless') autoApproved++;
          else if (verdict === 'not_touchless') autoRejected++;
          else needsReview++;
        }
      }

      return Response.json(
        {
          success: true,
          total_processed: results.length,
          quick_verdicts: quickVerdicts,
          ai_analyzed: results.length - quickVerdicts,
          auto_applied: autoApply,
          summary: {
            would_approve: results.filter((r) => r.verdict === 'touchless').length,
            would_reject: results.filter((r) => r.verdict === 'not_touchless').length,
            needs_review: results.filter((r) => r.verdict === 'needs_review').length,
          },
          applied: autoApply
            ? { approved: autoApproved, rejected: autoRejected, needs_review: needsReview }
            : null,
          results,
        },
        { headers: corsHeaders },
      );
    }

    return Response.json(
      { error: `Unknown action: ${action}` },
      { status: 400, headers: corsHeaders },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
});
