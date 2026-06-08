-- best_of_rankings had a SELECT policy scoped TO anon only. Public pages render
-- server-side as the anon role so they read fine, but logged-in admin sessions
-- (role `authenticated`) were silently returning 0 rows under RLS — which made
-- the Photo Audit "Best-Of Winners" tab show no results despite 462 trophy rows.
--
-- These rankings are already public data (shown on every listing/badge page), so
-- allowing authenticated reads is safe. Add a matching authenticated SELECT policy.
CREATE POLICY "Allow authenticated read access"
  ON best_of_rankings
  FOR SELECT
  TO authenticated
  USING (true);
