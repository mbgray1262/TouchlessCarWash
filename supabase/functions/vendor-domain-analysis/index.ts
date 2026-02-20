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
    const rows = await sql`SELECT * FROM vendor_domain_analysis(${BLACKLIST})`;

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
