/*
  # Add chain support fields and name+address uniqueness constraint

  ## Summary
  This migration adds two new columns and a unique constraint to the listings table
  to support multi-location car wash chains and prevent duplicate entries.

  ## New Columns

  ### parent_chain (text, nullable)
  - Stores the canonical brand/chain name for multi-location operators
  - Example: "Golden Nozzle Car Wash", "Prestige Car Wash"
  - When populated, the admin UI can group locations together
  - Null for independent single-location businesses

  ### location_page_url (text, nullable)
  - Stores a location-specific URL (e.g. a page on the brand site for just that branch)
  - Separate from `website` which holds the brand root URL
  - Used for crawling per-location hours, services, and touchless evidence
  - Example: "https://alltowncarwash.com/locations/l/fitchburg/129-whalon-street/4564653"

  ## Unique Constraint
  - Adds UNIQUE(name, address, city, zip) (case-insensitive) to prevent inserting
    duplicate listings for the same business at the same location
  - Two different businesses at the same address are allowed (e.g. a strip mall)
  - The constraint normalizes case to catch "State Rd" vs "state rd" style differences

  ## Notes
  - parent_chain is intentionally free-text to avoid needing a separate chains table
    at this stage; it can be normalized later if needed
  - location_page_url should be used as the crawl target for chains where each
    location has its own page, rather than crawling the brand root website
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'parent_chain'
  ) THEN
    ALTER TABLE listings ADD COLUMN parent_chain text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'location_page_url'
  ) THEN
    ALTER TABLE listings ADD COLUMN location_page_url text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS listings_name_address_city_zip_unique
  ON listings (LOWER(name), LOWER(address), LOWER(city), LOWER(zip));
