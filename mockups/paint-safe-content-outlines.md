# Paint-Safe Score — Content Outlines (DRAFT, 2026-06-03)

NOTE: structure only. Populate all `[FILL: …]` with REAL final numbers after harvest + score computed. Author = "Editorial Team" (never Michael's name). Both link to each other. Ref paint-safe-score-spec.

---

## PIECE 1 — METHODOLOGY / EXPLAINER PAGE (evergreen; ships WITH the score)
Working URL: `/paint-safe-score`  ·  This is the destination for the score card's "How is the Paint-Safe Score calculated?" link.
Goals: transparency + trust, compliance good-faith signal, own "Paint-Safe Score" as a brand/search term.

H1: **The Paint-Safe Score: How We Rate Whether a Car Wash Is Gentle on Your Paint**

1. **Intro (2–3 sentences)** — the one fear it answers ("will this wash scratch/swirl my paint?"); what the score is in plain terms; built from real customer reviews, free, unique to us.
2. **What the Paint-Safe Score measures** — paint safety specifically (not overall quality, not cleanliness); a 0–100 read on how gentle customers report a wash is on vehicle finish.
3. **How it's calculated (plain English, 5 steps)** —
   1. We read real Google reviews that mention paint/finish (scratches, swirls, clear coat, gentle, etc.).
   2. Each is judged "gentle" vs "caused concern" (with the review's star rating as a cross-check).
   3. Recent reviews count more (washes change equipment/management over time).
   4. Credible reviewers (Local Guides, high review counts) count more.
   5. Small samples are smoothed toward the average until a wash has enough reviews to speak for itself → final 0–100 + tier.
4. **What the tiers mean (table)** — 90–100 Excellent · 80–89 Very Good · 70–79 Good · 55–69 Mixed · <55 Frequent Concerns. One line each on what it implies.
5. **Why we show the negatives too** — honesty principle; even Excellent washes show a small "% raised concerns" slice; that transparency is what makes the score trustworthy.
6. **Where the data comes from** — public Google reviews; attributed; we link back to the source; refreshed periodically.
7. **What the Paint-Safe Score is NOT** — not a lab test, not a guarantee, not affiliated with or endorsed by Google; a reflection of aggregated customer experience.
8. **Confidence & limited data** — minimum review threshold; washes with too few paint mentions show "not enough data yet" instead of a misleading number.
9. **How to use it** — for drivers (compare nearby washes); short note for owners.
10. **For business owners** — how the score can improve over time; how to flag an error / request a snippet removal (ties to compliance removal path).
11. **FAQ (FAQPage schema)** — Is a touchless car wash safe for paint? · How is this different from the Google star rating? · Can a wash improve its score? · Why does an "Excellent" wash still show some concerns? · How current is the data?
12. **CTAs** — "Browse top Paint-Safe washes near you" · "See washes ranked by Paint-Safe Score in [popular metros]."
- Footer: "Last updated [date] · Editorial Team." Schema: WebPage/Article + FAQPage.

---

## PIECE 2 — FLAGSHIP DATA-STUDY BLOG POST (at/just after launch; the traffic + backlink asset)
Working title: **"Does a Touchless Car Wash Actually Scratch Your Paint? We Analyzed [FILL: 28,000+] Real Customer Reviews"**
Goals: original research → backlinks + durable ranking + AI-Overview-resistant; capture high-intent queries; funnel to directory.
Target queries: "does touchless car wash scratch," "is touchless car wash safe for paint," "touchless car wash ceramic coating," "do automatic car washes damage paint."

1. **TL;DR / key-findings box (top)** — 3–4 punchy stats:
   - [FILL: X]% of all paint-related mentions across touchless washes were positive ("gentle / no scratches").
   - Only [FILL: Y]% reported any paint concern.
   - We analyzed [FILL: N] reviews across [FILL: M] touchless car washes in [FILL: # states].
   - [FILL: notable stat — e.g., ceramic-coating owners' sentiment].
2. **Why this question matters** — swirl marks / scratches are the #1 fear about automatic washes; the brush-vs-touchless distinction; why touchless exists.
3. **How we did it (short; link to methodology page)** — scope: [FILL] real Google reviews, keyword + sentiment classification, what counts as a paint mention. Be explicit the dataset is touchless washes (scope honesty).
4. **Finding 1 — How often do customers actually report paint damage at touchless washes?** (the headline number + what it means).
5. **Finding 2 — What customers praise most** — top positive themes (gentle, no swirls, ceramic-safe, older-car-safe) + 2–3 short attributed sample quotes.
6. **Finding 3 — When concerns DO come up** (honest minority view) — what the negative mentions actually involve (pre-existing damage, debris/grit, specific equipment) + a representative critical quote. Builds credibility.
7. **Finding 4 — Does it vary?** — interesting cut(s): by wash sub-type facet, by reviewer credibility (do Local Guides report differently?), recency trend, or top metros. Pick whichever the data supports.
8. **Finding 5 — The highest Paint-Safe-scoring washes** — link to top listings / city rankings (internal-link engine + reader payoff).
9. **How to choose a paint-safe wash (practical takeaways)** — checklist; naturally plug the Paint-Safe Score + directory.
10. **Methodology & data notes** — transparency box, dataset size/dates, limitations, link to the methodology page.
11. **Internal links / CTA** — find washes near you, browse by state, top-rated by Paint-Safe Score.
- Author: Editorial Team. Schema: Article (with dataset/citation). Promotion: this is the linkable PR asset — pitch to auto/detailing communities later.

---

### Sequencing
- Methodology page → publish WITH the score launch (UI links to it).
- Data study → publish at/just after launch as the traffic push, once numbers are final.
- Don't publish either with placeholder stats. Batch any Netlify deploys.
