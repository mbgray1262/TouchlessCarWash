create or replace function public._dbg_try_insert(p_listing uuid)
returns text language plpgsql security invoker set search_path=public as $$
declare v_role text;
begin
  v_role := current_user;
  begin
    insert into listing_edits(listing_id, issue_type, details, ip_address)
    values (p_listing, 'wrong_hours', '__dbg__ delete', '0.0.0.0');
    return 'role=' || v_role || ' :: INSERT OK';
  exception when others then
    return 'role=' || v_role || ' :: INSERT FAILED: ' || SQLERRM;
  end;
end $$;
grant execute on function public._dbg_try_insert(uuid) to anon;
