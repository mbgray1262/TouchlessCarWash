-- Let an equipment video be optionally tagged to a specific equipment model
-- (e.g. PDQ LaserWash 360 Plus). Tagged videos surface on the matching
-- /equipment/<brand>/<model> page in a "See the <Model> in Action" section.
-- Both columns are nullable: a video with no tag simply stays in the rotating
-- listing-page pool only. Matching the admin API field names brand_slug /
-- model_slug, which line up with EQUIPMENT_BRAND_DATA / EQUIPMENT_MODEL_DATA
-- slugs in lib/equipment-data.ts.
ALTER TABLE equipment_videos
  ADD COLUMN IF NOT EXISTS brand_slug text,
  ADD COLUMN IF NOT EXISTS model_slug text;

-- Equipment pages look videos up by (brand_slug, model_slug) and only show
-- active ones, so index that combination for the active rows.
CREATE INDEX IF NOT EXISTS idx_equipment_videos_model
  ON equipment_videos (brand_slug, model_slug)
  WHERE is_active;

-- Pre-tag the current pool with best-guess matches so the admin starts from a
-- reviewed state rather than blank. Keyed by youtube_id (stable). Videos with
-- no matching model in our catalog (Belanger Saber, Istobal Tracer / Flex 5,
-- Karcher Opti 8000) are intentionally left untagged.
UPDATE equipment_videos SET brand_slug = 'pdq',       model_slug = 'laserwash-360'      WHERE youtube_id = 'mmywI9EGqpQ';
UPDATE equipment_videos SET brand_slug = 'pdq',       model_slug = 'laserwash-360-plus' WHERE youtube_id = 'FCz_OadRY6Q';
UPDATE equipment_videos SET brand_slug = 'pdq',       model_slug = 'laserwash-360-plus' WHERE youtube_id = 'cG5t6VVdyQg';
UPDATE equipment_videos SET brand_slug = 'pdq',       model_slug = 'laserwash-4000'     WHERE youtube_id = 'mUHfiqQjnHw';
UPDATE equipment_videos SET brand_slug = 'washworld', model_slug = 'razor-edge'         WHERE youtube_id = 'J_4IQYwGezg';
UPDATE equipment_videos SET brand_slug = 'washworld', model_slug = 'razor'              WHERE youtube_id = 'QzVYH0V__U0';
UPDATE equipment_videos SET brand_slug = 'washworld', model_slug = 'razor'              WHERE youtube_id = 'hFErX1rrzKU';
UPDATE equipment_videos SET brand_slug = 'petit',     model_slug = 'accutrac-360i'      WHERE youtube_id = '-j6lESHqSgk';
UPDATE equipment_videos SET brand_slug = 'ds',        model_slug = 'iq-2-0-touch-free'  WHERE youtube_id = 'n6hRKPQ5pyw';
UPDATE equipment_videos SET brand_slug = 'ds',        model_slug = 'iq-2-0-touch-free'  WHERE youtube_id = 'fmpdhdLNGYU';
UPDATE equipment_videos SET brand_slug = 'belanger',  model_slug = 'kondor'             WHERE youtube_id = '_JTSYNKKjeQ';
UPDATE equipment_videos SET brand_slug = 'oasis',     model_slug = 'typhoon'            WHERE youtube_id = '6DBUobCyiDE';
