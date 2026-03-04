/*
  # Add touchless_wash_types array column

  Classifies WHAT KIND of touchless service a listing offers.
  A listing can offer multiple types (e.g., both automatic + self-serve).

  Types:
  - touchless_automatic: Automated in-bay or tunnel wash using high-pressure
    water jets, foam, and chemicals with no brushes. Car stays still (IBA)
    or moves through on a conveyor. Includes LaserWash, PDQ, Washworld, etc.
  - self_serve_spray: Customer-operated open bay with a pressure wand/spray.
    No brushes — spray only. Coin-op or card-operated.

  The existing empty wash_type TEXT column is left as-is (unused).
*/

ALTER TABLE listings ADD COLUMN IF NOT EXISTS touchless_wash_types TEXT[] DEFAULT '{}';

-- Add check constraint for valid values
ALTER TABLE listings ADD CONSTRAINT valid_touchless_wash_types CHECK (
  touchless_wash_types <@ ARRAY['touchless_automatic', 'self_serve_spray']::TEXT[]
);

-- Index for filtering by wash type
CREATE INDEX IF NOT EXISTS idx_listings_touchless_wash_types
  ON listings USING GIN (touchless_wash_types);
