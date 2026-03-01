import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';
const MIN_SCORE = 70;

interface Listing {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string | null;
}

interface MatchResult {
  listing_id: string;
  new_url: string;
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreMatch(listing: Listing, url: string): number {
  const normalUrl = url.toLowerCase();
  const city = normalize(listing.city);
  const state = listing.state.toLowerCase();
  const zip = (listing.zip || '').replace(/\D/g, '');

  const citySlug = listing.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const cityNorm = city;

  const hasState = normalUrl.includes(`/${state}/`) || normalUrl.includes(`-${state}/`) || normalUrl.includes(`/${state}-`) || normalUrl.endsWith(`/${state}`);

  if (cityNorm && normalUrl.includes(`/${cityNorm}/`)) {
    return hasState ? 100 : 80;
  }
  if (citySlug && citySlug !== cityNorm && (normalUrl.includes(`/${citySlug}/`) || normalUrl.includes(`/${citySlug}-`) || normalUrl.includes(`-${citySlug}/`))) {
    return hasState ? 95 : 75;
  }
  if (zip && zip.length === 5 && normalUrl.includes(zip)) {
    return 65;
  }
  return 0;
}

function isLocationLikeUrl(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== domain) return false;
    const path = u.pathname;
    if (path === '/' || path === '') return false;
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return false;

    const pathLower = path.toLowerCase();
    const skipPatterns = [
      '/blog', '/news', '/press', '/about', '/contact', '/careers', '/jobs',
      '/privacy', '/terms', '/faq', '/help', '/support', '/login', '/signup',
      '/account', '/cart', '/shop', '/store', '/product', '/pricing',
      '/api', '/cdn', '/assets', '/static', '/img', '/images', '/css', '/js',
    ];
    if (skipPatterns.some(p => pathLower.startsWith(p))) return false;

    return true;
  } catch {
    return false;
  }
}

async function discoverLocationUrls(domain: string, firecrawlKey: string): Promise<string[]> {
  const siteUrl = `https://www.${domain}`;

  const resp = await fetch(`${FIRECRAWL_API}/map`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: siteUrl,
      limit: 500,
      includeSubdomains: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firecrawl map failed for ${domain}: ${resp.status} ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const allLinks: string[] = data?.links || [];

  return allLinks.filter(link => isLocationLikeUrl(link, domain));
}

function matchListingsToUrls(listings: Listing[], locationUrls: string[]): MatchResult[] {
  const results: MatchResult[] = [];

  for (const listing of listings) {
    let bestScore = MIN_SCORE - 1;
    let bestUrl = '';

    for (const url of locationUrls) {
      const score = scoreMatch(listing, url);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }

    if (bestUrl) {
      results.push({ listing_id: listing.id, new_url: bestUrl });
    }
  }

  return results;
}

async function processVendor(
  supabase: ReturnType<typeof createClient>,
  vendor: { id: number; canonical_name: string; domain: string },
  firecrawlKey: string
): Promise<{ matched: number; unmatched: number; links_found: number; locations_url: string; error?: string }> {
  const parentUrlVariants = [
    `https://${vendor.domain}`, `http://${vendor.domain}`,
    `https://www.${vendor.domain}`, `http://www.${vendor.domain}`,
    `https://${vendor.domain}/`, `http://${vendor.domain}/`,
    `https://www.${vendor.domain}/`, `http://www.${vendor.domain}/`,
  ];

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, name, address, city, state, zip, website')
    .eq('vendor_id', vendor.id)
    .or(`website.is.null,website.in.(${parentUrlVariants.map(u => `"${u}"`).join(',')})`);

  if (listingsError) throw new Error(listingsError.message);
  if (!listings || listings.length === 0) {
    return { matched: 0, unmatched: 0, links_found: 0, locations_url: '' };
  }

  const locationUrls = await discoverLocationUrls(vendor.domain, firecrawlKey);

  if (locationUrls.length === 0) {
    return { matched: 0, unmatched: listings.length, links_found: 0, locations_url: `https://www.${vendor.domain}` };
  }

  const matches = matchListingsToUrls(listings as Listing[], locationUrls);

  if (matches.length > 0) {
    await Promise.all(
      matches.map(m => supabase.from('listings').update({ website: m.new_url }).eq('id', m.listing_id))
    );
  }

  return {
    matched: matches.length,
    unmatched: listings.length - matches.length,
    links_found: locationUrls.length,
    locations_url: `https://www.${vendor.domain}`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';

    if (action === 'status') {
      const jobId = body.job_id;
      if (!jobId) {
        const { data } = await supabase
          .from('chain_url_backfill_jobs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return new Response(JSON.stringify({ job: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: job } = await supabase
        .from('chain_url_backfill_jobs')
        .select('*, chain_url_backfill_results(*)')
        .eq('id', jobId)
        .maybeSingle();
      return new Response(JSON.stringify({ job }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'cancel') {
      const jobId = body.job_id;
      await supabase.from('chain_url_backfill_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: chains, error: chainsError } = await supabase.rpc('get_chains_with_parent_urls');
    if (chainsError) throw new Error(chainsError.message);
    if (!chains || chains.length === 0) {
      return new Response(JSON.stringify({ message: 'No chains with parent URLs found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: jobRow, error: jobError } = await supabase
      .from('chain_url_backfill_jobs')
      .insert({
        status: 'running',
        total_chains: chains.length,
        chains_processed: 0,
        total_matched: 0,
        total_unmatched: 0,
      })
      .select('id')
      .single();

    if (jobError) throw new Error(jobError.message);
    const jobId = jobRow.id;

    EdgeRuntime.waitUntil((async () => {
      let processed = 0;
      let totalMatched = 0;
      let totalUnmatched = 0;

      for (const vendor of chains) {
        const { data: jobCheck } = await supabase
          .from('chain_url_backfill_jobs')
          .select('status')
          .eq('id', jobId)
          .maybeSingle();

        if (jobCheck?.status === 'cancelled') break;

        await supabase.from('chain_url_backfill_jobs').update({
          current_vendor_name: vendor.canonical_name,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        let result = { matched: 0, unmatched: 0, links_found: 0, locations_url: '', error: undefined as string | undefined };

        try {
          const r = await processVendor(supabase, vendor, firecrawlKey);
          result = r;
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
          result.unmatched = vendor.parent_url_count || 0;
        }

        await supabase.from('chain_url_backfill_results').insert({
          job_id: jobId,
          vendor_id: vendor.id,
          vendor_name: vendor.canonical_name,
          domain: vendor.domain,
          locations_url_used: result.locations_url,
          links_found: result.links_found,
          matched: result.matched,
          unmatched: result.unmatched,
          error_message: result.error || null,
        });

        processed++;
        totalMatched += result.matched;
        totalUnmatched += result.unmatched;

        await supabase.from('chain_url_backfill_jobs').update({
          chains_processed: processed,
          total_matched: totalMatched,
          total_unmatched: totalUnmatched,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        await new Promise(r => setTimeout(r, 300));
      }

      const { data: finalCheck } = await supabase
        .from('chain_url_backfill_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();

      const finalStatus = finalCheck?.status === 'cancelled' ? 'cancelled' : 'completed';

      await supabase.from('chain_url_backfill_jobs').update({
        status: finalStatus,
        current_vendor_name: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
    })());

    return new Response(JSON.stringify({ job_id: jobId, chains_to_process: chains.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
