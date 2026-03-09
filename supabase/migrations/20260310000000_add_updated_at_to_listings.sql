-- Add updated_at column to listings table for better sitemap lastmod signals
ALTER TABLE listings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: set updated_at = created_at for existing rows
UPDATE listings SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = now();

-- Create trigger function to auto-update on row changes
CREATE OR REPLACE FUNCTION update_listings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS set_listings_updated_at ON listings;
CREATE TRIGGER set_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_listings_updated_at();
