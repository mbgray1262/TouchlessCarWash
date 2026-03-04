/*
  # Add equipment_brand column for touchless wash equipment filtering

  Luxury car enthusiasts want to filter by specific touchless wash equipment.
  Different systems have different reputations for paint safety, cleaning
  quality, and technology features.

  Common touchless equipment brands:
  - laserwash (PDQ LaserWash 360, G5, etc. — most popular, laser-guided)
  - washworld (WashWorld Razor, Profile — popular alternatives)
  - pdq (PDQ Tandem, other PDQ systems)
  - petit (Petit AutoWash — high-end systems)
  - belanger (Belanger Kondor, SpinLite)
  - istobal (European manufacturer)
  - ryko (Ryko touchless systems)
  - ds (D&S Car Wash Systems)

  This is a simple TEXT column (not an enum) to allow flexibility as we
  discover more brands. The extract-rich-data pipeline will populate this
  from crawl snapshots alongside the full extracted_data JSONB.
*/

ALTER TABLE listings ADD COLUMN IF NOT EXISTS equipment_brand TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS equipment_model TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_equipment_brand
  ON listings (equipment_brand) WHERE equipment_brand IS NOT NULL;
