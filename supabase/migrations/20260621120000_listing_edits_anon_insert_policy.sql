-- Fix: the "Suggest a correction" form (/api/suggest-edit) silently failed in
-- production for 3+ months. The route runs on the ANON key there (the
-- service-role key is intentionally not in Netlify runtime), and listing_edits
-- had RLS enabled with NO anon INSERT policy, so every visitor submission hit
-- error 42501 and 500'd → effectively zero real submissions reached the queue.
-- Same class of bug as the video_events anon-insert fix.
--
-- Grant public INSERT only. Anon still cannot SELECT / UPDATE / DELETE — the
-- admin reviews suggestions via the service role. A WITH CHECK constrains the
-- shape (valid issue_type, bounded text) as light abuse mitigation; the API
-- layer already validates + rate-limits by IP.

alter table public.listing_edits enable row level security;

drop policy if exists "anon submit listing edits" on public.listing_edits;
create policy "anon submit listing edits"
  on public.listing_edits
  for insert
  to anon, authenticated
  with check (
    issue_type in (
      'permanently_closed','not_touchless','wrong_address',
      'wrong_phone','wrong_hours','wrong_website','other'
    )
    and (details is null or char_length(details) <= 2000)
    and (email is null or char_length(email) <= 200)
  );
