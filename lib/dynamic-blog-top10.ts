/**
 * Dynamic content generator for /blog/top-10-touchless-car-wash-chains.
 *
 * Fetches live chain counts from the DB, sorts by location count, and
 * generates the markdown content with real-time data. The blog page
 * uses this instead of the static `content` stored in blog_posts.
 */
import { publicListings } from '@/lib/public-listings';
import { CHAINS } from '@/lib/chains';

type ChainStats = {
  name: string;
  slug: string;
  count: number;
  states: string[];
  avgRating: number;
  totalReviews: number;
  equipment: string;
};

// Equipment summary per chain (from prior research).
const EQUIPMENT: Record<string, string> = {
  Sheetz: 'PDQ LaserWash 360 Plus',
  'Holiday Stationstores': 'PDQ LaserWash / Washworld',
  'Power Market': 'Istobal',
  'Kwik Trip': 'PDQ / Washworld',
  'Super Wash': 'Super Wash Supermatic',
  'Extra Mile': 'Istobal',
  'Pinnacle 365': 'Istobal',
  'Drive & Shine': 'PDQ LaserWash 360 Plus',
  "Terrible's": 'PDQ / Mark VII',
  'Delta Sonic': 'PDQ / Washworld',
  BP: 'PDQ',
  Autowash: 'Washworld Razor',
  'Brown Bear': 'PDQ / Washworld',
  'Elephant Car Wash': 'PDQ / Washworld',
  'Gorilla Wash': 'PDQ',
};

