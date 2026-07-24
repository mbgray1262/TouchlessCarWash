-- Marks that a live self-serve listing has had its Google reviews harvested for self-serve
-- evidence (scripts/selfserve-harvest-reviews.py), so the automated backlog drain doesn't
-- re-scrape it forever.
--
-- Set when the harvester COMPLETES an attempt — even if it kept zero snippets (a wash whose
-- reviews mention nothing self-serve is still "mined", just empty). NOT set on transient
-- failures (consent wall, unverified place, network) so those retry. NULL = never mined.
--
-- The self-serve mining backlog is therefore, with no queue flag needed:
--   is_self_service=true AND is_approved=true AND self_service_reviewed_at IS NOT NULL
--   AND google_place_id LIKE 'ChIJ%' AND self_service_reviews_mined_at IS NULL
-- i.e. a listing enrols itself the moment it's approved (reviewed_at set, mined_at still NULL).
alter table listings add column if not exists self_service_reviews_mined_at timestamptz;

comment on column listings.self_service_reviews_mined_at is
  'When self-serve review harvesting last completed for this listing (even if 0 self-serve snippets kept). NULL = not yet mined. Drives the mine-selfserve-backlog drain; never affects public visibility.';

create index if not exists listings_ss_reviews_mined_idx
  on listings (self_service_reviews_mined_at)
  where is_self_service = true and is_approved = true;
