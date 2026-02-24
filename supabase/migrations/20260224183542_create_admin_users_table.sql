/*
  # Create admin_users table

  ## Summary
  Creates an allowlist of email addresses permitted to access the admin section.
  Seeded with michaelbgray123@gmail.com as the sole allowed admin.

  ## Tables
  - `admin_users`
    - `id` (uuid, primary key)
    - `email` (text, unique, not null) — the Google account email to whitelist
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled; only authenticated users can SELECT their own row (used server-side check)
  - Anon users have no access
*/

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read admin_users"
  ON admin_users FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO admin_users (email) VALUES ('michaelbgray123@gmail.com')
  ON CONFLICT (email) DO NOTHING;
