/*
  # Add missing columns to submissions table

  The submissions table was created earlier without ip_address, submitter_email,
  and notes columns. This migration adds them.
*/

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitter_email text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS notes text;
