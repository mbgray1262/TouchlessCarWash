/*
  # Add structured data extraction columns

  1. Changes
    - Add `photos` column (jsonb array) to store photo URLs
    - Add `amenities` column (jsonb array) to store detailed amenities list
    - Add `hours` column (jsonb) to store operating hours
    - Add `extracted_at` column (timestamptz) to track when data was extracted
  
  2. Purpose
    - These columns store AI-extracted structured data from the crawl_snapshot
    - Allows secondary pass data extraction without re-crawling
    - Preserves flexibility to refine extraction logic over time
*/

-- Add columns for extracted structured data
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS amenities jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS hours jsonb,
ADD COLUMN IF NOT EXISTS extracted_at timestamptz;