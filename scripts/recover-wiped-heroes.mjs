#!/usr/bin/env node
/**
 * Recover hero_image values that were silently wiped by the now-fixed
 * useFastCuration "broken hero probe" bug.
 *
 * Strategy: for each touchless listing currently with hero_image=null,
 * list files in the `listing-photos/{id}/` folder in Supabase storage.
 * If any hero-* crops exist, restore the most recent one.
 *
 * Conservative: only touches listings with hero_image=null. Never
 * overwrites an existing hero. Sets hero_image_source='manual' since
 * these files originally came from manual curation.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env = readFileSync(resolve(repoRoot,'.env.local'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'))
  .reduce((a,l)=>{const [k,...r]=l.split('=');if(k)a[k.trim()]=r.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const LOG = resolve(repoRoot, 'scripts/recover-wiped-heroes.log');
const STORAGE_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos`;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

function log(m) {
  const line = `[${new Date().toISOString().slice(11,19)}] ${m}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

async function findHeroInStorage(listingId) {
  const { data, error } = await sb.storage.from('listing-photos').list(listingId, {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !data) return null;

  const heroFiles = data.filter(f =>
    /^hero-cropped|^hero-/i.test(f.name) && f.name.match(/\.(jpg|jpeg|png|webp)$/i),
  );
  if (heroFiles.length === 0) return null;

  heroFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return `${STORAGE_URL}/${listingId}/${heroFiles[0].name}`;
}

async function main() {
  appendFileSync(LOG, `\n=== recover-wiped-heroes ${new Date().toISOString()} (dry=${DRY_RUN}) ===\n`);

  const PAGE = 1000;
  const targets = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('listings')
      .select('id, name, city, state, hero_image, hero_image_source, is_approved')
      .eq('is_touchless', true).is('hero_image', null)
      .range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    targets.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  log(`Touchless listings with null hero_image: ${targets.length}`);

  const work = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
  log(`Scanning storage for ${work.length} listing folders...\n`);

  let restored = 0, noFiles = 0, errors = 0;
  for (let i = 0; i < work.length; i++) {
    const l = work[i];
    try {
      const heroUrl = await findHeroInStorage(l.id);
      if (!heroUrl) { noFiles++; continue; }
      if (DRY_RUN) {
        log(`  [DRY] ${l.id.slice(0,8)} ${l.name.slice(0,35).padEnd(35)} → ${heroUrl.split('/').pop()}`);
        restored++;
      } else {
        const { error } = await sb.from('listings').update({
          hero_image: heroUrl,
          hero_image_source: 'manual',
          crawl_notes: `[${new Date().toISOString().slice(0,10)}] Hero restored from Supabase storage after client-side HEAD-probe bug nulled it.`,
        }).eq('id', l.id);
        if (error) { errors++; log(`  ⚠ ${l.id.slice(0,8)} ${l.name}: ${error.message.slice(0,80)}`); }
        else { restored++; log(`  ✓ ${l.id.slice(0,8)} ${l.name.slice(0,35).padEnd(35)} → ${heroUrl.split('/').pop()}`); }
      }
    } catch (e) {
      errors++;
      log(`  ⚠ ${l.id.slice(0,8)} ${l.name}: ${e.message.slice(0,80)}`);
    }
    if ((i + 1) % 50 === 0) log(`  progress ${i+1}/${work.length} — restored=${restored} noFiles=${noFiles} err=${errors}`);
  }
  log(`\nDONE: restored=${restored}  no-files-in-storage=${noFiles}  errors=${errors}`);
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
