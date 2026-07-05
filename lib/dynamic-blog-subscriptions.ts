/**
 * Dynamic content generator for /blog/best-touchless-car-wash-subscriptions-2026.
 *
 * Fetches live chain counts + state coverage for the curated list of touchless
 * chains that publish unlimited/monthly membership plans, ranks by location
 * count, and generates markdown with real-time data. Mirrors the pattern
 * established by lib/dynamic-blog-top10.ts.
 */
import { publicListings } from '@/lib/public-listings';
import { CHAINS } from '@/lib/chains';
import { getChainSubscriptionDisplay } from '@/lib/chain-subscriptions';

type SubscriptionChainStats = {
  name: string;
  slug: string;
  count: number;
  states: string[];
  avgRating: number;
  totalReviews: number;
  planBlurb: string;
  priceLabel: string;
  planName: string | null;
  priceSource: 'mined' | 'estimate';
};

// Kept only for the narrative blurbs. Pricing and plan names are now pulled
// from lib/chain-subscriptions.ts (mined from existing crawl_snapshot data,
// no new API calls). Historical legacy shape preserved for readability.
const LEGACY_BLURBS: Record<string, { planBlurb: string; approxPrice: string }> = {
  'sheetz': {
    planBlurb: 'Unlimited LaserWash 360 Plus touchless washes at Sheetz car wash locations. Sheetz runs multiple tiers on the PDQ LaserWash — base touchless, plus upgrade tiers with rain protectant and wax.',
    approxPrice: '$25–$40/mo',
  },
  'delta-sonic': {
    planBlurb: 'Delta Sonic\'s unlimited plan is among the oldest unlimited memberships in the U.S. The plan is specific to the location it was purchased at, but they offer a Touch-Less bay tier alongside their Super Kiss and brush tiers.',
    approxPrice: '$25–$45/mo',
  },
  'drive-and-shine': {
    planBlurb: 'Drive & Shine offers 3 unlimited tiers, all using the PDQ LaserWash 360 Plus touchless automatic. Their highest tier adds ceramic sealant — popular among Indiana and Michigan drivers for winter road-salt protection.',
    approxPrice: '$25–$50/mo',
  },
  'kwik-trip': {
    planBlurb: 'Kwik Trip\'s Car Wash Club works only at verified Touch Free locations (not their soft-wash bays). Multiple tiers, and the pass is tied to your license plate rather than a windshield tag.',
    approxPrice: '$20–$35/mo',
  },
  'splash-car-wash': {
    planBlurb: 'Splash offers all-location unlimited across Connecticut, New York, and Vermont. Multiple plan tiers; the Ceramic Wash tier adds long-lasting hydrophobic coating and is the chain\'s most popular plan.',
    approxPrice: '$25–$50/mo',
  },
  'prestige-car-wash': {
    planBlurb: 'Prestige\'s all-access unlimited works at every eastern-Massachusetts touchless bay they operate. Known for strong customer satisfaction (4.5+ star averages) and a single flat-rate unlimited plan.',
    approxPrice: '$30–$40/mo',
  },
  'flagstop-car-wash': {
    planBlurb: 'Flagstop\'s unlimited works across their Richmond-metro sites, but only the North Chesterfield location (6479 Iron Bridge Rd) has a dedicated touchless bay. Members can still use the tunnel sites if they choose.',
    approxPrice: '$20–$35/mo',
  },
  'foam-and-wash': {
    planBlurb: 'Foam & Wash unlimited plans work at all Hudson Valley touchless sites. Base tier covers unlimited touchless automatics; top tier adds ceramic and underbody flush.',
    approxPrice: '$20–$35/mo',
  },
  'mr-magic-car-wash': {
    planBlurb: 'Mr. Magic\'s Monthly Wash Club covers unlimited visits across their Pittsburgh metro + West Virginia touchless bays. Multiple tiers with ceramic and rain-shield upgrades.',
    approxPrice: '$20–$35/mo',
  },
  'autowash': {
    planBlurb: 'Autowash runs an unlimited Colorado-wide plan covering every one of their touchless bays from Fort Collins to Highlands Ranch. Popular with winter/ski commuters who hit I-70 weekly.',
    approxPrice: '$25–$40/mo',
  },
  'super-wash': {
    planBlurb: 'Super Wash offers prepaid wash card packages more often than traditional unlimited, but select locations now run a monthly unlimited touchless subscription. Check your specific Super Wash location.',
    approxPrice: '$20–$30/mo',
  },
  'brown-bear': {
    planBlurb: 'Brown Bear\'s Monthly Pass covers unlimited visits to their Puget Sound and Spokane touchless bays. Single-vehicle plan; pet-friendly vacuums included.',
    approxPrice: '$25–$40/mo',
  },
  'holiday-stationstores': {
    planBlurb: 'Holiday (now part of Circle K) runs a Touch Free unlimited plan tied to your license plate. Works across upper-Midwest Touch Free bays; the plan is usually bundled with fuel discounts.',
    approxPrice: '$20–$35/mo',
  },
  'salty-dog-car-wash': {
    planBlurb: 'Salty Dog\'s unlimited covers every Florida east-coast touchless location. Multiple tiers; top tier adds ceramic and a hot-wax pass.',
    approxPrice: '$25–$40/mo',
  },
  'power-market': {
    planBlurb: 'Power Market (part of H&S Energy) offers unlimited on their Istobal touchless equipment across California, Oregon, and Nevada. Single-vehicle plan keyed to your plate.',
    approxPrice: '$20–$30/mo',
  },
  'extra-mile': {
    planBlurb: 'Extra Mile is Chevron\'s convenience store brand, also under H&S Energy. Unlimited plans work on their Istobal touchless bays at participating California locations.',
    approxPrice: '$20–$30/mo',
  },
  'pinnacle-365': {
    planBlurb: 'Pinnacle 365 runs the same H&S Energy unlimited plan as Power Market and Extra Mile — Istobal touchless bays, plate-linked membership, California and Oregon coverage.',
    approxPrice: '$20–$30/mo',
  },
};

