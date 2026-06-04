-- Paint-Safe feature (Option B). Additive only — new columns on listings.
-- paint_safe_verified : public badge (positive endorsement; earned per criteria).
-- paint_state         : 'verified' | 'has_data_unverified' | 'not_enough'.
-- paint_score         : INTERNAL granular 0-100 (ranking/sort/Best-Of only; NOT shown as a public grade).
-- paint_pos/paint_neg : touchless paint-sentiment counts (power the evidence drawer % split).
alter table public.listings
  add column if not exists paint_safe_verified boolean not null default false,
  add column if not exists paint_state text,
  add column if not exists paint_score integer,
  add column if not exists paint_pos integer not null default 0,
  add column if not exists paint_neg integer not null default 0,
  add column if not exists paint_scored_at timestamptz;

-- Index to quickly list/filter verified washes and rank by internal score.
create index if not exists idx_listings_paint_verified
  on public.listings (paint_safe_verified, paint_score desc nulls last)
  where is_touchless = true and is_approved = true;

-- Per-snippet Haiku labels that power the evidence drawer (theme chips + % split).
-- paint_relevant      : snippet actually speaks to paint/finish safety.
-- paint_sentiment     : 'positive' | 'negative' | 'neutral' (re: paint).
-- paint_about_touchless: 'touchless' | 'brush' | 'unclear' (brush complaints excluded from scoring).
alter table public.review_snippets
  add column if not exists paint_relevant boolean,
  add column if not exists paint_sentiment text,
  add column if not exists paint_about_touchless text;
