-- Reset all previously scanned listings so they can be re-scanned with the
-- corrected keyword verification logic. Only ~20 listings were scanned.
UPDATE listings
SET review_mine_status = NULL
WHERE review_mine_status = 'scanned_clean';
