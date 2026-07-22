-- Street-View facility confidence for the self-serve review queue.
--
-- The photo classifier only sees the Google gallery (customer close-ups). A street-level view of
-- the whole property is what distinguishes "a row of open-fronted wand stalls" from "one tunnel
-- with an entrance and an exit" — the check Michael does by hand before confirming a listing.
--
-- Validated against 25 human-labelled listings: a "self_serve_bays" street-view call was correct
-- 5/5, but "tunnel_express" wrongly rejected 4 real (mixed tunnel + self-serve) facilities. So this
-- signal is used to ORDER the review queue, never to auto-reject:
--   2 = street view shows a row of self-serve bays  → review these first (near-certain)
--   1 = plausible / not ruled out                   → normal queue
--   0 = street view suggests otherwise, or no imagery → review last
-- NULL = not yet screened.
alter table listings add column if not exists self_service_confidence smallint;

comment on column listings.self_service_confidence is
  'Street-View facility screen for the self-serve queue: 2=bays visible, 1=plausible, 0=doubtful, NULL=unscreened. Ordering signal only — never used to auto-reject or to control public visibility.';

-- The admin queue reads unreviewed self-serve rows ordered by this column.
create index if not exists listings_self_service_confidence_idx
  on listings (self_service_confidence desc nulls last)
  where is_self_service = true and self_service_reviewed_at is null;
