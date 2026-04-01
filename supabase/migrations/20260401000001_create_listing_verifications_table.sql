-- Community verification: users confirm (or flag) whether a listing is actually touchless
create table if not exists listing_verifications (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  is_touchless boolean not null,               -- true = thumbs up, false = thumbs down
  comment      text check (char_length(comment) <= 500),
  ip_address   text not null,
  created_at   timestamptz not null default now()
);

create index if not exists listing_verifications_listing_id_idx on listing_verifications(listing_id);
create index if not exists listing_verifications_created_at_idx on listing_verifications(created_at desc);

-- Non-sensitive community data — allow public reads and service-role writes
alter table listing_verifications enable row level security;

create policy "Public read" on listing_verifications
  for select using (true);

create policy "Anon insert" on listing_verifications
  for insert with check (true);
