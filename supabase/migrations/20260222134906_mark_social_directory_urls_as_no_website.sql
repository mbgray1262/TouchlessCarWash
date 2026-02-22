/*
  # Mark social/directory URLs as no_website

  ## Summary
  Listings whose "website" field points to a social network or directory (Facebook,
  Instagram, Twitter/X, TikTok, YouTube, Google, Google Maps, Yelp, YellowPages,
  MapQuest, TripAdvisor, LinkedIn, Waze, Foursquare) can never be scraped by Firecrawl
  to determine touchless status. Retrying them wastes API credits.

  ## Changes
  - Sets `crawl_status = 'no_website'` on every listing that:
    - Has `is_touchless IS NULL` (not yet classified)
    - Has a website URL matching any known-unscrapeble domain
  - Does NOT touch listings already classified (is_touchless IS NOT NULL)
  - Does NOT modify the website column itself — the URL is preserved for reference

  ## Affected domains
  facebook.com, instagram.com, twitter.com, x.com, tiktok.com, youtube.com,
  google.com, maps.app.goo.gl, goo.gl/maps, yelp.com, yellowpages.com,
  mapquest.com, tripadvisor.com, linkedin.com, waze.com, foursquare.com
*/

UPDATE listings
SET crawl_status = 'no_website'
WHERE is_touchless IS NULL
  AND website IS NOT NULL
  AND website != ''
  AND (
    website ILIKE '%facebook.com%'
    OR website ILIKE '%instagram.com%'
    OR website ILIKE '%twitter.com%'
    OR website ILIKE '%.x.com%'
    OR website ILIKE '%//x.com%'
    OR website ILIKE '%tiktok.com%'
    OR website ILIKE '%youtube.com%'
    OR website ILIKE '%google.com%'
    OR website ILIKE '%maps.app.goo.gl%'
    OR website ILIKE '%goo.gl/maps%'
    OR website ILIKE '%yelp.com%'
    OR website ILIKE '%yellowpages.com%'
    OR website ILIKE '%mapquest.com%'
    OR website ILIKE '%tripadvisor.com%'
    OR website ILIKE '%linkedin.com%'
    OR website ILIKE '%waze.com%'
    OR website ILIKE '%foursquare.com%'
  );
