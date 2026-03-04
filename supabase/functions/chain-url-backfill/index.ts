import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Process a small batch per invocation to stay within edge function limits
const BATCH_SIZE = 5;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract all <loc> URLs from sitemap XML (works for both urlset and sitemapindex)
function extractLocsFromXml(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>\s*(.*?)\s*<\/loc>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }
  return urls;
}

function isSitemapIndex(xml: string): boolean {
  return xml.includes('<sitemapindex');
}

// Extract href links from raw HTML (no DOM parser needed)
function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href=["'](.*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    try {
      // Resolve relative URLs
      const resolved = new URL(href, baseUrl).href;
      links.push(resolved);
    } catch { /* skip invalid URLs */ }
  }
  return [...new Set(links)]; // deduplicate
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

// ── Sitemap-based URL discovery (FREE — no Firecrawl needed) ────────────────

async function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TouchlessCarWashFinder/1.0)',
        'Accept': 'text/xml, application/xml, text/html, */*',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

async function discoverSitemapUrls(domain: string): Promise<string[]> {
  const allUrls: string[] = [];

  // Step 1: Check robots.txt for Sitemap directives
  const sitemapCandidates: string[] = [];
  for (const prefix of [`https://www.${domain}`, `https://${domain}`]) {
    const robotsTxt = await fetchText(`${prefix}/robots.txt`);
    if (robotsTxt) {
      const sitemapLines = robotsTxt.match(/^Sitemap:\s*(.+)$/gmi);
      if (sitemapLines) {
        for (const line of sitemapLines) {
          const url = line.replace(/^Sitemap:\s*/i, '').trim();
          if (!sitemapCandidates.includes(url)) sitemapCandidates.push(url);
        }
      }
      break; // Found robots.txt, no need to try both prefixes
    }
  }

  // Step 2: Add common sitemap locations as fallback
  const commonPaths = ['/sitemap_index.xml', '/sitemap.xml', '/sitemap/sitemap-index.xml'];
  for (const path of commonPaths) {
    for (const prefix of [`https://www.${domain}`, `https://${domain}`]) {
      const url = `${prefix}${path}`;
      if (!sitemapCandidates.includes(url)) sitemapCandidates.push(url);
    }
  }

  // Step 3: Try each candidate until we find a working sitemap
  for (const sitemapUrl of sitemapCandidates) {
    const xml = await fetchText(sitemapUrl);
    if (!xml || !xml.includes('<loc>')) continue;

    if (isSitemapIndex(xml)) {
      // It's a sitemap index — fetch child sitemaps
      const childUrls = extractLocsFromXml(xml);

      // Prioritize child sitemaps that look location-related
      const locationSitemaps = childUrls.filter(u =>
        /location|store|branch|wash|place/i.test(u)
      );
      const otherSitemaps = childUrls.filter(u =>
        !locationSitemaps.includes(u)
      );

      // Fetch location sitemaps first, then others if needed
      const toFetch = [...locationSitemaps, ...otherSitemaps];

      for (const childUrl of toFetch) {
        const childXml = await fetchText(childUrl);
        if (!childXml) continue;
        const childLocs = extractLocsFromXml(childXml);
        allUrls.push(...childLocs);
      }
    } else {
      // Regular sitemap — extract all URLs
      allUrls.push(...extractLocsFromXml(xml));
    }

    if (allUrls.length > 0) break; // Found URLs, no need to try more candidates
  }

  return allUrls;
}

// ── Fallback: extract links from the actual website pages (FREE) ────────────

