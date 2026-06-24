-- SECURITY FIX (final two findings):
--
-- 1) public.photo_audit_results — RLS disabled in public. Internal QA table:
--    written by admin (authenticated browser session) + the batch-photo-audit edge
--    function (service_role). Lock anon to read-only; admin keeps full CRUD.
--
-- 2) public.vendors_with_listing_counts — flagged SECURITY DEFINER view (runs as
--    its creator, bypassing the caller's RLS). Switch to SECURITY INVOKER so it
--    respects the querying role. Safe: anon already has SELECT on the underlying
--    tables (vendors, listings), so public reads of the view keep working.

-- ── photo_audit_results ──────────────────────────────────────────────────────
alter table public.photo_audit_results enable row level security;

drop policy if exists "photo_audit public read" on public.photo_audit_results;
create policy "photo_audit public read" on public.photo_audit_results
  for select to anon, authenticated using (true);

grant select, insert, update, delete on table public.photo_audit_results to authenticated;
drop policy if exists "photo_audit admin write" on public.photo_audit_results;
create policy "photo_audit admin write" on public.photo_audit_results
  for all to authenticated using (true) with check (true);

revoke insert, update, delete on table public.photo_audit_results from anon;

-- ── vendors_with_listing_counts view ─────────────────────────────────────────
alter view public.vendors_with_listing_counts set (security_invoker = on);
