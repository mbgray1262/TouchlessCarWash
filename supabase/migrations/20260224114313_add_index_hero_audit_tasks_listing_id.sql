/*
  # Add index on hero_audit_tasks(listing_id)

  The get_unaudited_hero_listings RPC uses a NOT EXISTS subquery against hero_audit_tasks.listing_id.
  Without an index this causes statement timeouts as the table grows.
*/
CREATE INDEX IF NOT EXISTS idx_hero_audit_tasks_listing_id ON hero_audit_tasks(listing_id);
