/*
  # Add trigram indexes for fast full-text search on listings

  ## Purpose
  The admin listings search uses ILIKE '%term%' on name, city, state, and parent_chain.
  Without trigram indexes, each query does a full sequential scan of 55k+ rows, causing
  statement timeouts.

  ## Changes
  - Adds GIN trigram indexes on name, city, state, parent_chain
  - These indexes make ILIKE '%keyword%' queries ~100x faster
*/

CREATE INDEX IF NOT EXISTS idx_listings_name_trgm
  ON listings USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_city_trgm
  ON listings USING GIN (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_state_trgm
  ON listings USING GIN (state gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_parent_chain_trgm
  ON listings USING GIN (parent_chain gin_trgm_ops);
