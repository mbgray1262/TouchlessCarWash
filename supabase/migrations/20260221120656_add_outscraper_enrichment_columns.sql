/*
  # Add Outscraper Enrichment Columns

  ## Summary
  Adds 17 new columns to the listings table populated from re-uploaded Outscraper spreadsheets.
  This is a purely ADDITIVE migration — no existing columns are modified or dropped.

  ## New Columns

  ### Images
  - `google_photo_url` (text) — Primary Google Business photo URL (lh3.googleusercontent.com)
  - `google_logo_url` (text) — Business logo image URL from Google
  - `street_view_url` (text) — Google Street View image URL
  - `google_photos_count` (integer) — Number of photos on the Google Business Profile

  ### Business Info
  - `google_description` (text) — Business description from Google Business Profile
  - `google_about` (jsonb) — Business attributes (payments, services, accessibility, etc.)
  - `google_subtypes` (text) — Google subcategories (comma-separated)
  - `google_category` (text) — Primary Google category
  - `business_status` (text) — OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY
  - `is_google_verified` (boolean) — Whether the business is verified on Google

  ### Customer-Facing Data
  - `reviews_per_score` (jsonb) — Rating distribution: {"1": N, "2": N, "3": N, "4": N, "5": N}
  - `popular_times` (jsonb) — Customer traffic patterns by day/hour
  - `typical_time_spent` (text) — Typical visit duration (e.g., "10-20 min")
  - `price_range` (text) — Price level indicator

  ### Links & IDs
  - `booking_url` (text) — Direct booking/appointment link
  - `google_maps_url` (text) — Direct Google Maps link
  - `google_id` (text) — Google hex ID (e.g., "0x88891c39570e89cd:0x55c0d66385d2a7eb")

  ## Security
  No RLS changes — inherits existing listing table policies.

  ## Notes
  1. All columns use IF NOT EXISTS guards to be safely re-runnable.
  2. All columns default to NULL so existing rows are unaffected.
*/

DO $$
BEGIN
  -- Images
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_photo_url') THEN
    ALTER TABLE listings ADD COLUMN google_photo_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_logo_url') THEN
    ALTER TABLE listings ADD COLUMN google_logo_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'street_view_url') THEN
    ALTER TABLE listings ADD COLUMN street_view_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_photos_count') THEN
    ALTER TABLE listings ADD COLUMN google_photos_count integer;
  END IF;

  -- Business Info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_description') THEN
    ALTER TABLE listings ADD COLUMN google_description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_about') THEN
    ALTER TABLE listings ADD COLUMN google_about jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_subtypes') THEN
    ALTER TABLE listings ADD COLUMN google_subtypes text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_category') THEN
    ALTER TABLE listings ADD COLUMN google_category text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'business_status') THEN
    ALTER TABLE listings ADD COLUMN business_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'is_google_verified') THEN
    ALTER TABLE listings ADD COLUMN is_google_verified boolean;
  END IF;

  -- Customer-Facing Data
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'reviews_per_score') THEN
    ALTER TABLE listings ADD COLUMN reviews_per_score jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'popular_times') THEN
    ALTER TABLE listings ADD COLUMN popular_times jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'typical_time_spent') THEN
    ALTER TABLE listings ADD COLUMN typical_time_spent text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'price_range') THEN
    ALTER TABLE listings ADD COLUMN price_range text;
  END IF;

  -- Links & IDs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'booking_url') THEN
    ALTER TABLE listings ADD COLUMN booking_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_maps_url') THEN
    ALTER TABLE listings ADD COLUMN google_maps_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'google_id') THEN
    ALTER TABLE listings ADD COLUMN google_id text;
  END IF;
END $$;
