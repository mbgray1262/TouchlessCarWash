import postgres from 'npm:postgres@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const BLACKLIST = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com',
  'yelp.com', 'google.com', 'tiktok.com', 'linkedin.com', 'mapquest.com',
  'yellowpages.com', 'bbb.org',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ssl: 'require' });

  try {
    const rows = await sql`
      WITH extracted AS (
        SELECT
          id,
          name,
          regexp_replace(
            lower(
              regexp_replace(
                regexp_replace(website, '^https?://', ''),
                '/.*$', ''
              )
            ),
            '^www\\.', ''
          ) AS domain
        FROM listings
        WHERE vendor_id IS NULL
          AND website IS NOT NULL
          AND website <> ''
      ),
      filtered AS (
        SELECT *
        FROM extracted
        WHERE domain IS NOT NULL
          AND domain <> ''
          AND length(domain) >= 4
          AND domain != ALL(${BLACKLIST})
      ),
      grouped AS (
        SELECT
          f.domain,
          count(*) AS listing_count,
          array_agg(f.id) AS listing_ids,
          (array_agg(f.name ORDER BY f.name))[1:5] AS sample_names
        FROM filtered f
        GROUP BY f.domain
      )
      SELECT
        g.domain,
        g.listing_count,
        g.listing_ids,
        g.sample_names,
        v.id::bigint AS vendor_id,
        v.canonical_name AS vendor_name
      FROM grouped g
      LEFT JOIN vendors v ON lower(v.domain) = g.domain
      ORDER BY g.listing_count DESC
    `;

    return new Response(JSON.stringify(rows), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end();
  }
});
