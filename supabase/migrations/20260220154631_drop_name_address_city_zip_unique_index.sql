/*
  # Drop composite unique index on listings

  The listings_name_address_city_zip_unique functional index on (lower(name), lower(address), lower(city), lower(zip))
  cannot be used as a Supabase upsert conflict target and causes bulk imports to fail when records already exist.
  Deduplication is now handled via the slug (name+address+city+state) and google_place_id unique constraints.
*/

DROP INDEX IF EXISTS listings_name_address_city_zip_unique;
