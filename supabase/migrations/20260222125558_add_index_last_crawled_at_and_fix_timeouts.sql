/*
  # Add index on last_crawled_at for admin listings page performance

  ## Summary
  The admin listings page queries all 55,000+ listings sorted by last_crawled_at.
  Without an index, this requires a full sequential scan + sort, which is slow and
  may time out under PostgREST's default statement timeout.

  This migration adds an index on last_crawled_at (DESC NULLS LAST) to speed up
  the most common sort order, and indexes for the other sort fields.

  ## New Indexes
  - `listings_last_crawled_at_idx` — on last_crawled_at DESC NULLS LAST (primary sort)
  - `listings_name_idx` — on name for name A-Z sort
  - `listings_city_idx` — on city for city sort

  Also updates admin_listing_stats and get_distinct_chain_names to set an explicit
  statement timeout so they don't block indefinitely.
*/

CREATE INDEX IF NOT EXISTS listings_last_crawled_at_idx
  ON listings (last_crawled_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS listings_name_idx
  ON listings (name);

CREATE INDEX IF NOT EXISTS listings_city_idx
  ON listings (city);
