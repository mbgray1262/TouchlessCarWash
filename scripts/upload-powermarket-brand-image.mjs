#!/usr/bin/env node
/**
 * Upload Power Market brand image to Supabase storage.
 * Run: node scripts/upload-powermarket-brand-image.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local
const envPath = resolve(__dirname, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEST_PATH = 'chain-brands/power-market.jpg';
const BUCKET = 'listing-photos';

async function main() {
  // Accept a local file path as CLI arg, or fall back to fetching from URL
  const localPath = process.argv[2];
  let buffer;

  if (localPath) {
    console.log(`Reading local file: ${localPath}`);
    buffer = readFileSync(resolve(localPath));
    console.log(`Read ${buffer.length} bytes`);
  } else {
    const IMAGE_URL = 'https://b3671101.smushcdn.com/3671101/wp-content/uploads/2019/08/60004128_2585065314845938_1998167778514698240_o-1.jpg?lossy=2&strip=1&webp=1';
    console.log('Fetching Power Market brand image...');
    const res = await fetch(IMAGE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TouchlessCarWash/1.0)' },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    buffer = Buffer.from(await res.arrayBuffer());
    console.log(`Downloaded ${buffer.length} bytes`);
  }

  // Upload to Supabase storage
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(DEST_PATH, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(DEST_PATH);
  console.log('✅ Uploaded successfully!');
  console.log(`Public URL: ${publicUrl}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
