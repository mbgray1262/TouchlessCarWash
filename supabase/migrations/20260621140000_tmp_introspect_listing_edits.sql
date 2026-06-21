create or replace function public._dbg_le()
returns jsonb language sql security definer set search_path=public,pg_catalog as $$
  select jsonb_build_object(
    'rls_enabled', (select relrowsecurity from pg_class where relname='listing_edits' and relnamespace='public'::regnamespace),
    'policies', (select jsonb_agg(jsonb_build_object('name',policyname,'cmd',cmd,'permissive',permissive,'roles',roles,'with_check',with_check)) from pg_policies where tablename='listing_edits'),
    'anon_grants', (select jsonb_agg(privilege_type) from information_schema.role_table_grants where table_name='listing_edits' and grantee='anon')
  );
$$;
grant execute on function public._dbg_le() to anon;
