-- The anon INSERT *policy* alone didn't unblock the suggest-edit form: inserting
-- a row needs BOTH a passing RLS policy AND the table-level INSERT privilege.
-- This project's tightened RLS posture means anon/authenticated were never
-- granted INSERT on listing_edits, so visitor submissions still failed. Grant it
-- (RLS still gates each row via the permissive WITH CHECK policy).
grant insert on table public.listing_edits to anon, authenticated;

-- Re-assert a permissive insert policy (idempotent) so the row check is in place
-- regardless of whether the original "Anyone can submit a listing edit" policy
-- is present on remote.
drop policy if exists "anon submit listing edits" on public.listing_edits;
create policy "anon submit listing edits"
  on public.listing_edits
  for insert
  to anon, authenticated
  with check (
    issue_type in (
      'permanently_closed','not_touchless','wrong_address',
      'wrong_phone','wrong_hours','wrong_website','other'
    )
    and (details is null or char_length(details) <= 2000)
    and (email is null or char_length(email) <= 200)
  );
