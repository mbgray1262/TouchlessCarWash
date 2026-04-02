-- Allow deletes on listing_verifications (used by admin panel only)
create policy "Anon delete" on listing_verifications
  for delete using (true);