// 2-3 sentence chain description used in the per-chain section.
const CHAIN_NARRATIVE: Record<string, (s: ChainStats) => string> = {
  Sheetz: (s) =>
    `Sheetz is both the largest convenience-store car wash operator in the U.S. and the largest touchless car wash chain by location count. Every single Sheetz car wash uses the **[PDQ LaserWash 360 Plus](/equipment/pdq)** — a high-pressure touchless in-bay automatic system that cleans using only water jets and specialized detergents. No brushes, no cloth, no foam pads.\n\nWith **${s.count} touchless locations across ${s.states.join(', ')}**, Sheetz has the densest touchless footprint in the Mid-Atlantic and Ohio Valley. Their locations are open 24/7 and pair the car wash with made-to-order food, fuel, and their famous coffee.`,
  'Holiday Stationstores': (s) =>
    `Now part of the Circle K family, Holiday Stationstores operates **${s.count} Touch Free car washes across the upper Midwest** — primarily ${s.states.join(', ')}. They're the dominant touchless option for anyone driving the northern tier.\n\nHoliday uses a mix of **PDQ LaserWash and Washworld Razor** equipment depending on the location. The older locations tend to have PDQ, while newer installations lean toward Washworld's Razor line.`,
  'Power Market': (s) =>
    `Power Market is part of the **H&S Energy Group**, a California-based convenience store and fuel operator. Every single Power Market car wash uses **Istobal touchless equipment** — a Spanish manufacturer whose in-bay automatic systems are standard across all H&S Energy brands (including Extra Mile and Pinnacle 365, also on this list).\n\nWith ${s.count} locations concentrated in ${s.states.join(', ')}, Power Market has the densest touchless presence on the West Coast outside of purpose-built car wash chains.`,
  'Kwik Trip': (s) =>
    `Kwik Trip is the beloved Midwest convenience store chain, operating **${s.count} touchless car washes** across ${s.states.join(' and ')}. Kwik Trip publishes an official per-location list distinguishing Touch Free from Soft Wash bays — our listings include only their verified Touch Free locations.\n\nKwik Trip uses both **PDQ and Washworld** equipment across their locations, and many sites are open 24/7.`,
  'Super Wash': (s) =>
    `Super Wash is unique on this list: it's the **only chain with coast-to-coast presence**, operating ${s.count} touchless locations across **${s.states.length} states** from ${s.states[0]} to ${s.states[s.states.length - 1]}. They're also unique in that Super Wash **manufactures their own in-bay automatic equipment** — the Super Wash Supermatic — rather than buying from PDQ or Washworld.\n\nSuper Wash is primarily a self-serve and touchless automatic car wash operator (not a convenience store), meaning customers visit specifically for the wash. Many locations operate 24 hours.`,
  'Extra Mile': (s) =>
    `Extra Mile is **Chevron's convenience store brand**, with ${s.count} touchless car wash locations concentrated in ${s.states.join(', ')}. Operated through H&S Energy Group, every Extra Mile uses **Istobal touchless equipment** — the same as Power Market and Pinnacle 365.\n\nIf you see an Extra Mile at a California Chevron, you're seeing a touchless wash.`,
  'Pinnacle 365': (s) =>
    `Pinnacle 365 is the third H&S Energy convenience store brand on this list, with ${s.count} touchless locations across ${s.states.join(' and ')}. Like its sister brands, every Pinnacle 365 uses **Istobal touchless equipment**.`,
  'Drive & Shine': (s) =>
    `Drive & Shine stands out on this list for one reason: **one of the highest average ratings of any chain here — ${s.avgRating.toFixed(1)} stars across ${s.totalReviews.toLocaleString()}+ reviews**. That's not a typo. Across ${s.count} locations in ${s.states.join(', ')}, Drive & Shine has built an unusually loyal customer base.\n\nThey use **PDQ LaserWash 360 Plus** equipment and offer oil changes at many locations alongside the touchless wash. Their unlimited membership plans are among the most popular in the Midwest.`,
  "Terrible's": (s) =>
    `Terrible's (also known as Terrible Herbst) is the **Las Vegas-area convenience store and fuel empire**, with ${s.count} verified touchless car wash locations concentrated in Nevada, plus a handful in California and Arizona. Importantly, Terrible's publishes their own filter distinguishing "Touch Free" locations from soft-touch — so every location on this count is confirmed touchless by the operator themselves.\n\nEquipment varies across locations but includes **PDQ LaserWash** and **Mark VII ChoiceWash**.`,
  'Delta Sonic': (s) =>
    `Delta Sonic is the iconic Upstate New York and Western New York car wash chain, with ${s.count} touchless-bay locations across ${s.states.join(', ')}. Delta Sonic is a **hybrid operator**: their locations typically offer multiple tiers including "Touch-Less," "Super Kiss," and "Basic Brushes" — giving customers a choice.\n\n**Only Delta Sonic locations with a dedicated Touch-Less bay are counted on this list.** They use a mix of **PDQ and Washworld** equipment.`,
  BP: (s) =>
    `Select BP gas stations offer touchless car washes at ${s.count} locations across ${s.states.join(', ')}. BP doesn't own or operate these washes directly — each location is independently franchised — but every location on this list has been verified as touchless.`,
  Autowash: (s) =>
    `Autowash operates ${s.count} automatic touchless car wash locations across Colorado — from Fort Collins and Loveland up north to Denver, Littleton, and Highlands Ranch in the south metro. Every Autowash location features high-pressure touchless automatic bays with no brushes or cloth.`,
  'Brown Bear': (s) =>
    `Brown Bear Car Wash is a Washington state institution, operating ${s.count} touchless car wash locations across the Puget Sound area and Spokane. Their touchless bays offer a safe, scratch-free clean with self-serve vacuum stations.`,
  'Elephant Car Wash': (s) =>
    `Elephant Car Wash is a well-known car wash chain with ${s.count} touchless locations in the Pacific Northwest and Arizona. Many of their locations offer touchless automatic bays alongside self-serve options.`,
  'Gorilla Wash': (s) =>
    `Gorilla Wash operates ${s.count} touchless car wash locations across ${s.states.join(', ')}. Their touch-less automatic bays provide a gentle, brushless clean, with many locations tied in with Kum & Go convenience stores.`,
};

