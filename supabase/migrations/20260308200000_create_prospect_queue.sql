-- Create a queue of cities to prospect for touchless car washes.
-- Focuses on underrepresented states (low touchless-to-total ratio).

CREATE TABLE IF NOT EXISTS prospect_queue (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,          -- e.g. "Miami, FL"
  state TEXT NOT NULL,
  priority INT DEFAULT 0,       -- higher = process first
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, error
  places_found INT,
  already_in_db INT,
  new_checked INT,
  touchless_imported INT,
  api_calls_used INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_prospect_queue_status ON prospect_queue(status, priority DESC);

-- ============================================================
-- Priority 1: Biggest gaps (huge markets, very low touchless %)
-- FL (2.2%), CA (2.7%), NJ (1.4%), GA (2.4%)
-- ============================================================

-- Florida (4,495 listings, only 99 touchless = 2.2%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Miami, FL', 'FL', 10),
  ('Tampa, FL', 'FL', 10),
  ('Orlando, FL', 'FL', 10),
  ('Jacksonville, FL', 'FL', 10),
  ('Fort Lauderdale, FL', 'FL', 9),
  ('St. Petersburg, FL', 'FL', 9),
  ('West Palm Beach, FL', 'FL', 9),
  ('Naples, FL', 'FL', 8),
  ('Sarasota, FL', 'FL', 8),
  ('Tallahassee, FL', 'FL', 8),
  ('Gainesville, FL', 'FL', 7),
  ('Fort Myers, FL', 'FL', 7),
  ('Daytona Beach, FL', 'FL', 7),
  ('Pensacola, FL', 'FL', 7),
  ('Cape Coral, FL', 'FL', 7),
  ('Lakeland, FL', 'FL', 6),
  ('Port St. Lucie, FL', 'FL', 6),
  ('Ocala, FL', 'FL', 6),
  ('Palm Bay, FL', 'FL', 6),
  ('Boca Raton, FL', 'FL', 6);

-- California (4,994 listings, only 133 touchless = 2.7%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Los Angeles, CA', 'CA', 10),
  ('San Francisco, CA', 'CA', 10),
  ('San Diego, CA', 'CA', 10),
  ('San Jose, CA', 'CA', 10),
  ('Sacramento, CA', 'CA', 9),
  ('Oakland, CA', 'CA', 9),
  ('Fresno, CA', 'CA', 9),
  ('Long Beach, CA', 'CA', 8),
  ('Bakersfield, CA', 'CA', 8),
  ('Anaheim, CA', 'CA', 8),
  ('Riverside, CA', 'CA', 8),
  ('Santa Ana, CA', 'CA', 7),
  ('Irvine, CA', 'CA', 7),
  ('Stockton, CA', 'CA', 7),
  ('Modesto, CA', 'CA', 7),
  ('Santa Clarita, CA', 'CA', 6),
  ('Pasadena, CA', 'CA', 6),
  ('Torrance, CA', 'CA', 6),
  ('Burbank, CA', 'CA', 6),
  ('Glendale, CA', 'CA', 6);

-- New Jersey (2,403 listings, only 34 touchless = 1.4%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Newark, NJ', 'NJ', 10),
  ('Jersey City, NJ', 'NJ', 10),
  ('Trenton, NJ', 'NJ', 9),
  ('Edison, NJ', 'NJ', 9),
  ('Woodbridge, NJ', 'NJ', 8),
  ('Cherry Hill, NJ', 'NJ', 8),
  ('Toms River, NJ', 'NJ', 8),
  ('Paramus, NJ', 'NJ', 7),
  ('Wayne, NJ', 'NJ', 7),
  ('Atlantic City, NJ', 'NJ', 7),
  ('Princeton, NJ', 'NJ', 6),
  ('Hackensack, NJ', 'NJ', 6),
  ('Morristown, NJ', 'NJ', 6);

-- Georgia (1,782 listings, only 42 touchless = 2.4%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Atlanta, GA', 'GA', 10),
  ('Savannah, GA', 'GA', 9),
  ('Augusta, GA', 'GA', 9),
  ('Columbus, GA', 'GA', 8),
  ('Macon, GA', 'GA', 8),
  ('Athens, GA', 'GA', 7),
  ('Marietta, GA', 'GA', 7),
  ('Roswell, GA', 'GA', 6),
  ('Albany, GA', 'GA', 6),
  ('Warner Robins, GA', 'GA', 6);

-- ============================================================
-- Priority 2: Moderate gaps
-- DC (0.9%), CT (2.5%), AL (2.9%), LA (3.5%), MS (3.8%), AZ (4.2%)
-- ============================================================

-- DC (117 listings, only 1 touchless = 0.9%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Washington, DC', 'DC', 10),
  ('Georgetown, Washington DC', 'DC', 8),
  ('Capitol Hill, Washington DC', 'DC', 7);

-- Connecticut (1,032 listings, only 26 touchless = 2.5%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Hartford, CT', 'CT', 8),
  ('New Haven, CT', 'CT', 8),
  ('Stamford, CT', 'CT', 8),
  ('Bridgeport, CT', 'CT', 7),
  ('Waterbury, CT', 'CT', 7),
  ('Danbury, CT', 'CT', 6);

-- Alabama (876 listings, only 25 touchless = 2.9%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Birmingham, AL', 'AL', 8),
  ('Huntsville, AL', 'AL', 8),
  ('Montgomery, AL', 'AL', 7),
  ('Mobile, AL', 'AL', 7),
  ('Tuscaloosa, AL', 'AL', 6);

-- Louisiana (683 listings, only 24 touchless = 3.5%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('New Orleans, LA', 'LA', 8),
  ('Baton Rouge, LA', 'LA', 8),
  ('Shreveport, LA', 'LA', 7),
  ('Lafayette, LA', 'LA', 7),
  ('Lake Charles, LA', 'LA', 6);

-- Mississippi (395 listings, only 15 touchless = 3.8%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Jackson, MS', 'MS', 7),
  ('Gulfport, MS', 'MS', 7),
  ('Hattiesburg, MS', 'MS', 6),
  ('Tupelo, MS', 'MS', 6);

-- Arizona (1,134 listings, only 48 touchless = 4.2%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Phoenix, AZ', 'AZ', 8),
  ('Tucson, AZ', 'AZ', 8),
  ('Scottsdale, AZ', 'AZ', 7),
  ('Mesa, AZ', 'AZ', 7),
  ('Chandler, AZ', 'AZ', 6),
  ('Gilbert, AZ', 'AZ', 6),
  ('Tempe, AZ', 'AZ', 6);

-- Oregon (591 listings, only 24 touchless = 4.1%)
INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Portland, OR', 'OR', 8),
  ('Salem, OR', 'OR', 7),
  ('Eugene, OR', 'OR', 7),
  ('Bend, OR', 'OR', 6),
  ('Medford, OR', 'OR', 6);

-- ============================================================
-- Priority 3: Additional large markets with below-average rates
-- TX (5.2% but huge market), NY (4.1%)
-- ============================================================

INSERT INTO prospect_queue (query, state, priority) VALUES
  ('Houston, TX', 'TX', 7),
  ('Dallas, TX', 'TX', 7),
  ('San Antonio, TX', 'TX', 7),
  ('Austin, TX', 'TX', 7),
  ('Fort Worth, TX', 'TX', 6),
  ('El Paso, TX', 'TX', 6),
  ('New York City, NY', 'NY', 7),
  ('Buffalo, NY', 'NY', 7),
  ('Rochester, NY', 'NY', 6),
  ('Syracuse, NY', 'NY', 6),
  ('Albany, NY', 'NY', 6);
