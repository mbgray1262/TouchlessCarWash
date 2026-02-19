/*
  # Create vendors table and add vendor_id to listings

  ## Summary
  Introduces a vendor management layer to the car wash directory. This is a purely
  additive migration — no existing data is modified or removed.

  ## New Tables

  ### vendors
  Represents a car wash brand or operator. One vendor can have many listing locations.

  - `id` — auto-incrementing integer primary key
  - `canonical_name` — the official, clean brand name (required)
  - `domain` — root domain only, e.g. "goldennozzlecarwash.com" (no www/https)
  - `website` — full URL of the vendor's main website
  - `logo_url` — URL to the vendor's logo image
  - `description` — free-text description of the vendor
  - `is_chain` — true if the vendor operates multiple locations (default false)
  - `created_at` — row creation timestamp
  - `updated_at` — row last-updated timestamp

  ## Modified Tables

  ### listings
  - Adds nullable `vendor_id` (integer) foreign key referencing `vendors.id`
  - Existing rows are unaffected (column defaults to NULL)

  ## Security
  - RLS enabled on `vendors`
  - Public read access for approved vendor data
  - No write access from the client side (admin-only via service role)

  ## Notes
  1. The `vendor_id` on `listings` is intentionally nullable — existing records remain intact.
  2. An index is added on `listings.vendor_id` for efficient join queries.
  3. A unique index on `vendors.domain` prevents duplicate vendor domains.
  4. An `updated_at` trigger keeps the timestamp current automatically.
*/

CREATE TABLE IF NOT EXISTS vendors (
  id          serial PRIMARY KEY,
  canonical_name text NOT NULL,
  domain      text,
  website     text,
  logo_url    text,
  description text,
  is_chain    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_domain_key ON vendors (domain) WHERE domain IS NOT NULL;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vendors"
  ON vendors FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_vendors_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_vendors_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'vendor_id'
  ) THEN
    ALTER TABLE listings ADD COLUMN vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS listings_vendor_id_idx ON listings (vendor_id);
