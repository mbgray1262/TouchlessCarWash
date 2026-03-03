import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';
// Process a small batch per invocation to stay within edge function limits
const BATCH_SIZE = 10;
// Max listings per Claude matching call to keep prompt size reasonable
const MATCH_BATCH_SIZE = 50;

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

// ── Firecrawl helpers ──────────────────────────────────────────────────────────

async function scrapeWithFirecrawl(
  url: string,
  firecrawlKey: string,
  formats: string[],
  waitFor?: number
): Promise<{ markdown: string; links: string[] }> {
  const body: Record<string, unknown> = { url, formats, onlyMainContent: false };
  if (waitFor) body.waitFor = waitFor;
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { markdown: '', links: [] };
  const data = await response.json();
  return {
    markdown: data.data?.markdown || '',
    links: data.data?.links || [],
  };
}

function isLocationLikeUrl(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== domain) return false;
    const path = u.pathname;
    if (path === '/' || path === '') return false;
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 1) return false;

    const pathLower = path.toLowerCase();

    const skipPrefixes = [
      '/blog', '/news', '/press', '/about', '/contact', '/careers', '/jobs',
      '/privacy', '/terms', '/faq', '/help', '/support', '/login', '/signup',
      '/account', '/cart', '/shop', '/product', '/pricing', '/membership',
      '/api', '/cdn', '/assets', '/static', '/img', '/images', '/css', '/js',
      '/wp-', '/wp-content', '/wp-admin', '/app/', '/sitemap',
      '/services', '/service/', '/menu', '/reviews', '/gallery', '/media',
      '/tag/', '/category/', '/author/',
    ];
    if (skipPrefixes.some(p => pathLower.startsWith(p))) return false;

    if (/^\/\d{4}\/\d{2}\//.test(path)) return false;
    if (/\.(xml|json|css|js|jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|txt)(\?|$)/.test(pathLower)) return false;

    const locationPrefixes = [
      '/location', '/find-a', '/store', '/branch', '/site/', '/wash/',
      '/car-wash/', '/office/', '/w2gm-location/',
    ];
    const hasLocationPrefix = locationPrefixes.some(p => pathLower.startsWith(p));
    if (!hasLocationPrefix && segments.length < 2) return false;

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
      limit: 1000,
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

// ── Claude AI helpers ──────────────────────────────────────────────────────────

async function findLocationsPageUrl(
  anthropicKey: string,
  rootUrl: string,
  pageMarkdown: string,
  links: string[]
): Promise<string | null> {
  if (links.length === 0) return null;

  const linkList = links.slice(0, 100).join('\n');

  const prompt = `You are helping find the "locations" or "find a store" page for a car wash chain website.

Root URL: ${rootUrl}

Here are all the links found on the page:
${linkList}

Here is the page content (truncated):
${pageMarkdown.substring(0, 3000)}

Which single link URL is most likely the page that lists ALL physical locations / branches / stores for this car wash chain?
Look for links whose URL path or surrounding context suggests: locations, stores, find us, our washes, where to find us, car wash locations, etc.

Respond with ONLY the full URL string, nothing else. If you cannot identify any such link, respond with the single word: none`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const answer: string = (data.content[0].text || '').trim();
  if (!answer || answer.toLowerCase() === 'none') return null;

  if (answer.startsWith('http')) return answer;
  return `${rootUrl.replace(/\/$/, '')}${answer.startsWith('/') ? answer : `/${answer}`}`;
}

async function matchListingsWithClaude(
  listings: Listing[],
  locationUrls: string[],
  vendorName: string,
  anthropicKey: string
): Promise<MatchResult[]> {
  if (listings.length === 0 || locationUrls.length === 0) return [];

  const listingLines = listings.map(l =>
    `ID:${l.id} | ${l.name} | ${l.address}, ${l.city}, ${l.state} ${l.zip}`
  ).join('\n');

  const urlLines = locationUrls.map((u, i) => `${i}: ${u}`).join('\n');

  const prompt = `You are matching car wash location URLs to known business listings for the chain "${vendorName}".

LISTINGS (each with a unique ID):
${listingLines}

DISCOVERED URLs (numbered):
${urlLines}

Match each listing to the URL that represents its specific location page. URLs may contain:
- City and/or state in the path (e.g., /locations/boston-ma)
- Store numbers (e.g., /store/1234)
- Abbreviated or encoded location names (e.g., /loc/spfld)
- Custom slugs or IDs (e.g., /wash/downtown-plaza)
- Street names, neighborhoods, or zip codes
- Combinations of the above (e.g., /locations/1234-boston-ma)

For each listing, find the BEST matching URL by reasoning about what geographic or identifying information is in the URL.

Respond with ONLY a JSON array of matches:
[{"listing_id":"uuid-here","url_index":3,"confidence":"high"},...]

Rules:
- Only include matches where you are reasonably confident (high or medium)
- A URL should match at most one listing
- A listing should match at most one URL
- If no good match exists for a listing, omit it from the array
- Do NOT guess — omit uncertain matches
- "high" confidence means city+state or address clearly appears in URL
- "medium" confidence means partial match (e.g., only city name, or store number correlates)`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`Claude matching API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const text: string = data.content[0]?.text || '';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const matches = JSON.parse(jsonMatch[0]) as Array<{
      listing_id: string;
      url_index: number;
      confidence: string;
    }>;

    // Deduplicate: one URL per listing, one listing per URL
    const usedUrls = new Set<number>();
    const results: MatchResult[] = [];

    for (const m of matches) {
      if (
        m.url_index >= 0 &&
        m.url_index < locationUrls.length &&
        !usedUrls.has(m.url_index) &&
        (m.confidence === 'high' || m.confidence === 'medium')
      ) {
        usedUrls.add(m.url_index);
        results.push({
          listing_id: m.listing_id,
          new_url: locationUrls[m.url_index],
        });
      }
    }

    return results;
  } catch (err) {
    console.error('Failed to parse Claude matching response:', err);
    return [];
  }
}

async function extractLocationUrlsFromPage(
  anthropicKey: string,
  domain: string,
  pageUrl: string,
  pageMarkdown: string,
  pageLinks: string[]
): Promise<string[]> {
  // Filter links to same domain first
  const domainLinks = pageLinks.filter(link => {
    try {
      const u = new URL(link);
      return u.hostname.replace(/^www\./, '') === domain;
    } catch { return false; }
  });

  const prompt = `Extract all individual car wash location/store page URLs from this locations page.

Page URL: ${pageUrl}
Domain: ${domain}

Links found on page (same domain only):
${domainLinks.slice(0, 300).join('\n')}

Page content (truncated):
${pageMarkdown.substring(0, 10000)}

Return ONLY a JSON array of individual location page URLs. These are URLs that each lead to a SPECIFIC store/location page — not the main locations index, not the homepage, not service pages.

Examples of good location URLs:
- https://example.com/locations/boston-ma
- https://example.com/store/1234
- https://example.com/car-wash/downtown-dallas

Return: ["url1", "url2", ...]
If no individual location URLs can be identified, return: []`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const text: string = data.content[0]?.text || '';

  try {
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) return [];
    const urls = JSON.parse(arrMatch[0]);
    return (urls as string[]).filter(
      u => typeof u === 'string' && u.startsWith('http')
    );
  } catch {
    return [];
  }
}

// ── Fallback: discover URLs via locations page scraping ────────────────────────

async function discoverViaLocationsPage(
  domain: string,
  firecrawlKey: string,
  anthropicKey: string
): Promise<string[]> {
  const rootUrl = `https://www.${domain}`;

  // Step 1: Scrape the homepage
  const rootResult = await scrapeWithFirecrawl(rootUrl, firecrawlKey, ['markdown', 'links']);
  if (!rootResult.markdown && rootResult.links.length === 0) return [];

  // Step 2: Find the locations page
  const locPageUrl = await findLocationsPageUrl(
    anthropicKey, rootUrl, rootResult.markdown, rootResult.links
  );
  if (!locPageUrl) return [];

  // Step 3: Scrape the locations page (with JS wait)
  let locResult = await scrapeWithFirecrawl(locPageUrl, firecrawlKey, ['markdown', 'links']);
  if (locResult.markdown.length < 300) {
    locResult = await scrapeWithFirecrawl(locPageUrl, firecrawlKey, ['markdown', 'links'], 3000);
  }
  if (!locResult.markdown && locResult.links.length === 0) return [];

  // Step 4: Extract individual location URLs from the page
  const urls = await extractLocationUrlsFromPage(
    anthropicKey, domain, locPageUrl, locResult.markdown, locResult.links
  );

  return urls;
}

// ── Core processing ────────────────────────────────────────────────────────────

async function getListingsNeedingUpdate(
  supabase: ReturnType<typeof createClient>,
  vendorId: number,
  domain: string
): Promise<Listing[]> {
  const { data: all, error } = await supabase
    .from('listings')
    .select('id, name, address, city, state, zip, website')
    .eq('vendor_id', vendorId);

  if (error) throw new Error(error.message);
  if (!all) return [];

  return (all as Listing[]).filter(l => {
    if (!l.website) return true;
    try {
      const u = new URL(l.website);
      const host = u.hostname.replace(/^www\./, '');
      const isRoot = (u.pathname === '/' || u.pathname === '') && !u.search;
      return host === domain && isRoot;
    } catch {
      return false;
    }
  });
}

async function processVendor(
  supabase: ReturnType<typeof createClient>,
  vendor: { id: number; canonical_name: string; domain: string },
  firecrawlKey: string,
  anthropicKey: string
): Promise<{
  matched: number;
  unmatched: number;
  links_found: number;
  locations_url: string;
  fallback_used: boolean;
  error?: string;
}> {
  const listings = await getListingsNeedingUpdate(supabase, vendor.id, vendor.domain);

  if (listings.length === 0) {
    return { matched: 0, unmatched: 0, links_found: 0, locations_url: `https://www.${vendor.domain}`, fallback_used: false };
  }

  // Stage 1: Discover location URLs via /map
  let locationUrls = await discoverLocationUrls(vendor.domain, firecrawlKey);
  let fallbackUsed = false;

  // Stage 1b: Fallback — scrape locations page if /map found too few
  if (locationUrls.length < 3) {
    try {
      const fallbackUrls = await discoverViaLocationsPage(vendor.domain, firecrawlKey, anthropicKey);
      if (fallbackUrls.length > locationUrls.length) {
        locationUrls = fallbackUrls;
        fallbackUsed = true;
      }
    } catch (err) {
      console.error(`Fallback failed for ${vendor.domain}:`, err);
    }
  }

  if (locationUrls.length === 0) {
    return {
      matched: 0,
      unmatched: listings.length,
      links_found: 0,
      locations_url: `https://www.${vendor.domain}`,
      fallback_used: fallbackUsed,
    };
  }

  // Stage 2: AI-powered matching (process in batches to keep prompt size reasonable)
  const allMatches: MatchResult[] = [];

  for (let i = 0; i < listings.length; i += MATCH_BATCH_SIZE) {
    const batch = listings.slice(i, i + MATCH_BATCH_SIZE);
    try {
      const batchMatches = await matchListingsWithClaude(
        batch, locationUrls, vendor.canonical_name, anthropicKey
      );
      allMatches.push(...batchMatches);
    } catch (err) {
      console.error(`Claude matching failed for batch ${i}:`, err);
    }
  }

  // Stage 3: Update matched listings
  if (allMatches.length > 0) {
    await Promise.all(
      allMatches.map(m =>
        supabase.from('listings')
          .update({ website: m.new_url })
          .eq('id', m.listing_id)
      )
    );
  }

  return {
    matched: allMatches.length,
    unmatched: listings.length - allMatches.length,
    links_found: locationUrls.length,
    locations_url: `https://www.${vendor.domain}`,
    fallback_used: fallbackUsed,
  };
}

// ── Self-invocation for batch continuation ─────────────────────────────────────

async function selfInvoke(supabaseUrl: string, anonKey: string, jobId: number, offset: number) {
  fetch(`${supabaseUrl}/functions/v1/chain-url-backfill`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'continue', job_id: jobId, offset }),
  }).catch(() => {});
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';

    // ── STATUS ──────────────────────────────────────────────────────────────
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

    // ── CANCEL ───────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const jobId = body.job_id;
      await supabase.from('chain_url_backfill_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── START ────────────────────────────────────────────────────────────────
    if (action === 'start') {
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

      EdgeRuntime.waitUntil(selfInvoke(supabaseUrl, anonKey, jobId, 0));

      return new Response(JSON.stringify({ job_id: jobId, chains_to_process: chains.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CONTINUE (called by self-invoke) ─────────────────────────────────────
    if (action === 'continue') {
      const jobId: number = body.job_id;
      const offset: number = body.offset ?? 0;

      const { data: jobCheck } = await supabase
        .from('chain_url_backfill_jobs')
        .select('status, total_chains, chains_processed, total_matched, total_unmatched')
        .eq('id', jobId)
        .maybeSingle();

      if (!jobCheck || jobCheck.status === 'cancelled') {
        return new Response(JSON.stringify({ ok: true, stopped: 'cancelled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: chains, error: chainsError } = await supabase.rpc('get_chains_with_parent_urls');
      if (chainsError) throw new Error(chainsError.message);
      if (!chains) throw new Error('No chains returned');

      const batch = chains.slice(offset, offset + BATCH_SIZE);

      let processed = jobCheck.chains_processed;
      let totalMatched = jobCheck.total_matched;
      let totalUnmatched = jobCheck.total_unmatched;

      for (const vendor of batch) {
        // Re-check cancel between each vendor
        const { data: mid } = await supabase
          .from('chain_url_backfill_jobs')
          .select('status')
          .eq('id', jobId)
          .maybeSingle();
        if (mid?.status === 'cancelled') break;

        await supabase.from('chain_url_backfill_jobs').update({
          current_vendor_name: vendor.canonical_name,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        let result = {
          matched: 0,
          unmatched: 0,
          links_found: 0,
          locations_url: '',
          fallback_used: false,
          error: undefined as string | undefined,
        };

        try {
          const r = await processVendor(supabase, vendor, firecrawlKey, anthropicKey);
          result = { ...r, error: r.error };
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
          fallback_used: result.fallback_used,
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

        // Small delay between vendors to be respectful to APIs
        await new Promise(r => setTimeout(r, 300));
      }

      const nextOffset = offset + BATCH_SIZE;

      if (nextOffset >= chains.length) {
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
      } else {
        EdgeRuntime.waitUntil(selfInvoke(supabaseUrl, anonKey, jobId, nextOffset));
      }

      return new Response(JSON.stringify({ ok: true, next_offset: nextOffset }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
