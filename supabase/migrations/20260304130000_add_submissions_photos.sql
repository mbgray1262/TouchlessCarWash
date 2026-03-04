/*
  # Add photos column to submissions table

  Allows business owners to upload photos when submitting their listing.
  Photos are stored in the listing-photos bucket under a submissions/ prefix.
*/

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS photos text[];
