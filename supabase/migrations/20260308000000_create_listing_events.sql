-- Track high-value click events on listing detail pages.
-- Events: 'directions', 'phone', 'website'
CREATE TABLE listing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_listing_events_listing ON listing_events(listing_id);
CREATE INDEX idx_listing_events_type ON listing_events(event_type);
CREATE INDEX idx_listing_events_created ON listing_events(created_at);

-- Allow anonymous inserts (visitors aren't logged in) but block reads from anon
ALTER TABLE listing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON listing_events FOR INSERT TO anon WITH CHECK (true);
