# Disabled nightly jobs — 2026-04-22

Two launchd jobs were running nightly on Michael's Mac without his knowledge:

- `com.touchlesscarwash.resolveheld` — 5:00 AM daily
  Ran `scripts/resolve-held-listings.py` — auto-approved held listings,
  including closed-business rows that should have stayed unapproved.

- `com.touchlesscarwash.autoenforce` — 3:30 AM and 3:30 PM daily
  Ran `scripts/auto-enforce-audit.py` — Gemini 2.5 Pro re-audit of every
  touchless listing, automatically nulling hero_image + unapproving any
  listing returned as UNCERTAIN (no human review).

Both violated the standing "no scheduled night jobs + no AI re-screening
of curated heroes" rule.

## What was done 2026-04-22

1. `launchctl unload` both plists; archived under
   `~/Library/LaunchAgents/.disabled-touchlesscarwash/`
2. Renamed `scripts/resolve-held-listings.py` → `.py.DISABLED`
   and `scripts/auto-enforce-audit.py` → `.py.DISABLED` so `python3 scripts/foo.py`
   won't find them by their original name.
3. Re-unapproved 43 closed businesses that `resolve-held` had wrongly flipped
   back to approved in its most recent run.

## If you ever want the logic back

Both scripts remain in git history (renamed, not deleted). The useful
building blocks — promote-photo-to-hero, approve-with-existing-hero — can
be re-extracted and run manually on demand, **not on a schedule.**
