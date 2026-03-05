import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function getSecret(supabaseUrl: string, serviceKey: string, name: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_secret`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      apikey: serviceKey,
    },
    body: JSON.stringify({ secret_name: name }),
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.replace(/^"|"$/g, '');
}

interface WashPackage {
  name: string;
  price?: string;
  description?: string;
  features?: string[];
  duration?: string;
  note?: string;
}

interface ListingRow {
  id: string;
  name: string;
  city: string;
  state: string;
  is_touchless: boolean;
  wash_packages: WashPackage[];
}

/**
 * Generate descriptions for wash packages that are missing them.
 * Uses Claude to create helpful, concise descriptions based on
 * the package name, price, features, and car wash context.
 */
async function enhancePackages(
  listing: ListingRow,
  apiKey: string,
): Promise<WashPackage[]> {
  const packages = listing.wash_packages;
  if (!packages?.length) return [];

  // Check which packages need descriptions
  const needsWork = packages.some(
    (p) => !p.description || p.description.length < 10,
  );
  if (!needsWork) return packages;

  const pkgSummary = packages.map((p, i) => {
    const parts = [`Package ${i + 1}: "${p.name}"`];
    if (p.price) parts.push(`Price: ${p.price}`);
    if (p.features?.length) parts.push(`Features: ${p.features.join(', ')}`);
    if (p.duration) parts.push(`Duration: ${p.duration}`);
    if (p.note) parts.push(`Note: ${p.note}`);
    if (p.description) parts.push(`Current description: ${p.description}`);
    return parts.join(' | ');
  }).join('\n');

  const prompt = `You are adding short, helpful descriptions to car wash packages for a listing page. Each description should help a customer understand what they get.

Business: ${listing.name} (${listing.city}, ${listing.state})
Type: ${listing.is_touchless ? 'Touchless/brushless automatic car wash' : 'Car wash'}

Current packages:
${pkgSummary}

For each package, write a concise 1-sentence description (10-25 words) that:
- Explains what the customer gets in plain language
- Mentions key differentiators from other tiers (e.g., "adds wax" or "includes undercarriage wash")
- Is specific — avoid generic phrases like "great value" or "best option"
- Does NOT repeat the package name or price
- If the package already has a good description (10+ chars), keep it exactly as-is

Respond with ONLY a JSON array of descriptions, one per package, in the same order:
["description for package 1", "description for package 2", ...]

If a package already has a good description, include it unchanged in the array.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);

  const data = await res.json() as { content: Array<{ text: string }> };
  const text = (data.content?.[0]?.text ?? '').trim();

  // Parse the JSON array of descriptions
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (!arrMatch) return packages;

  const descriptions: string[] = JSON.parse(arrMatch[0]);

  // Merge descriptions into packages
  return packages.map((pkg, i) => {
    const newDesc = descriptions[i];
    if (newDesc && (!pkg.description || pkg.description.length < 10)) {
      return { ...pkg, description: newDesc };
    }
    return pkg;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey =
      Deno.env.get('ANTHROPIC_API_KEY') ??
      (await getSecret(supabaseUrl, serviceKey, 'ANTHROPIC_API_KEY'));

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'status';

    // ── STATUS ───────────────────────────────────────────────────────────
    if (action === 'status') {
      // Count listings with non-empty wash_packages
      const { data: sample } = await supabase
        .from('listings')
        .select('wash_packages')
        .eq('is_touchless', true)
        .not('wash_packages', 'eq', '[]')
        .limit(1000);

      let totalPkgs = 0;
      let withDesc = 0;
      let withoutDesc = 0;
      let listingsWithPkgs = 0;
      let listingsNeedingWork = 0;

      for (const row of sample || []) {
        const pkgs = row.wash_packages as WashPackage[];
        if (!pkgs?.length) continue;
        listingsWithPkgs++;
        let needsWork = false;
        for (const pkg of pkgs) {
          totalPkgs++;
          if (pkg.description && pkg.description.length >= 10) {
            withDesc++;
          } else {
            withoutDesc++;
            needsWork = true;
          }
        }
        if (needsWork) listingsNeedingWork++;
      }

      return Response.json(
        {
          listings_with_packages: listingsWithPkgs,
          listings_needing_enhancement: listingsNeedingWork,
          total_packages: totalPkgs,
          packages_with_description: withDesc,
          packages_without_description: withoutDesc,
        },
        { headers: corsHeaders },
      );
    }

    // ── START ─────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!anthropicKey) {
        return Response.json(
          { error: 'ANTHROPIC_API_KEY not configured' },
          { status: 500, headers: corsHeaders },
        );
      }

      const limit: number = body.limit ?? 50;
      const offset: number = body.offset ?? 0;
      const listingIds: string[] | undefined = body.listing_ids;

      let query = supabase
        .from('listings')
        .select('id, name, city, state, is_touchless, wash_packages')
        .eq('is_touchless', true)
        .not('wash_packages', 'eq', '[]')
        .order('review_count', { ascending: false });

      if (listingIds && listingIds.length > 0) {
        query = query.in('id', listingIds);
      }

      if (offset > 0) query = query.range(offset, offset + (limit > 0 ? limit : 1000) - 1);
      else if (limit > 0) query = query.limit(limit);

      const { data: listings, error: listErr } = await query;
      if (listErr) {
        return Response.json(
          { error: listErr.message },
          { status: 500, headers: corsHeaders },
        );
      }

      // Filter to only listings that actually need enhancement
      const eligible = (listings || []).filter((l) => {
        const pkgs = l.wash_packages as WashPackage[];
        return pkgs?.some((p) => !p.description || p.description.length < 10);
      });

      if (eligible.length === 0) {
        return Response.json(
          { message: 'No packages need enhancement', total: 0 },
          { headers: corsHeaders },
        );
      }

      // Process in the response — these are quick Claude calls
      const results: Array<{
        id: string;
        name: string;
        packages_enhanced: number;
        error?: string;
      }> = [];

      for (const listing of eligible) {
        try {
          const enhanced = await enhancePackages(
            listing as ListingRow,
            anthropicKey,
          );
          if (enhanced.length > 0) {
            await supabase
              .from('listings')
              .update({ wash_packages: enhanced })
              .eq('id', listing.id);

            const originalPkgs = listing.wash_packages as WashPackage[];
            const newDescs = enhanced.filter(
              (p, i) =>
                p.description &&
                p.description.length >= 10 &&
                (!originalPkgs[i]?.description ||
                  originalPkgs[i].description!.length < 10),
            ).length;

            results.push({
              id: listing.id,
              name: listing.name,
              packages_enhanced: newDescs,
            });
          }
        } catch (e) {
          results.push({
            id: listing.id,
            name: listing.name,
            packages_enhanced: 0,
            error: (e as Error).message,
          });
        }
      }

      const totalEnhanced = results.reduce(
        (sum, r) => sum + r.packages_enhanced,
        0,
      );
      const errors = results.filter((r) => r.error).length;

      return Response.json(
        {
          success: true,
          listings_processed: results.length,
          total_packages_enhanced: totalEnhanced,
          errors,
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
