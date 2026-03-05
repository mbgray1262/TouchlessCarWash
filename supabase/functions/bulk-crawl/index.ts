import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BulkCrawlRequest {
  listing_ids?: string[];
  listingIds?: string[];
  delay_ms?: number;
  delayMs?: number;
  batch_size?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and decode common entities to get plain text. */
function htmlToText(html: string): string {
  // Remove script, style, noscript, and SVG blocks entirely
  let text = html.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** Convert HTML to a rough markdown-like format preserving structure. */
function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove script, style, noscript, SVG
  md = md.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Convert headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Convert lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // Convert paragraphs and divs to newlines
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/div>/gi, '\n');

  // Convert bold and italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Convert links (keep the text and URL)
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Remove all remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  // Clean up excessive whitespace while preserving paragraph breaks
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

/** Extract image URLs from HTML. */
function extractImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  const addImage = (url: string) => {
    if (!url || url.startsWith('data:')) return;
    // Resolve relative URLs
    try {
      const resolved = new URL(url, baseUrl).href;
      const lower = resolved.toLowerCase();
      if (lower.includes('favicon') || lower.endsWith('.gif') || lower.endsWith('.svg')) return;
      if (lower.includes('recaptcha') || lower.includes('gravatar') || lower.includes('pixel')) return;
      if (lower.includes('tracking') || lower.includes('analytics') || lower.includes('1x1')) return;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    } catch { /* invalid URL, skip */ }
  };

  // Extract from <img> tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    addImage(match[1]);
  }

  // Extract from srcset
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const srcset = match[1];
    for (const entry of srcset.split(',')) {
      const url = entry.trim().split(/\s+/)[0];
      if (url) addImage(url);
    }
  }

  return images.slice(0, 30);
}

/** Extract metadata from HTML <head>. */
function extractMetadata(html: string): Record<string, string> {
  const meta: Record<string, string> = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();

  // Meta tags
  const metaRegex = /<meta[^>]+(name|property|content)=["']([^"']*)["'][^>]+(name|property|content)=["']([^"']*)["'][^>]*\/?>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    let key = '', value = '';
    if (match[1] === 'content') { value = match[2]; key = match[4]; }
    else if (match[3] === 'content') { value = match[4]; key = match[2]; }
    if (key && value) meta[key.toLowerCase()] = value;
  }

  // Also try reverse order (content first)
  const metaRegex2 = /<meta[^>]+(?:name|property)=["']([^"']*)["'][^>]+content=["']([^"']*)["'][^>]*\/?>/gi;
  while ((match = metaRegex2.exec(html)) !== null) {
    meta[match[1].toLowerCase()] = match[2];
  }
  const metaRegex3 = /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']([^"']*)["'][^>]*\/?>/gi;
  while ((match = metaRegex3.exec(html)) !== null) {
    meta[match[2].toLowerCase()] = match[1];
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: BulkCrawlRequest = await req.json();
    const listingIds = body.listing_ids || body.listingIds || [];
    const delayMs = body.delay_ms ?? body.delayMs ?? 500;
    const batchSize = body.batch_size || 0;
    const offset = body.offset || 0;

    // If no listing_ids provided, auto-discover pending listings that need crawling
    let idsToProcess: string[] = listingIds;

    if (idsToProcess.length === 0 && batchSize > 0) {
      let query = supabase
        .from("listings")
        .select("id")
        .is("crawl_snapshot", null)
        .not("website", "is", null)
        .order("review_count", { ascending: false });

      if (offset > 0) {
        query = query.range(offset, offset + batchSize - 1);
      } else {
        query = query.limit(batchSize);
      }

      const { data: pending } = await query;
      idsToProcess = (pending || []).map((r: { id: string }) => r.id);
    }

    if (idsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No listings to crawl. Provide listing_ids or batch_size." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: listings, error: fetchError } = await supabase
      .from("listings")
      .select("id, name, website")
      .in("id", idsToProcess);

    if (fetchError || !listings) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      id: string;
      name: string;
      status: "crawled" | "crawl_failed" | "no_website";
      content_length: number;
      photos_found: number;
      error?: string;
    }> = [];

    for (const listing of listings) {
      if (!listing.website) {
        await supabase.from("listings").update({
          crawl_status: "no_website",
          verification_status: "crawl_failed",
          crawl_notes: "No website available",
          last_crawled_at: new Date().toISOString(),
        }).eq("id", listing.id);

        results.push({ id: listing.id, name: listing.name, status: "no_website", content_length: 0, photos_found: 0 });
        continue;
      }

      try {
        // Direct fetch with a reasonable timeout and browser-like User-Agent
        const res = await fetch(listing.website, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; TouchlessCarWashFinder/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
          throw new Error(`Not HTML: ${contentType}`);
        }

        const html = await res.text();

        // Parse the HTML
        const markdown = htmlToMarkdown(html);
        const images = extractImages(html, listing.website);
        const metadata = extractMetadata(html);

        // Build snapshot in the same format downstream functions expect
        const snapshot = {
          success: true,
          data: {
            markdown: markdown.substring(0, 100000), // Cap at 100KB
            html: undefined, // Don't store raw HTML (too large)
            images,
            metadata: {
              title: metadata.title || metadata["og:title"] || "",
              description: metadata.description || metadata["og:description"] || "",
              "og:image": metadata["og:image"] || "",
              "og:title": metadata["og:title"] || "",
              "og:description": metadata["og:description"] || "",
              sourceURL: listing.website,
              statusCode: res.status,
            },
          },
        };

        await supabase.from("listings").update({
          crawl_status: "crawled",
          verification_status: "crawled",
          crawl_snapshot: snapshot,
          last_crawled_at: new Date().toISOString(),
          crawl_notes: null,
        }).eq("id", listing.id);

        results.push({
          id: listing.id,
          name: listing.name,
          status: "crawled",
          content_length: markdown.length,
          photos_found: images.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("listings").update({
          crawl_status: "failed",
          verification_status: "crawl_failed",
          crawl_notes: msg.slice(0, 500),
          last_crawled_at: new Date().toISOString(),
        }).eq("id", listing.id);

        results.push({
          id: listing.id,
          name: listing.name,
          status: "crawl_failed",
          content_length: 0,
          photos_found: 0,
          error: msg.slice(0, 200),
        });
      }

      // Small delay between requests to be polite
      if (delayMs > 0 && listing !== listings[listings.length - 1]) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    const summary = {
      total: results.length,
      crawled: results.filter(r => r.status === "crawled").length,
      failed: results.filter(r => r.status === "crawl_failed").length,
      no_website: results.filter(r => r.status === "no_website").length,
    };

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