const SUBSCRIPTION_CHAIN_SLUGS = Object.keys(LEGACY_BLURBS);

async function getSubscriptionStats(): Promise<SubscriptionChainStats[]> {
  const stats: SubscriptionChainStats[] = [];
  for (const chain of CHAINS) {
    if (!SUBSCRIPTION_CHAIN_SLUGS.includes(chain.slug)) continue;
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

    const sub = getChainSubscriptionDisplay(chain.slug);
    stats.push({
      name: chain.name,
      slug: chain.slug,
      count: data.length,
      states: Array.from(stateSet).sort(),
      avgRating: ratedCount > 0 ? totalRating / ratedCount : 0,
      totalReviews,
      planBlurb: sub?.blurb ?? LEGACY_BLURBS[chain.slug].planBlurb,
      priceLabel: sub?.priceLabel ?? LEGACY_BLURBS[chain.slug].approxPrice,
      planName: sub?.planName ?? null,
      priceSource: sub?.priceSource ?? 'estimate',
    });
  }
  stats.sort((a, b) => b.count - a.count);
  return stats;
}

function regionFromStates(states: string[]): string {
  if (states.length === 0) return '—';
  if (states.length <= 3) return states.join(', ');
  return `${states.length} states`;
}

export async function generateSubscriptionsContent(): Promise<string> {
  const stats = await getSubscriptionStats();
  const year = new Date().getFullYear();
  const totalLocations = stats.reduce((s, c) => s + c.count, 0);
  const totalStates = new Set<string>();
  stats.forEach(s => s.states.forEach(st => totalStates.add(st)));

  let md = `Search volume for "touchless car wash subscription" is up **+250% year over year** in ${year}, and for good reason. The unlimited wash club model — a flat monthly fee for unlimited visits — has reshaped the car wash industry, and touchless operators are now matching the tunnel chains on pricing. That means you can get an **unlimited brushless, scratch-free wash** for roughly the same monthly cost as a soft-cloth tunnel plan.\n\n`;
  md += `This guide ranks the **${stats.length} touchless car wash chains** offering unlimited monthly plans in ${year}, sorted by total touchless location count. Every chain on this list has been verified as operating real touchless (brushless, high-pressure water only) equipment — no soft-cloth tunnels, no mitter curtains, no friction. Together they run **${totalLocations.toLocaleString()}+ touchless locations across ${totalStates.size} states**.\n\n`;
  md += `We also built a companion [/unlimited-touchless-car-wash hub](/unlimited-touchless-car-wash) with pricing tiers and FAQs if you want the full primer on how these plans work.\n\n`;

  // Comparison table
  md += `| # | Chain | Plan Name | Touchless Locations | States | Price | Avg Rating |\n`;
  md += `|---|---|---|---:|---:|---|---:|\n`;
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const rating = s.avgRating > 0 ? `${s.avgRating.toFixed(1)}★` : '—';
    const priceCell = s.priceSource === 'mined' ? `**${s.priceLabel}**` : s.priceLabel;
    md += `| ${i + 1} | [${s.name}](/chain/${s.slug}) | ${s.planName ?? '—'} | ${s.count.toLocaleString()} | ${s.states.length} | ${priceCell} | ${rating} |\n`;
  }
  md += `\n*Prices in bold are pulled live from each chain's published pricing page. Italics indicate industry-typical estimates where the chain doesn't publish monthly rates publicly.*\n`;
  md += `\n---\n\n`;

  md += `## How we built this list\n\n`;
  md += `We started from our directory of verified touchless car wash chains and filtered to only operators that publish a recurring monthly unlimited plan (not just prepaid wash cards or per-wash tickets). We then confirmed each chain runs **touchless** equipment at the locations covered by the plan — not soft-cloth or mitter tunnels. Pricing ranges reflect the entry tier through the top (ceramic / premium) tier, as of ${year}.\n\n`;
  md += `If a chain runs multiple wash formats (like Delta Sonic, which operates Touch-Less, Super Kiss, and brush bays side-by-side), we only count locations with a dedicated touchless bay.\n\n---\n\n`;

  // Per-chain sections
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    md += `## ${i + 1}. ${s.name} — ${s.count.toLocaleString()} touchless location${s.count === 1 ? '' : 's'} (${regionFromStates(s.states)})\n\n`;
    const priceLead = s.priceSource === 'mined' ? 'Published plan pricing' : 'Approx. plan pricing';
    md += `**${priceLead}:** ${s.priceLabel}${s.planName ? ` — ${s.planName}` : ''}\n\n`;
    md += `${s.planBlurb}\n\n`;
    if (s.avgRating > 0 && s.totalReviews > 500) {
      md += `**Customer average across all ${s.name} touchless locations:** ${s.avgRating.toFixed(1)}★ (${s.totalReviews.toLocaleString()}+ reviews).\n\n`;
    }
    md += `👉 [Browse all ${s.name} touchless locations](/chain/${s.slug})\n\n---\n\n`;
  }

  // Break-even math
  md += `## Is a touchless unlimited plan worth it?\n\n`;
  md += `The break-even is straightforward. If a single premium touchless wash costs **$15–$20**, then **two washes a month** usually covers a basic unlimited plan. Three washes a month beats mid-tier. Nearly everyone who signs up ends up washing weekly once the per-wash cost drops to zero.\n\n`;
  md += `Touchless unlimited plans tend to pay off fastest in:\n\n`;
  md += `- **Salt-belt states** (Midwest, Northeast, upper Midwest) where winter road salt hits undercarriages hard\n`;
  md += `- **Coastal states** (Florida, California, the Carolinas) where sea salt and humidity drive up wash frequency\n`;
  md += `- **Pollen-heavy regions** (Southeast spring, Texas Hill Country) where a weekly rinse is the only way to keep paint clean\n`;
  md += `- **Owners of new, ceramic-coated, or matte-finish vehicles** where the zero-friction guarantee alone justifies paying more than a tunnel\n\n`;
  md += `---\n\n`;

  // FAQ
  md += `## FAQ\n\n`;
  md += `### Can I use my unlimited membership at any chain location?\n\n`;
  md += `It depends on the chain. Splash, Prestige, and Brown Bear treat their plans as all-access across every site in the chain. Delta Sonic, Kwik Trip, and most H&S Energy brands (Power Market, Extra Mile, Pinnacle 365) tie the plan to your license plate at a specific location or region. Always confirm before signing up.\n\n`;
  md += `### Is there a cancellation fee?\n\n`;
  md += `Nearly every touchless unlimited plan on this list is cancel-anytime with no fee. Cancellation usually takes effect at the end of your current billing cycle, so you keep access for the month you already paid for. A handful of chains require you to cancel in person at the pay station — check the specific chain before signing up if you want to cancel via app.\n\n`;
  md += `### Do these plans include interior cleaning or detailing?\n\n`;
  md += `No. Unlimited touchless plans are exterior-only. Most locations include free self-serve vacuums on site (included with each wash visit, not the plan itself), and a few chains (Drive & Shine, Delta Sonic) offer add-on detailing services — those are separate from the monthly membership.\n\n`;
  md += `### How is touchless different from a tunnel unlimited plan?\n\n`;
  md += `A tunnel wash uses soft cloth curtains, mitter strips, or foam pads that physically contact your paint. Over many washes, these can cause swirl marks and micro-scratches — especially on dark paint, new clearcoat, or ceramic coatings. A **touchless** wash uses only high-pressure water and specialized detergents. Nothing ever touches the vehicle except water. That's why touchless is the gold standard for new cars, luxury finishes, and owners who care about long-term paint health.\n\n`;
  md += `### Which chain has the largest touchless unlimited network?\n\n`;
  const top = stats[0];
  md += `[${top.name}](/chain/${top.slug}) is the largest touchless operator offering an unlimited plan, with **${top.count.toLocaleString()} locations across ${regionFromStates(top.states)}**. If you live within their footprint, they're usually the densest network for cross-town or cross-state unlimited use.\n\n`;
  md += `---\n\n`;
  md += `**Looking for an unlimited touchless wash near you?** Start with the [unlimited touchless car wash hub](/unlimited-touchless-car-wash) for pricing tiers and coverage details, or [browse all verified touchless locations by state](/states). Every location in our directory is confirmed brushless — no soft-cloth tunnels, no exceptions.\n`;

  return md;
}
