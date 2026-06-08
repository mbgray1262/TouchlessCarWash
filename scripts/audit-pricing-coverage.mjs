import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Paginate to dodge the 1000-row cap
async function fetchAll() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listings')
      .select('id, website, wash_packages, extracted_data')
      .eq('is_approved', true)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const rows = await fetchAll();

const hasWebsite = (l) => !!l.website && l.website.trim().length > 0;
const hasPackages = (l) => Array.isArray(l.wash_packages) && l.wash_packages.length > 0;
const hasMembership = (l) =>
  Array.isArray(l.extracted_data?.membership_plans) &&
  l.extracted_data.membership_plans.length > 0;
const hasAnyPricing = (l) => hasPackages(l) || hasMembership(l);

const total = rows.length;
const withSite = rows.filter(hasWebsite);
const pkg = rows.filter(hasPackages);
const mem = rows.filter(hasMembership);
const any = rows.filter(hasAnyPricing);

// Of listings that HAVE a website (crawlable), how many are missing pricing?
const crawlableMissing = withSite.filter((l) => !hasAnyPricing(l));

const pct = (n) => ((n / total) * 100).toFixed(1) + '%';

console.log('\n=== PRICING COVERAGE: approved listings ===');
console.log(`Total approved listings:            ${total}`);
console.log(`  with a website (crawlable):       ${withSite.length}  (${pct(withSite.length)})`);
console.log('');
console.log(`Has wash packages:                  ${pkg.length}  (${pct(pkg.length)})`);
console.log(`Has membership plans:               ${mem.length}  (${pct(mem.length)})`);
console.log(`Has ANY pricing (pkg or member):    ${any.length}  (${pct(any.length)})`);
console.log(`Has NO pricing at all:              ${total - any.length}  (${pct(total - any.length)})`);
console.log('');
console.log(`Crawlable but missing pricing:      ${crawlableMissing.length}`);
console.log(`  (have a website we could re-mine, but no packages/plans stored)`);
