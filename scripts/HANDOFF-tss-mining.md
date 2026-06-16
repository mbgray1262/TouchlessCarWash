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

## Targets — the FULL unscored backlog (corrected)
- `scripts/tss-mining-targets.csv` — **~2,457 listings** (id, name, city, state, google_place_id, review_count, review_mine_status, touchless_mentions).
- These are ALL `is_touchless=true` + `is_approved=true` + `touchless_satisfaction_score IS NULL` (with a usable `ChIJ…` place_id).
- Current breakdown of the 2,517 unscored: **65 never mined**, **2,452 mined shallowly before (<3 touchless mentions)** → the deeper re-harvest is meant to rescue a chunk of these. (~36 excluded for lacking a real place_id.)
- **Rows are pre-sorted by priority:** never-mined first, then fewest existing mentions, then highest review_count — so the most-likely-to-newly-score are near the top.
- NOTE: this is NOT just this session's ~359 recoveries — it's the whole backlog. An earlier handoff said 359; that was only the newly-recovered subset. Scope is the user's call: do the full ~2,457, or just the top-N by priority.

## Scale / expectations
- ~2,457 listings × ~15–30s each (non-headless reviews-tab search) ≈ **several hours** of scraping; run it resumable/batched (skip-already-processed), like the original did.
- Not all will clear the ≥3-mention gate — many genuinely lack touchless-specific reviews and will (correctly) stay NULL. Expect a meaningful fraction (not a majority) to newly score.

## Steps for the previous session
1. Re-run the proven reviews-tab keyword-search miner on the IDs in `scripts/tss-mining-targets.csv` (US VPN is on; consent wall gone). Process in priority order (top of CSV first); make it resumable.
2. Label new snippets (Haiku: `sentiment` + `touchless_about`), clean sources only (exclude `gmaps-crawl4ai-md`).
3. Score: `node scripts/score-touchless-satisfaction.mjs --missing-only` (scores every approved-touchless listing with a NULL score from current snippets) — or `--ids=…` for a subset.
4. Run `npm run build && npm run verify:seo` afterward — new scores can change trophy eligibility and may open/alter Best-Of pages.

## Already cleaned up
- Deleted the 1,047 noisy `gmaps-crawl4ai-md` snippets created by the wrong miner. DB is clean.

---
## RESOLVED 2026-06-16 — miner rebuilt, made permanent, now runs server-side
- **Permanent miner: `scripts/mine-touchless-reviews-search.py`** (committed, NOT `_tmp_*`).
  Keys that unblocked it: (1) RELOAD-until-Reviews-tab loop (Maps loads degraded; reload fixes
  it — also makes headless work); (2) the reviews Search box moved to `input.LCTIRd` (old
  aria-label gone), focused via JS + driven with TRUSTED `page.keyboard.type`; (3) insert fixes:
  `rating` is INTEGER (cast), and dedup `review_id` within each batch (ON CONFLICT can't touch a
  row twice). Resumable (skips listings with an existing gmaps-search-clean snippet).
- **Server job: `.github/workflows/mine-touchless-reviews.yml`** — runs the miner on US-based
  GitHub runners (clears the EU consent wall; confirmed inserting), resumable, auto-resumes every
  6h (timeout 340m < the 6h cap). No laptop needed. `gh workflow run mine-touchless-reviews.yml`
  to kick a run; disable the schedule once the backlog is fully mined.
- STILL TODO after mining: Label (Haiku sentiment + touchless_about on new snippets) →
  `node scripts/score-touchless-satisfaction.mjs --missing-only` → `npm run build && npm run verify:seo`.
