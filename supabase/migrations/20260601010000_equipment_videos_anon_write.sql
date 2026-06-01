-- Allow anon writes to equipment_videos, matching every other table in this
-- project (listings, blog_posts, review_snippets, ...). The Netlify functions
-- that back the admin API run with the public anon key (the service-role key is
-- not present in that environment), so without these policies admin writes
-- (hide/show, add, reorder, delete) are silently blocked by RLS and return
-- "Cannot coerce the result to a single JSON object". The admin pages are gated
-- by AdminAuthGate; this mirrors the existing project security posture.
DROP POLICY IF EXISTS "Allow anon insert equipment videos" ON equipment_videos;
CREATE POLICY "Allow anon insert equipment videos"
  ON equipment_videos FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update equipment videos" ON equipment_videos;
CREATE POLICY "Allow anon update equipment videos"
  ON equipment_videos FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete equipment videos" ON equipment_videos;
CREATE POLICY "Allow anon delete equipment videos"
  ON equipment_videos FOR DELETE TO anon USING (true);
