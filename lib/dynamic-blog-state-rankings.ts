/**
 * Dynamic content generator for /blog/touchless-car-wash-satisfaction-by-state.
 *
 * Ranks U.S. states by the average Touchless Satisfaction Score of their
 * scored touchless car washes, recomputed live on each ISR revalidate so the
 * ranking always reflects current data. Returns Markdown consumed by the
 * renderMarkdown() pipeline in app/blog/[slug]/page.tsx (which handles the
 * table syntax and [text](url) links).
 *
 * This is the only page on the site that ranks touchless satisfaction BY STATE
 * — paint safety, chain rankings, and market statistics live in their own
 * posts and are linked, not duplicated here.
 */
import { publicListings } from '@/lib/public-listings';
import { getStateName, getStateSlug, US_STATES } from '@/lib/constants';

export const MIN_STATE_SAMPLE = 20;

const VALID_STATE_CODES = new Set(US_STATES.map((s) => s.code));

type StateRow = { code: string; name: string; slug: string; n: number; avg: number };

export async function getStateRankingData() {
  const rows: Array<{ state: string; touchless_satisfaction_score: number | null }> = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data } = await publicListings('state, touchless_satisfaction_score').range(offset, offset + 999);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const scored = rows.filter((r) => r.touchless_satisfaction_score != null);
  const scores = scored.map((r) => r.touchless_satisfaction_score as number);
  const nationalAvg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const excellent = scores.filter((s) => s >= 84).length;
  const excellentPct = scores.length ? Math.round((excellent / scores.length) * 100) : 0;

  const byState = new Map<string, number[]>();
  scored.forEach((r) => {
    if (!VALID_STATE_CODES.has(r.state)) return;
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state)!.push(r.touchless_satisfaction_score as number);
  });
  const stateRows: StateRow[] = [];
  for (const [code, arr] of Array.from(byState.entries())) {
    if (arr.length < MIN_STATE_SAMPLE) continue;
    const avg = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
    stateRows.push({ code, name: getStateName(code) || code, slug: getStateSlug(code), n: arr.length, avg });
  }
  stateRows.sort((a, b) => b.avg - a.avg);

  return { totalScored: scored.length, nationalAvg, excellentPct, stateRows };
}

export async function generateStateRankingsContent(): Promise<string> {
  const { totalScored, nationalAvg, excellentPct, stateRows } = await getStateRankingData();
  const top = stateRows.slice(0, 3).map((s) => s.name);
  const bottom = stateRows.slice(-3).reverse().map((s) => s.name);
  const oneInN = excellentPct > 0 ? Math.round(100 / excellentPct) : 0;

  const md: string[] = [];

  md.push(
    `Not all touchless car washes are created equal — and where you live has a lot to do with it. We took our **Touchless Satisfaction Score** — a 0–100 rating built from real Google reviews of the *touchless* wash specifically (not the gas pumps, the c-store, or the self-serve bays) — and averaged it across every state with enough scored locations to rank fairly. The result is the first state-by-state ranking of touchless car wash satisfaction in America.`
  );

  md.push(`## Key findings`);
  md.push(`- The average U.S. touchless car wash scores **${nationalAvg} out of 100** on customer satisfaction across the **${totalScored.toLocaleString()}** washes with enough review signal to score.`);
  md.push(`- Only about **${excellentPct}%** of washes — roughly 1 in ${oneInN} — earn an "Excellent" score.`);
  md.push(`- **${top.join(', ')}** lead the nation for touchless car wash satisfaction.`);
  md.push(`- **${bottom.join(', ')}** rank at the bottom — the states where it pays most to shop around.`);
  md.push(`- Worried about paint? That's a separate question, and we answered it in depth: our [paint-safety study](/blog/does-touchless-car-wash-scratch-paint-study) found **87% of touchless washes draw paint-damage complaints in under 1% of their reviews**.`);

  md.push(`## Touchless car wash satisfaction, ranked by state`);
  md.push(`Average Touchless Satisfaction Score (0–100) among states with at least ${MIN_STATE_SAMPLE} scored touchless washes. Click any state to see its top-rated locations.`);
  // The whole table must be one block with single-newline rows so the header
  // and separator land on consecutive lines (renderMarkdown table detection).
  const tableLines = [
    `| Rank | State | Satisfaction score | Washes scored |`,
    `|------|-------|--------------------|---------------|`,
    ...stateRows.map((s, i) => `| ${i + 1} | [${s.name}](/state/${s.slug}) | ${s.avg} | ${s.n} |`),
  ];
  md.push(tableLines.join('\n'));

  md.push(`## How we scored it`);
  md.push(`Each wash's score comes from a review-mined, Bayesian-adjusted model that reads the Google reviews mentioning the touchless wash itself. A wash is scored only when it has enough touchless-specific review signal, which is why ${totalScored.toLocaleString()} of our locations carry a score. States are then ranked by the average score of their scored washes; to keep the ranking statistically fair, only states with at least ${MIN_STATE_SAMPLE} scored washes appear above. Full detail is on our [Touchless Satisfaction Score methodology page](/touchless-satisfaction-score).`);

  md.push(`## More touchless car wash research`);
  md.push(`- [Does a Touchless Car Wash Scratch Your Paint? We Analyzed the Reviews](/blog/does-touchless-car-wash-scratch-paint-study)`);
  md.push(`- [The Best Touchless Car Wash Chains, Ranked by Customer Satisfaction](/blog/best-touchless-car-wash-chains-ranked)`);
  md.push(`- [Touchless Car Wash Statistics: Market Size, Growth & Consumer Trends](/blog/touchless-car-wash-statistics)`);

  return md.join('\n\n');
}
