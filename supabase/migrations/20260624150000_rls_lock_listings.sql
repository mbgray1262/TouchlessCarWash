-- SECURITY FIX: lock down public.listings (closes the headline finding —
-- "anon can UPDATE/DELETE every listing"). Verified safe end-to-end first:
--   • public reads run as anon server-side  → kept (explicit SELECT policy below)
--   • admin edits run as the logged-in authenticated session → kept (proven by the
--     vendors canary: Michael edited a vendor in Admin and it persisted)
--   • server routes (/api/add-listing, /api/admin/listings/*) now run as
--     service_role (SUPABASE_SERVICE_ROLE_KEY added to Netlify) → bypass RLS
--   • no public/client-side anon writes exist (add-listing posts to the server route;
--     EditListingModal/FullEditListingPanel/BatchVerifyModal are admin-only)
--
-- Belt-and-suspenders: we BOTH revoke anon's write GRANTS (a hard block — RLS
-- needs the table privilege regardless of policy) AND drop the anon-write policies.
-- Fully reversible: `alter table public.listings disable row level security;`
-- plus `grant insert,update,delete on public.listings to anon;` if ever needed.

alter table public.listings enable row level security;

-- Guarantee public read so enabling RLS can never dark the site.
drop policy if exists "listings public read" on public.listings;
create policy "listings public read" on public.listings
  for select to anon, authenticated using (true);

-- Admin (authenticated browser session) keeps full write.
grant select, insert, update, delete on table public.listings to authenticated;
drop policy if exists "listings admin write" on public.listings;
create policy "listings admin write" on public.listings
  for all to authenticated using (true) with check (true);

-- CLOSE THE HOLE: anon = read-only. Drop every anon-write policy and revoke the
-- underlying write privileges (either alone is sufficient; both = defense in depth).
drop policy if exists "Allow anon insert" on public.listings;
drop policy if exists "Allow anon update" on public.listings;
drop policy if exists "Anonymous users can insert listings" on public.listings;
revoke insert, update, delete on table public.listings from anon;