async function discoverViaWebpageScraping(
  domain: string,
  anthropicKey: string
): Promise<string[]> {
  const rootUrl = `https://www.${domain}`;

  // Step 1: Fetch the homepage HTML
  const homepageHtml = await fetchText(rootUrl);
  if (!homepageHtml) {
    // Try without www
    const altHtml = await fetchText(`https://${domain}`);
    if (!altHtml) return [];
    return extractLinksFromHtml(altHtml, `https://${domain}`)
      .filter(link => isLocationLikeUrl(link, domain));
  }

  const homepageLinks = extractLinksFromHtml(homepageHtml, rootUrl);

  // Step 2: Use AI to find the locations page URL
  const locPageUrl = await findLocationsPageUrl(anthropicKey, rootUrl, homepageLinks);
  if (!locPageUrl) {
    // No locations page found — return any location-like links from homepage
    return homepageLinks.filter(link => isLocationLikeUrl(link, domain));
  }

  // Step 3: Fetch the locations page and extract links
  const locPageHtml = await fetchText(locPageUrl);
  if (!locPageHtml) return [];

  const locPageLinks = extractLinksFromHtml(locPageHtml, locPageUrl);

  // Step 4: Use AI to identify individual location URLs from the links
  const locationUrls = await extractLocationUrlsFromLinks(
    anthropicKey, domain, locPageUrl, locPageLinks
  );

  return locationUrls;
}

// ── Claude AI helpers ──────────────────────────────────────────────────────────

async function findLocationsPageUrl(
  anthropicKey: string,
  rootUrl: string,
  links: string[]
): Promise<string | null> {
  if (links.length === 0) return null;

  // Filter to same-domain links only
  const domain = new URL(rootUrl).hostname.replace(/^www\./, '');
  const sameDomainLinks = links.filter(link => {
    try {
      return new URL(link).hostname.replace(/^www\./, '') === domain;
    } catch { return false; }
  });

  const linkList = sameDomainLinks.slice(0, 150).join('\n');

  const prompt = `You are helping find the "locations" or "find a store" page for a car wash chain website.

Root URL: ${rootUrl}

Here are all the links found on the homepage:
${linkList}

Which single link URL is most likely the page that lists ALL physical locations / branches / stores for this car wash chain?
Look for links whose URL path suggests: locations, stores, find us, our washes, where to find us, car wash locations, etc.

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

async function extractLocationUrlsFromLinks(
  anthropicKey: string,
  domain: string,
  pageUrl: string,
  links: string[]
): Promise<string[]> {
  // Filter links to same domain
  const domainLinks = links.filter(link => {
    try {
      const u = new URL(link);
      return u.hostname.replace(/^www\./, '') === domain;
    } catch { return false; }
  });

  if (domainLinks.length === 0) return [];

  const prompt = `Extract all individual car wash location/store page URLs from this list of links found on a locations page.

Page URL: ${pageUrl}
Domain: ${domain}

Links found on page (same domain only):
${domainLinks.slice(0, 500).join('\n')}

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

// ── Core processing ────────────────────────────────────────────────────────────

async function getListingsNeedingUpdate(
  supabase: ReturnType<typeof createClient>,
  vendorId: number,
  domain: string
): Promise<Listing[]> {
  const { data: all, error } = await supabase
    .from('listings')
    .select('id, name, address, city, state, zip, website')
    .eq('vendor_id', vendorId)
    .eq('is_touchless', true);

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

  // Stage 1: Discover location URLs via sitemaps (FREE)
  const sitemapUrls = await discoverSitemapUrls(vendor.domain);
  let locationUrls = sitemapUrls.filter(link => isLocationLikeUrl(link, vendor.domain));
  let fallbackUsed = false;

  console.log(`[${vendor.canonical_name}] Sitemap found ${sitemapUrls.length} total URLs, ${locationUrls.length} location-like URLs`);

  // Stage 1b: Fallback — scrape actual website pages if sitemap found too few
  if (locationUrls.length < 3) {
    try {
      console.log(`[${vendor.canonical_name}] Sitemap insufficient, trying webpage scraping fallback...`);
      const fallbackUrls = await discoverViaWebpageScraping(vendor.domain, anthropicKey);
      if (fallbackUrls.length > locationUrls.length) {
        locationUrls = fallbackUrls;
        fallbackUsed = true;
        console.log(`[${vendor.canonical_name}] Fallback found ${fallbackUrls.length} location URLs`);
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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

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
          const r = await processVendor(supabase, vendor, anthropicKey);
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

        // Small delay between vendors
        await sleep(1000);
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
