-- Add the missing #3 winner to the Hartford, CT metro.
--
-- A read-only full-recompute simulation (mirroring populate-best-of-rankings.mts
-- exactly) showed the 2026 frozen rankings are accurate for 190 of 191 metros.
-- The sole gap: Hartford qualified a 3rd trophy winner after the freeze that the
-- frozen table never captured — "The Car Wash Center East Windsor" (East Windsor,
-- CT), proprietary score 78.9, which slots cleanly below the existing #2 (83.2).
-- #1 and #2 are unchanged; no other metro changes; no contacted owner affected.
--
-- This is an ADDITIVE one-row fix (not a full recompute — that would needlessly
-- reset every winner's computed_at and shift all certificate "Awarded" dates).
-- We match the existing Hartford rows' computed_at for consistency. Briefly lift
-- the 2026 freeze guard, insert, and re-lock.

alter table public.best_of_rankings disable trigger freeze_best_of_rankings;

insert into public.best_of_rankings (listing_id, metro_slug, metro_name, rank, score, computed_at)
values (
  '82c3c5dc-0b2f-41e8-b79d-b40318717798',
  'hartford',
  'Hartford, CT',
  3,
  78.9,
  '2026-06-19T18:06:26.033+00:00'
);

alter table public.best_of_rankings enable trigger freeze_best_of_rankings;
