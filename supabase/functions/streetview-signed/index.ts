const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

/**
 * Sign a Google Street View Static API URL using HMAC-SHA1.
 *
 * Google caps unsigned requests at 640x640. Signing with the URL signing
 * secret unlocks up to 2048x2048.
 *
 * Query params: pano, heading, pitch, fov (all required)
 * Returns JSON: { url: "<signed Street View URL>" }
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pano = url.searchParams.get('pano');
    const heading = url.searchParams.get('heading') ?? '0';
    const pitch = url.searchParams.get('pitch') ?? '0';
    const fov = url.searchParams.get('fov') ?? '90';

    if (!pano) {
      return Response.json(
        { error: 'pano parameter is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
    const signingSecret = Deno.env.get('GOOGLE_URL_SIGNING_SECRET') ?? '';

    if (!googleApiKey) {
      return Response.json(
        { error: 'GOOGLE_PLACES_API_KEY not configured' },
        { status: 500, headers: corsHeaders },
      );
    }

    // Build the unsigned path + query
    const pathAndQuery =
      `/maps/api/streetview?size=2048x2048&pano=${encodeURIComponent(pano)}` +
      `&heading=${encodeURIComponent(heading)}` +
      `&pitch=${encodeURIComponent(pitch)}` +
      `&fov=${encodeURIComponent(fov)}` +
      `&key=${encodeURIComponent(googleApiKey)}`;

    let finalUrl: string;

    if (signingSecret) {
      // Decode the modified-base64url secret
      const base64 = signingSecret.replace(/-/g, '+').replace(/_/g, '/');
      const binaryStr = atob(base64);
      const keyBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        keyBytes[i] = binaryStr.charCodeAt(i);
      }

      // HMAC-SHA1 sign the path+query
      const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign'],
      );
      const encoder = new TextEncoder();
      const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(pathAndQuery));

      // Base64url-encode the signature
      const sigBytes = new Uint8Array(sigBuffer);
      let sigBinary = '';
      for (let i = 0; i < sigBytes.length; i++) {
        sigBinary += String.fromCharCode(sigBytes[i]);
      }
      const signature = btoa(sigBinary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      finalUrl = `https://maps.googleapis.com${pathAndQuery}&signature=${signature}`;
    } else {
      // No signing secret configured -- return unsigned URL (will be capped at 640x640)
      finalUrl = `https://maps.googleapis.com${pathAndQuery}`;
    }

    return Response.json({ url: finalUrl }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
});
