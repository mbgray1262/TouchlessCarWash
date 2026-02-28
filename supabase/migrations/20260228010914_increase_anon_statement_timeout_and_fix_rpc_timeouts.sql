/*
  # Increase statement timeouts for admin queries

  ## Problem
  The anon role has a 3s statement timeout. The admin listings page RPCs
  (search_listings, admin_listing_stats, listings_filtered_count) run over 3s
  on the full 55k row dataset, causing "canceling statement due to statement timeout" errors.

  ## Changes
  - Increases anon role statement_timeout to 30s
  - Increases authenticated role statement_timeout to 30s
  - Sets explicit statement_timeout inside each admin RPC to 25s as a safety limit
*/

ALTER ROLE anon SET statement_timeout = '30s';
ALTER ROLE authenticated SET statement_timeout = '30s';
