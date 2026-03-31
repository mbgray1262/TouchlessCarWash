/*
  # Fix Power Market Oregon false positives

  ## Problem
  We bulk-imported all 57 Power Market Oregon locations as is_touchless=true based on
  chain membership alone (touchless_verified='chain'), but only 14 of them actually have
  car washes (confirmed via pwrmarket.com/car-washes-oregon/).

  The remaining 43 are plain gas stations/convenience stores with no car wash at all.
  This caused listings like Gladstone, Bend (5 locations), Milwaukie, etc. to appear on
  our site as touchless car washes when they have nothing of the sort.

  ## Fix
  1. Mark ALL Oregon Power Market locations as is_touchless=false
  2. Re-enable only the 13 addresses confirmed on the Power Market car wash website
     (Redmond 2005 S Hwy 97 is on the website but missing from our DB entirely)

  ## Confirmed Oregon car wash locations (from pwrmarket.com/car-washes-oregon/):
    - 1123 Chetco Ave, Brookings
    - 112 Redwood Hwy, Cave Junction
    - 125 NE Morgan Ln, Grants Pass
    - 650 Redwood Hwy, Grants Pass
    - 1553 Williams Hwy, Grants Pass
    - 2104 S 6th St, Klamath Falls  (website shows "2104 SE 6th St")
    - 1210 US-97, Madras             (website shows "1210 SW Hwy 97")
    - 1306 Springbrook Rd, Medford
    - 785 W Stewart Ave, Medford     (website shows "785 Stewart Ave")
    - 13001 Clackamas River Dr, Oregon City
    - 730 N Main St, Phoenix         (website shows "730 W Main St" — direction may be wrong on one)
    - 398 NW 3rd St, Prineville
    - 56896 Venture Ln, Sunriver
*/

-- Step 1: Mark ALL Oregon Power Market locations as not touchless
UPDATE listings
SET
  is_touchless = false,
  touchless_verified = null
WHERE parent_chain = 'Power Market'
  AND state = 'OR';

-- Step 2: Re-enable confirmed car wash locations
UPDATE listings
SET
  is_touchless = true,
  touchless_verified = 'chain'
WHERE parent_chain = 'Power Market'
  AND state = 'OR'
  AND (
    (city = 'Brookings'    AND address ILIKE '%1123 Chetco%')
    OR (city = 'Cave Junction' AND address ILIKE '%112 Redwood%')
    OR (city = 'Grants Pass'   AND address ILIKE '%125%Morgan%')
    OR (city = 'Grants Pass'   AND address ILIKE '%650 Redwood%')
    OR (city = 'Grants Pass'   AND address ILIKE '%1553 Williams%')
    OR (city = 'Klamath Falls' AND address ILIKE '%2104%6th%')
    OR (city = 'Madras'        AND address ILIKE '%1210%97%')
    OR (city = 'Medford'       AND address ILIKE '%1306 Springbrook%')
    OR (city = 'Medford'       AND address ILIKE '%785%Stewart%')
    OR (city = 'Oregon City'   AND address ILIKE '%13001 Clackamas%')
    OR (city = 'Phoenix'       AND address ILIKE '%730%Main%')
    OR (city = 'Prineville'    AND address ILIKE '%398%3rd%')
    OR (city = 'Sunriver'      AND address ILIKE '%56896 Venture%')
  );
