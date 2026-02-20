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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/vendor_domain_analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Range': '0-999999',
        'Range-Unit': 'items',
        'Prefer': 'count=none',
      },
      body: JSON.stringify({ blacklist: BLACKLIST }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PostgREST error ${res.status}: ${text}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
