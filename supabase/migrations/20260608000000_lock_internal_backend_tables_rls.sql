-- Security hardening (2026-06-08): close the "RLS Disabled in Public" advisor
-- warnings on internal, backend-only tables WITHOUT any risk of breaking the
-- live site or the admin panel.
--
-- Context: the public site + admin panel talk to Postgres with the public
-- (anon) key, and the service-role key is NOT reliably present in the Netlify
-- runtime (see 20260501000000_fix_listing_events_rls.sql). So at runtime the
-- site effectively acts as `anon`. These five tables, however, are written
-- ONLY by Supabase Edge Functions / CLI scripts that use the REAL service-role
-- key (which bypasses RLS), and are never written by anon code paths:
--   prospect_queue            <- review-mine edge fn
--   classify_jobs             <- firecrawl-pipeline edge fn  (admin reads it)
--   classify_tasks            <- firecrawl-pipeline edge fn
--   chain_url_backfill_jobs   <- chain-url-backfill edge fn  (admin reads it)
--   chain_url_backfill_results<- chain-url-backfill edge fn  (admin reads it)
--
-- Therefore we can safely:
--   * ENABLE RLS  -> clears the advisor warning
--   * allow anon/authenticated SELECT -> admin status pages keep working
--   * grant NO anon INSERT/UPDATE/DELETE -> a stolen public key can no longer
--     tamper with or wipe these tables
--   * service_role keeps full access (bypasses RLS anyway; declared for clarity)
--
-- Idempotent: safe to re-run.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prospect_queue',
    'classify_jobs',
    'classify_tasks',
    'chain_url_backfill_jobs',
    'chain_url_backfill_results'
  ]
  LOOP
    -- Skip cleanly if a table doesn't exist on this environment.
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Read access for the public site / admin panel (no rows are sensitive;
    -- these are internal job/queue tables, not user data).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_anon_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);',
      t || '_anon_select', t
    );

    -- Explicit full access for service_role (edge functions / scripts).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_service_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t || '_service_all', t
    );

    -- Make sure the SELECT grant exists so the read policy is actually reachable;
    -- deliberately do NOT grant INSERT/UPDATE/DELETE to anon/authenticated.
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', t);
  END LOOP;
END $$;
