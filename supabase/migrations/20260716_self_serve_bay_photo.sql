-- Does this listing actually SHOW a self-service bay?
--
-- For a self-serve directory the bay photo is not decoration, it is the EVIDENCE. A listing
-- can currently pass with a pretty exterior shot and nothing that proves a wand bay exists —
-- we assert "self-serve" and show the user nothing backing it up. This records whether the
-- published hero/gallery contains a frame where the wand-bay equipment is actually visible,
-- so "self-serve with no proof" becomes a queryable defect instead of an invisible one.
alter table public.listings
  add column if not exists self_serve_bay_photo boolean;

comment on column public.listings.self_serve_bay_photo is
  'TRUE when the hero or gallery contains a frame clearly showing self-service wand-bay equipment (wand, foam brush, coin/card box in an open bay). NULL = never checked. FALSE = checked and no such frame exists — the listing claims self-serve without visual evidence.';
