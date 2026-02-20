/*
  # Add partial unique index on google_place_id

  Adds a partial unique index on listings.google_place_id so that
  ON CONFLICT (google_place_id) clauses in bulk import queries work correctly.
  The index is partial (WHERE google_place_id IS NOT NULL) so rows without a
  place ID are not affected.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_google_place_id
  ON listings (google_place_id)
  WHERE google_place_id IS NOT NULL;
