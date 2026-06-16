# Handoff: finish Touchless Satisfaction Scores for the recovered listings

**Created 2026-06-16. Pick this up in the previous session that built the free Google-reviews miner ("Review-Mined Score method"), which has the working miner script + exact keyword lists in its context.**

## Background (what happened this session)
- Ran a false-negative remediation: re-verified listings that had been wrongly reverted to `is_touchless=false`. **Recovered ~545 genuinely-touchless listings** (Tier 1 + Tier 2) and took them live, deduped 346 duplicate rows, and opened 5 Best-Of pages.
- Of the recovered live listings, **359 have no Touchless Satisfaction Score yet** — they need the review-mining → score pipeline run on them.

## Why scoring is blocked here
- The **Score** step is DONE and committed: `scripts/score-touchless-satisfaction.mjs`
  (formula `round(100*(pos+4.2)/(pos+neg+6))`, ≥3-mention gate; reproduces the existing 2,813 scores at 97% exact).
- The **Mine** step is the blocker. The clean miner is the **non-headless, reviews-tab keyword-search** scraper (source `gmaps-search-clean`) — NOT `scripts/scrape-gmaps-reviews.py` (that produces noisy `gmaps-crawl4ai-md` markdown and must not be used).
- This session reconstructed it but couldn't reproduce it reliably: the original `_tmp_*` miner script was deleted (gitignored), and Google Maps' review-card selectors have changed. **The previous session has the exact working script + selectors + keyword lists.**

## The one thing that's now fixed
The earlier failures were mostly an **EU cookie-consent wall** (the machine was egressing from Amsterdam → Google 302-redirected Maps to `consent.google.com`, zero reviews). The user is **now on a US VPN** (confirmed US egress, Maps returns 200). So the proven miner should work again.

## Method reminder (per the user)
1. Open the place in Google Maps.
2. **Switch to the Reviews tab.**
3. **Use the search box on the Reviews tab** to search the touchless keywords; scrape the clean matching review cards.
4. Store snippets (`source='gmaps-search-clean'`), set `is_touchless_evidence`, then label `sentiment` + `touchless_about`, then score.

## Keywords — use the SAME canonical lists as last time
- Touchless (committed pattern, for reference): `touch[- ]?(less|free) | brushless | laser wash | no touch | no brush` (no "spot-free").
- **Paint-safe** keywords are a SEPARATE set — use the exact list from the prior session / `lib/paint-safe-filter.ts`.

## Targets
- `scripts/tss-mining-targets.csv` — the 359 listings (id, name, city, state, google_place_id, review_count).
- These are `is_touchless=true`, `is_approved=true`, `touchless_satisfaction_score IS NULL`.

## Steps for the previous session
1. Re-run the proven reviews-tab keyword-search miner on the 359 IDs in `scripts/tss-mining-targets.csv` (US VPN is on; consent wall gone).
2. Label new snippets (Haiku: `sentiment` + `touchless_about`), clean sources only (exclude `gmaps-crawl4ai-md`).
3. Score: `node scripts/score-touchless-satisfaction.mjs --ids=<the 359>` (or `--missing-only`).
4. Expect ~50–60% to clear the ≥3-mention gate and get a score; the rest stay NULL by design.
5. Run `npm run build && npm run verify:seo` if anything routing-related changed (scoring alone doesn't, but trophies/Best-Of may shift).

## Already cleaned up
- Deleted the 1,047 noisy `gmaps-crawl4ai-md` snippets created by the wrong miner. DB is clean.
