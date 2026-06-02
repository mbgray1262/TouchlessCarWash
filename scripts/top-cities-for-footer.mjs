// Read-only: compute the top cities by approved touchless listing count for the footer.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
  ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
  ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
  ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];
const stateName = new Map(US_STATES);
const validCodes = new Set(US_STATES.map((s) => s[0]));
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stateSlug = (code) => (stateName.has(code) ? slugify(stateName.get(code)) : code.toLowerCase());

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const counts = new Map(); // key: `${state}||${city}` -> count
let offset = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await supabase
    .from('listings')
    .select('city, state')
    .eq('is_touchless', true)
    .eq('is_approved', true)
    .range(offset, offset + PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  for (const r of data) {
    if (!r.city || !r.city.trim()) continue;
    if (!validCodes.has(r.state)) continue;
    const key = `${r.state}||${r.city.trim()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (data.length < PAGE) break;
  offset += PAGE;
}

const top = Array.from(counts.entries())
  .map(([key, count]) => {
    const [code, city] = key.split('||');
    return { name: city, stateCode: code, stateSlug: stateSlug(code), citySlug: slugify(city), count };
  })
  .sort((a, b) => b.count - a.count)
  .slice(0, 30);

console.log('Top 30 cities by approved touchless count:\n');
for (const c of top) console.log(`  ${String(c.count).padStart(3)}  ${c.name}, ${c.stateCode}`);

console.log('\n--- TS array ---\n');
for (const c of top) {
  console.log(`  { name: '${c.name.replace(/'/g, "\\'")}', stateSlug: '${c.stateSlug}', citySlug: '${c.citySlug}', stateCode: '${c.stateCode}' },`);
}
