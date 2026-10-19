-- =====================================================================
-- DiGoP 01c ROLLBACK: restores get_chairmen_directory() and its grants
-- exactly as captured by migration_01c (schema digop_backup).
-- =====================================================================

begin;

do $$
declare r record;
begin
  if not exists (select 1 from digop_backup.mig01c_functions) then
    raise exception 'No snapshot found in digop_backup; nothing to roll back.';
  end if;

  for r in select definition from digop_backup.mig01c_functions loop
    execute r.definition;
  end loop;

  for r in select distinct signature from digop_backup.mig01c_function_grants loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.signature);
  end loop;
  for r in select signature, grantee, privilege_type from digop_backup.mig01c_function_grants loop
    execute format('grant %s on function %s to %s',
                   r.privilege_type, r.signature,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end);
  end loop;
end $$;

commit;
