/*
  # Add hero_image column to listings table

  1. Changes
    - Add `hero_image` (text) column to store the selected hero image URL
    - This is the primary image shown on listing cards and detail pages
    - Can be manually selected by admin or AI-suggested via the extract data workflow
*/

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS hero_image text;
