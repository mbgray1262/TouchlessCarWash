-- Backfill parent_chain for chain-verified listings.
-- The import script didn't set parent_chain, so we infer it from name + state.

-- Power Market (by name)
UPDATE listings SET parent_chain = 'Power Market'
WHERE touchless_verified = 'chain' AND name ILIKE '%power market%';

-- Holiday Stationstores (all Holiday variants)
UPDATE listings SET parent_chain = 'Holiday Stationstores'
WHERE touchless_verified = 'chain'
  AND (name ILIKE '%holiday%' OR name ILIKE '%circle k%');

-- Kwik Trip
UPDATE listings SET parent_chain = 'Kwik Trip'
WHERE touchless_verified = 'chain' AND name ILIKE '%kwik trip%';

-- Remaining chain listings in CA/NV/OR with no parent_chain yet are Power Market
-- (DataForSEO returned the gas brand name instead of Power Market)
UPDATE listings SET parent_chain = 'Power Market'
WHERE touchless_verified = 'chain'
  AND parent_chain IS NULL
  AND state IN ('CA', 'NV', 'OR');

-- Remaining chain listings in WI/MN/ND/SD/MT/MI/AK/ID with no parent_chain
-- are Holiday Stationstores (states they operate in)
UPDATE listings SET parent_chain = 'Holiday Stationstores'
WHERE touchless_verified = 'chain'
  AND parent_chain IS NULL
  AND state IN ('MN', 'WI', 'ND', 'SD', 'MT', 'MI', 'AK', 'ID');

-- Report
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT parent_chain, COUNT(*) as cnt
    FROM listings
    WHERE touchless_verified = 'chain'
    GROUP BY parent_chain
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE 'parent_chain=% : % listings', r.parent_chain, r.cnt;
  END LOOP;
END $$;
