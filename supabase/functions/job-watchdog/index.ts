import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const STUCK_MS = 4 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const NUM_KICK_CHAINS = 6;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const report: Record<string, unknown>[] = [];

    // --- Photo enrich jobs ---
    const { data: photoJobs } = await supabase
      .from('photo_enrich_jobs')
      .select('id, status, total, processed')
      .eq('status', 'running');

    for (const job of photoJobs ?? []) {
      const cutoff = new Date(Date.now() - STUCK_MS).toISOString();

      const { data: stuckDoneResult } = await supabase
        .from('photo_enrich_tasks')
        .update({
          task_status: 'done',
          hero_image_found: false,
          finished_at: new Date().toISOString(),
          fallback_reason: 'Watchdog: repeated timeouts',
        })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', cutoff)
        .gte('attempt_count', MAX_ATTEMPTS)
        .select('id');

      const { data: stuckResetResult } = await supabase
        .from('photo_enrich_tasks')
        .update({ task_status: 'pending', updated_at: new Date().toISOString() })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', cutoff)
        .lt('attempt_count', MAX_ATTEMPTS)
        .select('id');

      const markedDone = stuckDoneResult?.length ?? 0;
      const reset = stuckResetResult?.length ?? 0;

      const { count: pendingCount } = await supabase
        .from('photo_enrich_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'pending');

      const { count: inProgressCount } = await supabase
        .from('photo_enrich_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress');

      const jobEntry: Record<string, unknown> = {
        type: 'photo_enrich',
        job_id: job.id,
        pending: pendingCount,
        in_progress: inProgressCount,
        marked_done: markedDone,
        reset_to_pending: reset,
      };

      // If nothing is in_progress but work remains, the job has stalled — kick it
      if ((inProgressCount ?? 0) === 0 && (pendingCount ?? 0) > 0) {
        jobEntry.action = 'KICKED — stalled';
        const kickUrl = `${supabaseUrl}/functions/v1/photo-enrich`;
        const kickHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        };
        const kickBody = JSON.stringify({ action: 'process_batch', job_id: job.id });
        await Promise.all(
          Array.from({ length: NUM_KICK_CHAINS }, (_, i) =>
            new Promise(r => setTimeout(r, i * 500)).then(() =>
              fetch(kickUrl, { method: 'POST', headers: kickHeaders, body: kickBody }).catch(() => {})
            )
          )
        );
      } else if (markedDone > 0 || reset > 0) {
        jobEntry.action = 'FIXED stuck tasks';
      } else if ((pendingCount ?? 0) === 0 && (inProgressCount ?? 0) === 0) {
        // All done — mark job complete
        await supabase
          .from('photo_enrich_jobs')
          .update({ status: 'done', finished_at: new Date().toISOString() })
          .eq('id', job.id);
        jobEntry.action = 'COMPLETED job';
      } else {
        jobEntry.action = 'healthy';
      }

      report.push(jobEntry);
    }

    // --- Gallery backfill jobs ---
    const { data: galleryJobs } = await supabase
      .from('gallery_backfill_jobs')
      .select('id, status')
      .eq('status', 'running');

    for (const job of galleryJobs ?? []) {
      const cutoff = new Date(Date.now() - STUCK_MS).toISOString();

      await supabase
        .from('gallery_backfill_tasks')
        .update({ task_status: 'pending', updated_at: new Date().toISOString() })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', cutoff);

      const { count: pendingCount } = await supabase
        .from('gallery_backfill_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'pending');

      const { count: inProgressCount } = await supabase
        .from('gallery_backfill_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress');

      const jobEntry: Record<string, unknown> = {
        type: 'gallery_backfill',
        job_id: job.id,
        pending: pendingCount,
        in_progress: inProgressCount,
      };

      if ((inProgressCount ?? 0) === 0 && (pendingCount ?? 0) > 0) {
        jobEntry.action = 'KICKED — stalled';
        const kickUrl = `${supabaseUrl}/functions/v1/gallery-backfill`;
        const kickHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        };
        await fetch(kickUrl, {
          method: 'POST',
          headers: kickHeaders,
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {});
      } else {
        jobEntry.action = 'healthy';
      }

      report.push(jobEntry);
    }

    // --- Hero audit jobs ---
    const { data: heroAuditJobs } = await supabase
      .from('hero_audit_jobs')
      .select('id, status')
      .eq('status', 'running');

    for (const job of heroAuditJobs ?? []) {
      const cutoff = new Date(Date.now() - STUCK_MS).toISOString();

      await supabase
        .from('hero_audit_tasks')
        .update({ task_status: 'pending', updated_at: new Date().toISOString() })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress')
        .is('finished_at', null)
        .lt('updated_at', cutoff);

      const { count: pendingCount } = await supabase
        .from('hero_audit_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'pending');

      const { count: inProgressCount } = await supabase
        .from('hero_audit_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
        .eq('task_status', 'in_progress');

      const jobEntry: Record<string, unknown> = {
        type: 'hero_audit',
        job_id: job.id,
        pending: pendingCount,
        in_progress: inProgressCount,
      };

      if ((inProgressCount ?? 0) === 0 && (pendingCount ?? 0) > 0) {
        jobEntry.action = 'KICKED — stalled';
        const kickUrl = `${supabaseUrl}/functions/v1/hero-audit`;
        const kickHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        };
        await fetch(kickUrl, {
          method: 'POST',
          headers: kickHeaders,
          body: JSON.stringify({ action: 'process_batch', job_id: job.id }),
        }).catch(() => {});
      } else {
        jobEntry.action = 'healthy';
      }

      report.push(jobEntry);
    }

    const checked_at = new Date().toISOString();
    return new Response(
      JSON.stringify({ checked_at, jobs_checked: report.length, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
