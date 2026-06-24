-- Relabel the Haverhill metro display name from "Haverhill, MA" to the
-- cross-state-accurate "Haverhill, MA-NH". The metro is DEFINED to span both
-- states (states: ['MA','NH'] in lib/metro-areas.ts) and its 20-mi radius
-- legitimately includes southern-NH towns like Londonderry — so NH washes win
-- here. The single-state label was just confusing to those NH owners.
--
-- This is a DISPLAY-LABEL change only. It touches `metro_name` and nothing else
-- — listing_id, rank, and score are untouched, so no winner/order changes. We
-- briefly lift the 2026 freeze guard (which exists to stop winners from
-- drifting), relabel, and immediately re-lock it.

alter table public.best_of_rankings disable trigger freeze_best_of_rankings;

update public.best_of_rankings
  set metro_name = 'Haverhill, MA-NH'
  where metro_slug = 'haverhill';

alter table public.best_of_rankings enable trigger freeze_best_of_rankings;
