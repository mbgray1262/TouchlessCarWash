import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

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
  listing_name: string;
  city: string;
  state: string;
  old_url: string | null;
  new_url: string;
  matched_by: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractCityFromUrl(url: string): string {
  return normalize(url);
}

function scoreMatch(listing: Listing, url: string): { score: number; matchedBy: string } {
  const normalUrl = url.toLowerCase();
  const city = normalize(listing.city);
  const state = listing.state.toLowerCase();
  const zip = listing.zip?.replace(/\D/g, '') || '';

  if (city && normalUrl.includes(`/${city}/`)) {
    if (normalUrl.includes(`/${state}/`) || normalUrl.includes(`-${state}/`) || normalUrl.includes(`/${state}-`)) {
      return { score: 100, matchedBy: 'city+state in path' };
    }
    return { score: 80, matchedBy: 'city in path' };
  }

  const cityWords = listing.city.toLowerCase().split(/\s+/);
  if (cityWords.length > 1) {
    const sluggedCity = cityWords.join('-');
    if (normalUrl.includes(`/${sluggedCity}/`) || normalUrl.includes(`-${sluggedCity}/`) || normalUrl.includes(`/${sluggedCity}-`)) {
      if (normalUrl.includes(`/${state}/`)) {
        return { score: 95, matchedBy: 'slugged-city+state' };
      }
      return { score: 75, matchedBy: 'slugged-city' };
    }
  }

  if (zip && zip.length === 5 && normalUrl.includes(zip)) {
    return { score: 70, matchedBy: 'zip in path' };
  }

  return { score: 0, matchedBy: 'none' };
}

async function scrapeLocationLinks(locationsUrl: string, firecrawlKey: string): Promise<string[]> {
  const resp = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: locationsUrl,
      formats: ['links'],
      onlyMainContent: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firecrawl scrape failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return (data?.data?.links as string[]) || [];
}

function filterLocationLinks(links: string[], baseDomain: string): string[] {
  const domainVariants = [
    baseDomain,
    `www.${baseDomain}`,
  ];

  return links.filter(link => {
    try {
      const u = new URL(link);
      const host = u.hostname.replace(/^www\./, '');
      if (host !== baseDomain) return false;
      const path = u.pathname;
      if (path === '/' || path === '') return false;
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 2) return false;
      return true;
    } catch {
      return false;
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { vendor_id, locations_url, dry_run = true, min_score = 75 } = await req.json();

    if (!vendor_id || !locations_url) {
      return new Response(JSON.stringify({ error: 'vendor_id and locations_url are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: firecrawlSecretData } = await supabase.rpc('get_secret', { secret_name: 'FIRECRAWL_API_KEY' });
    const firecrawlKey = firecrawlSecretData as string;
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY secret not found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, canonical_name, domain')
      .eq('id', vendor_id)
      .maybeSingle();

    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: 'Vendor not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('id, name, address, city, state, zip, website')
      .eq('vendor_id', vendor_id);

    if (listingsError) throw listingsError;
    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ error: 'No listings found for this vendor' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parentUrlVariants = [
      `https://${vendor.domain}`,
      `http://${vendor.domain}`,
      `https://www.${vendor.domain}`,
      `http://www.${vendor.domain}`,
      `https://${vendor.domain}/`,
      `http://${vendor.domain}/`,
      `https://www.${vendor.domain}/`,
      `http://www.${vendor.domain}/`,
    ];

    const listingsNeedingUrls = listings.filter(l =>
      !l.website || parentUrlVariants.includes(l.website)
    );

    const allLinks = await scrapeLocationLinks(locations_url, firecrawlKey);
    const locationLinks = filterLocationLinks(allLinks, vendor.domain);

    const results: MatchResult[] = [];
    const unmatched: Array<{ id: string; name: string; city: string; state: string }> = [];

    for (const listing of listingsNeedingUrls) {
      let bestScore = 0;
      let bestUrl = '';
      let bestMatchedBy = '';

      for (const link of locationLinks) {
        const { score, matchedBy } = scoreMatch(listing as Listing, link);
        if (score > bestScore) {
          bestScore = score;
          bestUrl = link;
          bestMatchedBy = matchedBy;
        }
      }

      if (bestScore >= min_score) {
        results.push({
          listing_id: listing.id,
          listing_name: listing.name,
          city: listing.city,
          state: listing.state,
          old_url: listing.website,
          new_url: bestUrl,
          matched_by: `${bestMatchedBy} (score: ${bestScore})`,
        });
      } else {
        unmatched.push({ id: listing.id, name: listing.name, city: listing.city, state: listing.state });
      }
    }

    if (!dry_run && results.length > 0) {
      const updates = results.map(r =>
        supabase.from('listings').update({ website: r.new_url }).eq('id', r.listing_id)
      );
      await Promise.all(updates);
    }

    return new Response(JSON.stringify({
      vendor_name: vendor.canonical_name,
      domain: vendor.domain,
      total_listings: listings.length,
      listings_needing_urls: listingsNeedingUrls.length,
      location_links_found: locationLinks.length,
      matched: results.length,
      unmatched_count: unmatched.length,
      dry_run,
      results,
      unmatched,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
