-- Disable every active pg_cron job so nothing runs overnight without explicit approval.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job WHERE active LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'unscheduled % (%)', r.jobname, r.jobid;
  END LOOP;
END$$;
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
