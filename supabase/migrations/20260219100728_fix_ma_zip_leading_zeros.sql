/*
  # Fix Massachusetts ZIP codes missing leading zero

  ## Problem
  ZIP codes for Massachusetts (and other states with 0-prefixed ZIPs) were
  imported as numeric values and stored as text without the leading zero.
  For example, "01742" was stored as "1742".

  ## Fix
  Pad all ZIP codes that are 4 characters long (implying a leading zero was
  dropped) with a leading '0' to restore the correct 5-digit format.
  This affects MA, CT, NH, VT, ME, RI, NJ, and NY ZIPs starting with 0.
*/

UPDATE listings
SET zip = LPAD(zip, 5, '0')
WHERE LENGTH(zip) = 4 AND zip ~ '^\d{4}$';
