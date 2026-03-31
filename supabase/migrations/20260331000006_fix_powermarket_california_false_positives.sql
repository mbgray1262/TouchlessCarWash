/*
  # Fix Power Market California false positives

  ## Problem
  125 California Power Market locations were bulk-tagged is_touchless=true based on
  chain membership alone. The Power Market car wash directory (pwrmarket.com/car-washes-oregon/,
  which also lists CA) confirms only 40 CA locations have car washes — 11 of which
  are missing from our DB entirely. The remaining ~96 DB entries are plain gas stations.

  ## Fix
  1. Mark ALL CA Power Market locations as is_touchless=false
  2. Re-enable 29 confirmed car wash locations matched to our DB addresses

  ## Confirmed CA car wash locations re-enabled (from Power Market website):
    Anaheim, Antelope, Auburn (×2), Cameron Park, Capitola, Chino,
    Elk Grove (×2), Eureka (2111 4th St only), Folsom (1024 E Bidwell only),
    Fortuna (×2), Fullerton, McKinleyville, Milpitas, Oceanside (2191 Vista Way),
    Olivehurst (4217 Arboga Rd), Pomona (×2), Roseville (×2), Sacramento (Elder Creek),
    Salinas (×2), Santa Cruz, Scotts Valley (×2), Vacaville

  ## Missing from DB (confirmed on website, need to be added):
    - 700 N Brookhurst St, Anaheim CA
    - 6971 Beach Blvd, Buena Park CA
    - 5049 Marconi Ave, Carmichael CA
    - 9881 Greenback Ln, Folsom CA
    - 1020 Riley St, Folsom CA
    - 25991 Crown Valley Pkwy, Laguna Niguel CA
    - 3030 Del Monte Blvd, Marina CA
    - 656 Benet Rd, Oceanside CA
    - 1495 Lake Blvd, Redding CA
    - 3300 Bradshaw Rd, Sacramento CA
    - 1305 S Front St, Soledad CA
*/

-- Step 1: remove all CA Power Market false positives
UPDATE listings
SET is_touchless = false, touchless_verified = null
WHERE parent_chain = 'Power Market' AND state = 'CA';

-- Step 2: re-enable confirmed car wash locations
UPDATE listings
SET is_touchless = true, touchless_verified = 'chain'
WHERE parent_chain = 'Power Market' AND state = 'CA'
  AND (
    (city = 'Anaheim'       AND address ILIKE '%201%State College%')
    OR (city = 'Antelope'      AND address ILIKE '%7966%Walerga%')
    OR (city = 'Auburn'        AND address ILIKE '%10021%Combie%')
    OR (city = 'Auburn'        AND address ILIKE '%3960%Grass Valley%')
    OR (city = 'Cameron Park'  AND address ILIKE '%4051%Cameron Park%')
    OR (city = 'Capitola'      AND address ILIKE '%1649%41st%')
    OR (city = 'Chino'         AND address ILIKE '%14088%Euclid%')
    OR (city = 'Elk Grove'     AND address ILIKE '%9198%Elk Grove Florin%')
    OR (city = 'Elk Grove'     AND address ILIKE '%2323%Laguna%')
    OR (city = 'Eureka'        AND address ILIKE '%2111%4th%')
    OR (city = 'Folsom'        AND address ILIKE '%1024%Bidwell%')
    OR (city = 'Fortuna'       AND address ILIKE '%1791%Riverwalk%')
    OR (city = 'Fortuna'       AND address ILIKE '%723%Fortuna Blvd%')
    OR (city = 'Fullerton'     AND address ILIKE '%2950%Nutwood%')
    OR (city = 'McKinleyville' AND address ILIKE '%1606%Central%')
    OR (city = 'Milpitas'      AND address ILIKE '%1551%California%')
    OR (city = 'Oceanside'     AND address ILIKE '%2191%Vista Way%')
    OR (city = 'Olivehurst'    AND address ILIKE '%4217%Arboga%')
    OR (city = 'Pomona'        AND address ILIKE '%1515%Garey%')
    OR (city = 'Pomona'        AND address ILIKE '%3190%Temple%')
    OR (city = 'Roseville'     AND address ILIKE '%10545%Fairway%')
    OR (city = 'Roseville'     AND address ILIKE '%3001%Foothills%')
    OR (city = 'Sacramento'    AND address ILIKE '%8914%Elder Creek%')
    OR (city = 'Salinas'       AND address ILIKE '%1764%Main%')
    OR (city = 'Salinas'       AND address ILIKE '%417%Main%')
    OR (city = 'Santa Cruz'    AND address ILIKE '%2700%Soquel%')
    OR (city = 'Scotts Valley' AND address ILIKE '%Hacienda%')
    OR (city = 'Scotts Valley' AND address ILIKE '%Mt Hermon%')
    OR (city = 'Vacaville'     AND address ILIKE '%501%Peabody%')
  );
