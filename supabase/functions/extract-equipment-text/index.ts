import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Comprehensive brand keyword map — normalized to DB values
const BRAND_MAP: Record<string, { brand: string; model?: string }> = {
  'laserwash': { brand: 'pdq', model: 'LaserWash' },
  'laser wash': { brand: 'pdq', model: 'LaserWash' },
  'laserwash 360': { brand: 'pdq', model: 'LaserWash 360' },
  'laser wash 360': { brand: 'pdq', model: 'LaserWash 360' },
  'laserwash 4000': { brand: 'pdq', model: 'LaserWash 4000' },
  'pdq manufacturing': { brand: 'pdq' },
  'pdq laserwash': { brand: 'pdq', model: 'LaserWash' },
  'pdq carwash': { brand: 'pdq' },
  'washworld': { brand: 'washworld' },
  'wash world': { brand: 'washworld' },
  'razor touch': { brand: 'washworld', model: 'Razor Touch' },
  'razor wash': { brand: 'washworld', model: 'Razor' },
  'profile wash': { brand: 'washworld', model: 'Profile' },
  'belanger': { brand: 'belanger' },
  'kondor': { brand: 'belanger', model: 'Kondor' },
  'ryko': { brand: 'ryko' },
  'softgloss': { brand: 'ryko', model: 'SoftGloss' },
  'istobal': { brand: 'istobal' },
  'petit autowash': { brand: 'petit' },
  'petit auto wash': { brand: 'petit' },
  'oasis car wash systems': { brand: 'oasis' },
  'oasis carwash': { brand: 'oasis' },
  'mark vii': { brand: 'mark_vii' },
  'markvii': { brand: 'mark_vii' },
  'karcher': { brand: 'karcher' },
  'kärcher': { brand: 'karcher' },
  'autec': { brand: 'autec' },
  'autec carwash': { brand: 'autec' },
  'saber': { brand: 'saber' },
  'broadway equipment': { brand: 'broadway' },
  'd&s car wash': { brand: 'ds' },
};

// Longer phrases first so we match "laserwash 360" before "laserwash"
const BRAND_KEYWORDS = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);

// Words that when surrounding brand keywords indicate it's a business name, not equipment
const FALSE_POSITIVE_PATTERNS = [
  /oasis\s+(car\s+wash|express|auto)/i,  // "Oasis Car Wash" is a common business name
];

interface Detection {
  listingId: string;
  name: string;
  brand: string;
  model: string | null;
  matchedKeyword: string;
  context: string;
}

function extractBrandFromText(text: string, listingName: string): { brand: string; model: string | null; keyword: string; context: string } | null {
  const lower = text.toLowerCase();

  for (const keyword of BRAND_KEYWORDS) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;

    // Get surrounding context (100 chars each side)
    const start = Math.max(0, idx - 100);
    const end = Math.min(text.length, idx + keyword.length + 100);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();

    // Skip if "oasis" appears to be a business name rather than equipment
    if (keyword.startsWith('oasis')) {
      const surroundingText = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 50)).toLowerCase();
      // If it's just "oasis car wash" or "oasis express" etc., likely a biz name
      if (FALSE_POSITIVE_PATTERNS.some(p => p.test(surroundingText))) {
        // But if the listing itself IS named "Oasis", it could still be equipment
        // — skip only if no other equipment context clues
        if (!surroundingText.includes('equipment') && !surroundingText.includes('system') && !surroundingText.includes('machine') && !surroundingText.includes('touchless')) {
          continue;
        }
      }
    }

    // Skip if "saber" is clearly part of business name
    if (keyword === 'saber') {
      const surroundingText = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 50)).toLowerCase();
      if (!surroundingText.includes('equipment') && !surroundingText.includes('system') && !surroundingText.includes('machine') && !surroundingText.includes('wash system')) {
        continue;
      }
    }

    const match = BRAND_MAP[keyword];
    return { brand: match.brand, model: match.model || null, keyword, context };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '500');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const dryRun = url.searchParams.get('dry_run') === 'true';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch touchless listings that have crawl_snapshot but no equipment_brand
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, name, crawl_snapshot')
      .eq('is_touchless', true)
      .not('crawl_snapshot', 'is', null)
      .is('equipment_brand', null)
      .order('id')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    console.log(`Processing ${listings?.length || 0} listings (offset=${offset}, limit=${limit}, dry_run=${dryRun})`);

    const detections: Detection[] = [];
    let scanned = 0;

    for (const listing of (listings || [])) {
      const markdown = listing.crawl_snapshot?.data?.markdown;
      if (!markdown || markdown.length < 50) continue;

      scanned++;
      const result = extractBrandFromText(markdown, listing.name);

      if (result) {
        detections.push({
          listingId: listing.id,
          name: listing.name,
          brand: result.brand,
          model: result.model,
          matchedKeyword: result.keyword,
          context: result.context,
        });

        if (!dryRun) {
          const updateData: Record<string, string | null> = { equipment_brand: result.brand };
          if (result.model) updateData.equipment_model = result.model;

          const { error: updateError } = await supabase
            .from('listings')
            .update(updateData)
            .eq('id', listing.id);

          if (updateError) {
            console.error(`Failed to update ${listing.id}: ${updateError.message}`);
          }
        }
      }
    }

    const response = {
      summary: {
        total_listings: listings?.length || 0,
        scanned_with_text: scanned,
        detections: detections.length,
        detection_rate: scanned > 0 ? `${((detections.length / scanned) * 100).toFixed(1)}%` : '0%',
        dry_run: dryRun,
      },
      detections: detections.map(d => ({
        id: d.listingId,
        name: d.name,
        brand: d.brand,
        model: d.model,
        matched: d.matchedKeyword,
        context: d.context.slice(0, 200),
      })),
      brand_breakdown: detections.reduce((acc, d) => {
        acc[d.brand] = (acc[d.brand] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
