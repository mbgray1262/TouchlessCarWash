-- Auto detailing — the 4th wash category (after touchless, self-serve, hand-wash). Mirrors the
-- hand-wash columns exactly. Detailing = deep periodic work (paint correction, ceramic, PPF,
-- full interior). A business can be BOTH a hand wash AND a detailer (dual-tagged), just like
-- mixed touchless+self-serve. Seeded from Google's "Car detailing service" primary category.
alter table public.listings
  add column if not exists is_detailing               boolean default null,
  add column if not exists detailing_reviewed_at      timestamptz,
  add column if not exists detailing_source           text,
  add column if not exists detailing_score            integer,
  add column if not exists detailing_scored_at        timestamptz,
  add column if not exists detailing_reviews_mined_at timestamptz;

-- Review evidence for detailing (mirrors is_touchless_evidence / is_self_serve_evidence /
-- is_hand_wash_evidence). A snippet can be evidence for any combination of wash types.
alter table public.review_snippets
  add column if not exists is_detailing_evidence boolean not null default false,
  add column if not exists detailing_keywords    text[];

create index if not exists review_snippets_detailing_evidence_idx
  on public.review_snippets (listing_id)
  where is_detailing_evidence;

comment on column public.review_snippets.is_detailing_evidence is
  'Customer review describes auto DETAILING work — paint correction, ceramic coating, PPF, clay bar, full interior detail, buffing/polishing, swirl removal. Corroboration + quality signal; combined with google_category + photos to classify.';
