-- AI audit results per listing. One row per listing (latest audit).
-- Populated by supabase/functions/ai-audit-listing via Gemini 2.5 Flash.

CREATE TABLE IF NOT EXISTS ai_audits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
  verdict         TEXT,  -- TOUCHLESS_CONFIRMED / TOUCHLESS_PROBABLE / UNCERTAIN / NOT_TOUCHLESS
  confidence      INTEGER,  -- 0-100
  reasoning       TEXT,
  photo_analysis  TEXT,
  flags           JSONB,
  recommendation  TEXT,  -- keep / hold / revert
  raw_response    JSONB,
  audited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audits_listing ON ai_audits(listing_id);
CREATE INDEX IF NOT EXISTS idx_ai_audits_verdict ON ai_audits(verdict);
CREATE INDEX IF NOT EXISTS idx_ai_audits_recommendation ON ai_audits(recommendation);

ALTER TABLE ai_audits ENABLE ROW LEVEL SECURITY;

-- Anon can read (for admin/audit UIs); writes only via service role or
-- via whitelisted sources through the edge function.
DROP POLICY IF EXISTS "anon_read_ai_audits" ON ai_audits;
CREATE POLICY "anon_read_ai_audits" ON ai_audits FOR SELECT TO anon USING (true);

-- Allow anon insert/update so the local driver can upsert via anon key
-- (the edge function uses service role, but local scripts use anon).
DROP POLICY IF EXISTS "anon_insert_ai_audits" ON ai_audits;
CREATE POLICY "anon_insert_ai_audits" ON ai_audits FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ai_audits" ON ai_audits;
CREATE POLICY "anon_update_ai_audits" ON ai_audits FOR UPDATE TO anon USING (true) WITH CHECK (true);
