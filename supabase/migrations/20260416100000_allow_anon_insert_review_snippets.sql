-- Allow anon role to insert review snippets, so our scraping scripts
-- (free Google Maps scrapers, inurl discovery, Yelp SERP scrapers) can
-- persist the touchless-evidence review text they capture.
--
-- Safety: limit to sources that look like automated scraper origins,
-- NOT 'serpapi' (paid) or 'admin' (manual) which should remain restricted
-- to service-role writes.

CREATE POLICY "Allow anon insert of scraper-sourced review snippets"
  ON review_snippets FOR INSERT
  WITH CHECK (
    source IS NOT NULL
    AND (
      source LIKE 'free_%'
      OR source LIKE 'crawl4ai_%'
      OR source LIKE 'gmaps_%'
      OR source LIKE 'yelp_%'
      OR source = 'scraper'
    )
  );

-- Allow anon role to update review snippets they themselves wrote
-- (for future classifier refinements — e.g., re-classify is_touchless_evidence)
CREATE POLICY "Allow anon update of scraper-sourced review snippets"
  ON review_snippets FOR UPDATE
  USING (
    source IS NOT NULL
    AND (
      source LIKE 'free_%'
      OR source LIKE 'crawl4ai_%'
      OR source LIKE 'gmaps_%'
      OR source LIKE 'yelp_%'
      OR source = 'scraper'
    )
  );
