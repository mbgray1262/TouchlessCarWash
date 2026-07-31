-- Hand-wash review evidence + satisfaction score, mirroring the touchless
-- (is_touchless_evidence) and self-serve (is_self_serve_evidence) pairs.
--
-- A snippet can be evidence for any combination of wash types (mixed sites exist),
-- so hand-wash evidence is its own independently-queryable signal. Hand-wash review
-- vocabulary ("washed by hand", "hand dried", "detailed it") is MORE distinctive than
-- self-serve's ("bay"/"vacuum" occur everywhere), so it's a stronger corroborating
-- signal — but per the self-serve lesson, the miner still only writes snippets and
-- NEVER flips listings.is_hand_wash on keyword hits alone.
alter table public.review_snippets
  add column if not exists is_hand_wash_evidence boolean not null default false,
  add column if not exists hand_wash_keywords    text[];

-- Partial index: we only ever scan the true rows (to score a listing / surface snippets).
create index if not exists review_snippets_hand_wash_evidence_idx
  on public.review_snippets (listing_id)
  where is_hand_wash_evidence;

comment on column public.review_snippets.is_hand_wash_evidence is
  'Customer review describes an ATTENDED hand wash (washed/dried by hand, wiped down, detailed by staff, attendants). Corroboration only — combined with google_category + photo/vision evidence to classify; a keyword hit alone never sets listings.is_hand_wash.';

-- Listings: mined-at stamp (so the drain does not re-scrape) + the Hand Wash
-- Satisfaction Score and when it was computed (twin of self_service_score /
-- touchless satisfaction).
alter table public.listings
  add column if not exists hand_wash_reviews_mined_at timestamptz,
  add column if not exists hand_wash_score            integer,
  add column if not exists hand_wash_scored_at        timestamptz;
