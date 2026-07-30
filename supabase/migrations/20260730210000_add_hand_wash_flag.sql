-- Add hand-wash wash-type support (mirrors the is_self_service infrastructure).
--
--   is_hand_wash          – true if the wash is a HAND car wash (staff wash the
--                           car by hand). Distinct from touchless / self-serve;
--                           a listing can be hand-wash-only or also offer others.
--   hand_wash_reviewed_at – stamped when an admin confirms a hand wash in the
--                           Hand-Wash photo-audit view. Independent of touchless
--                           (photo_audited_at) and self-serve (self_service_reviewed_at),
--                           so reviewing one wash type never hides a mixed listing
--                           from the others' queues.
--   hand_wash_source      – provenance: 'name' (the wash's name self-identifies as a
--                           hand wash — the reliable first-pass signal, since Google
--                           has no hand-wash category and descriptions rarely mention
--                           it), 'admin_review' (human confirmed), later 'reviews' /
--                           'website' / 'vision' mining passes, or 'not_hand_wash'
--                           (human rejected).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_hand_wash boolean DEFAULT NULL;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hand_wash_reviewed_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hand_wash_source text;

-- Seed candidates from the NAME signal (518 listings as of 2026-07-30). These are
-- auto-tagged (source='name') and left UNREVIEWED (hand_wash_reviewed_at IS NULL)
-- and UNAPPROVED, so they surface in the Hand-Wash review queue for the admin to
-- confirm + curate photos — exactly like the self-serve flow. Nothing goes public
-- until it's reviewed and approved, one at a time.
UPDATE listings
SET is_hand_wash = true, hand_wash_source = 'name'
WHERE is_hand_wash IS NULL
  AND (
    name ILIKE '%hand car wash%'
    OR name ILIKE '%hand wash%'
    OR name ILIKE '%handwash%'
    OR name ILIKE '%hand-wash%'
  );
