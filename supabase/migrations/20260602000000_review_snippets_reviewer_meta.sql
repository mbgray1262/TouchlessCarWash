-- Add reviewer-credential metadata to review_snippets so we can display
-- "Local Guide · 90 reviews · 44 photos" alongside each clean snippet and
-- weight the Paint-Safe Score by reviewer credibility.
alter table public.review_snippets
  add column if not exists reviewer_credentials text,
  add column if not exists reviewer_review_count integer,
  add column if not exists reviewer_photo_count integer,
  add column if not exists reviewer_is_local_guide boolean default false;
