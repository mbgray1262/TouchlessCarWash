-- Refine the Haverhill metro label to a two-city, cross-state name:
-- "Haverhill, MA-NH" → "Haverhill-Salem, MA-NH". Pairing a MA city with a NH
-- city (Salem NH — the largest NH city on the border inside the 20-mi radius)
-- reads naturally and matches the existing two-city convention already used for
-- other metros (Minneapolis-St. Paul, Oceanside-Carlsbad, Warren-Youngstown).
--
-- DISPLAY-LABEL only — touches `metro_name` and nothing else (listing_id / rank /
-- score untouched → no winner/order change). Briefly lifts the 2026 freeze guard,
-- relabels the haverhill rows, then re-locks it.

alter table public.best_of_rankings disable trigger freeze_best_of_rankings;

update public.best_of_rankings
  set metro_name = 'Haverhill-Salem, MA-NH'
  where metro_slug = 'haverhill';

alter table public.best_of_rankings enable trigger freeze_best_of_rankings;