async function getChainStats(): Promise<ChainStats[]> {
  // For each chain in CHAINS, fetch location count, states, avg rating, total reviews
  const stats: ChainStats[] = [];
  for (const chain of CHAINS) {
    const { data } = await publicListings('state, rating, review_count')
      .eq('parent_chain', chain.name);

    if (!data || data.length === 0) continue;

    const stateSet = new Set<string>();
    let totalRating = 0;
    let ratedCount = 0;
    let totalReviews = 0;

    for (const r of data) {
      if (r.state) stateSet.add(r.state);
      if (r.rating) {
        totalRating += Number(r.rating);
        ratedCount += 1;
      }
      if (r.review_count) totalReviews += r.review_count;
    }

    stats.push({
      name: chain.name,
      slug: chain.slug,
      count: data.length,
      states: Array.from(stateSet).sort(),
      avgRating: ratedCount > 0 ? totalRating / ratedCount : 0,
      totalReviews,
      equipment: EQUIPMENT[chain.name] ?? 'Mixed',
    });
  }
  // Sort by count desc
  stats.sort((a, b) => b.count - a.count);
  return stats;
}

function regionFromStates(states: string[]): string {
  if (states.length === 0) return '—';
  if (states.length === 1) return states[0];
  if (states.length <= 3) return states.join(', ');
  return `${states.length} states`;
}

