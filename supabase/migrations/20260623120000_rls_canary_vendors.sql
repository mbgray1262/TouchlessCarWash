-- SECURITY FIX — CANARY (2026-06-23)
-- Closes the anon write hole on `vendors` while keeping the public site
-- (anonymous reads) and the admin panel (authenticated browser session)
-- fully working. This is the lower-stakes pilot for the same lock that will
-- roll out to `listings` + `photo_audit_results` once verified end-to-end.
--
-- Role model after this migration:
--   anon          → SELECT only (the existing "Anyone can read vendors" policy);
--                   INSERT / UPDATE / DELETE are blocked (no policy grants them).
--   authenticated → full CRUD (the logged-in admin's browser session) via the
--                   policy + grant below.
--   service_role  → bypasses RLS automatically (edge functions / CLI scripts).
--
-- Fully reversible: `alter table public.vendors disable row level security;`

alter table public.vendors enable row level security;

-- Make sure the admin (authenticated) role can actually write at the table level.
grant select, insert, update, delete on table public.vendors to authenticated;

-- Admin full access — covers SELECT/INSERT/UPDATE/DELETE for the logged-in admin
-- regardless of how the existing public-read policy is scoped.
drop policy if exists "vendors admin full access" on public.vendors;
create policy "vendors admin full access"
  on public.vendors for all
  to authenticated
  using (true)
  with check (true);
