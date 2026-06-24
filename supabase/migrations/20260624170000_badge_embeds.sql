-- Badge backlink tracking: records which external websites have embedded a
-- trophy badge. The /api/badge/[slug] image route (served from our own server)
-- records the referring site each time the badge is loaded from off-site.
-- One row per (wash slug, embedding domain); last_seen bumped on repeat loads.

create table if not exists public.badge_embeds (
  id uuid primary key default gen_random_uuid(),
  listing_slug text not null,
  referer_domain text not null,
  referer_url text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (listing_slug, referer_domain)
);
create index if not exists badge_embeds_first_seen_idx on public.badge_embeds (first_seen desc);

-- Writes come from the badge route as service_role (bypasses RLS). The admin
-- Stats page reads via the anon client, so allow anon/authenticated SELECT only.
alter table public.badge_embeds enable row level security;
grant select on table public.badge_embeds to anon, authenticated;
drop policy if exists "badge_embeds public read" on public.badge_embeds;
create policy "badge_embeds public read"
  on public.badge_embeds for select to anon, authenticated using (true);