export async function generateTop10ChainsContent(): Promise<string> {
  const stats = await getChainStats();
  const top10 = stats.slice(0, 10);
  const notableRegional = stats.slice(10, 14); // next 4

  // Intro
  let md = `Most car wash rankings you'll find online bundle every type together — soft-touch tunnels, friction tunnels, in-bay automatics, and touchless all in one list. That's useful if you're researching the industry, but useless if you specifically want a **brushless, scratch-free wash**.\n\n`;
  md += `So we built this list differently. We track **over 6,000 verified touchless car wash locations** across all 50 states and cross-reference them against chain operators, individual store pages, customer reviews, and equipment manufacturers. What follows is the only data-driven ranking of the **10 largest dedicated touchless car wash chains** in the United States — sorted by verified touchless location count, with average customer ratings, states served, and the actual equipment each chain uses.\n\n`;
  md += `If you want the TL;DR:\n\n`;

  // Table
  md += `| # | Chain | Touchless Locations | States | Avg Rating | Primary Equipment |\n`;
  md += `|---|---|---:|---:|---:|---|\n`;
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    const highlight = (v: string) => v;
    const states = s.states.length <= 6 ? s.states.length.toString() : `**${s.states.length}**`;
    const rating = s.avgRating > 0 ? (s.avgRating >= 4.5 ? `**${s.avgRating.toFixed(1)}★**` : `${s.avgRating.toFixed(1)}★`) : '—';
    md += `| ${i + 1} | [${s.name}](/chain/${s.slug}) | ${s.count.toLocaleString()} | ${states} | ${rating} | ${s.equipment} |\n`;
  }
  md += `\n`;

  md += `Now let's dig into each one — who they are, where they operate, and what makes each worth knowing about.\n\n---\n\n`;

  // Per-chain sections
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    md += `## ${i + 1}. ${s.name} — ${s.count.toLocaleString()} touchless locations (${s.states.length} ${s.states.length === 1 ? 'state' : 'states'})\n\n`;
    const narrative = CHAIN_NARRATIVE[s.name];
    md += narrative ? narrative(s) : `${s.name} operates ${s.count.toLocaleString()} touchless car wash locations across ${regionFromStates(s.states)}, using ${s.equipment} equipment.`;
    md += `\n\n`;
    if (s.avgRating > 0 && s.totalReviews > 1000) {
      md += `**Customer average:** ${s.avgRating.toFixed(1)}★ across ${s.totalReviews.toLocaleString()}+ reviews.\n\n`;
    }
    md += `👉 [Browse all ${s.name} touchless locations](/chain/${s.slug})\n\n---\n\n`;
  }

  // Notable regional
  if (notableRegional.length > 0) {
    md += `## Notable regional leaders (just missing the top 10)\n\n`;
    md += `A few touchless chains have smaller footprints but are dominant in their regions:\n\n`;
    for (const s of notableRegional) {
      md += `- **[${s.name}](/chain/${s.slug})** (${s.count.toLocaleString()} locations, ${regionFromStates(s.states)}) — ${s.states.length === 1 ? `The densest touchless network in ${s.states[0]}.` : 'Regional touchless leader.'}\n`;
    }
    md += `\n---\n\n`;
  }

  // Methodology + FAQ (static)
  md += `## How we verify "touchless"\n\n`;
  md += `A listing qualifies for this ranking only if:\n\n`;
  md += `1. **Explicit manufacturer/equipment match** — we know which equipment is installed (PDQ LaserWash, Washworld Razor, Istobal, etc.) and it's a touchless model, OR\n`;
  md += `2. **Chain-level confirmation** — the operator themselves publishes a "Touch Free" or "Touchless" designation for that specific location, OR\n`;
  md += `3. **Customer review verification** — multiple independent customers explicitly describe the wash as touchless/brushless/no-touch in reviews\n\n`;
  md += `We also **actively exclude** locations where:\n\n`;
  md += `- The chain's own website describes the wash as "soft cloth," "mitter," "foam pad," or "friction"\n`;
  md += `- Customer reviews contradict touchless claims (e.g., "the brush cracked my windshield")\n`;
  md += `- The chain's primary service is "Express Exterior" tunnel washing\n\n`;
  md += `We've reverted hundreds of false positives from earlier automated classifications — chains like Caliber Car Wash and the "Splash Car Wash Express" tunnel locations don't qualify as touchless despite being marketed as automatic, so they're not on this list.\n\n`;

  md += `## FAQ\n\n`;
  md += `### Is a touchless car wash better than a soft-touch tunnel?\n\n`;
  md += `If you prioritize **paint protection** above all else, yes. Touchless washes use only high-pressure water and soap — there's no physical contact with your vehicle, which means zero risk of swirl marks, scratches, or micro-abrasions. Soft-touch tunnels often use cloth or foam that picks up abrasive grit over time. For new cars, ceramic coatings, or delicate finishes like matte paint, touchless is the safer choice.\n\n`;
  md += `### What equipment do most touchless car washes use?\n\n`;
  md += `The two dominant manufacturers are **[PDQ (LaserWash 360 Plus](/equipment/pdq))** and **[Washworld (Razor, Razor Edge)](/equipment/washworld)**. Spanish manufacturer **[Istobal](/equipment/istobal)** is also common, especially in California. All three produce pure touchless in-bay automatic systems that use only water and detergents.\n\n`;
  md += `### How do I know a chain is actually touchless and not just marketed that way?\n\n`;
  md += `Look for explicit language on the operator's website — "Touch Free," "Touchless," "Brushless," "No-Touch," or "Laser Wash." Avoid chains that primarily market "Express Exterior," "Soft Touch Tunnel," or "Shammy Dry" — those indicate friction washes. When in doubt, search our directory — we only list verified touchless locations.\n\n`;
  md += `### Why isn't [big chain name] on this list?\n\n`;
  md += `Major national chains like **Mister Car Wash**, **Take 5 Car Wash**, **Zips**, **Quick Quack**, **WhiteWater Express**, and **Super Star** operate **Express tunnel** washes (soft-touch friction). They're excellent car wash chains — but they don't qualify as touchless. You won't find them on our site because we're exclusively dedicated to brushless, scratch-free touchless washes.\n\n`;
  md += `### Are all Sheetz car washes really touchless?\n\n`;
  md += `Yes. Sheetz standardizes on the PDQ LaserWash 360 Plus — a touchless in-bay automatic system — at all of their car wash locations. This has been confirmed by Sheetz's own marketing materials, customer reviews, and consistent equipment installations we've verified across their footprint.\n\n`;
  md += `---\n\n`;
  md += `**Looking for a touchless car wash not on this list?** Browse our [full directory of 6,000+ verified touchless locations](/) across all 50 states. Every listing is verified using the same methodology above — no exceptions.\n`;

  return md;
}
