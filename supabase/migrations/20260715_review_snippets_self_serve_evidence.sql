-- Self-serve evidence on review snippets.
--
-- Mirrors the existing is_touchless_evidence / touchless_keywords pair rather than
-- overloading it: a snippet can be evidence for touchless, self-serve, both, or neither
-- (mixed sites are the norm — an in-bay automatic next to wand bays), so the two signals
-- have to be independently queryable.
alter table public.review_snippets
  add column if not exists is_self_serve_evidence boolean not null default false,
  add column if not exists self_serve_keywords    text[];

-- Partial index: we only ever scan for the true rows (to score a listing / surface
-- snippets), and they're a small fraction of 42k+.
create index if not exists review_snippets_self_serve_evidence_idx
  on public.review_snippets (listing_id)
  where is_self_serve_evidence;

comment on column public.review_snippets.is_self_serve_evidence is
  'Customer review mentions self-serve equipment (wand, coin/quarters, foam brush, self-serve bay). Corroborating signal only — self-serve vocabulary is far less distinctive than touchless ("bay"/"vacuum" occur at every wash type), so a single keyword hit is NOT sufficient to classify a listing.';
