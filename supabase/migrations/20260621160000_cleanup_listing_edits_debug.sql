-- Remove the temporary introspection/debug functions added while diagnosing the
-- suggest-edit form, and the redundant insert policy (the original
-- "Anyone can submit a listing edit" policy already permits anon inserts; the
-- form was never actually blocked — a flawed test added .select(), which forces
-- a RLS-gated read-back that anon can't do).
drop function if exists public._dbg_le();
drop function if exists public._dbg_try_insert(uuid);
drop policy if exists "anon submit listing edits" on public.listing_edits;
