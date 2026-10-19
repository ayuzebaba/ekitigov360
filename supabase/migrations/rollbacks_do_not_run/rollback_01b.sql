-- =====================================================================
-- DiGoP 01b ROLLBACK: restores the REAL pre-migration state from the
-- snapshot that migration_01b_security_hardening.sql took (schema
-- digop_backup). Nothing here is assumed or hand-typed.
-- Restores: the five function definitions (incl. their original settings),
-- their EXECUTE grants, and any approval_levels / approval_thresholds
-- policy that has since been removed.
-- Does not delete digop_backup; drop it yourself once you are satisfied:
--   drop schema digop_backup cascade;
-- =====================================================================

begin;

do $$
declare r record;
begin
  if not exists (select 1 from digop_backup.mig01b_functions) then
    raise exception 'No snapshot found in digop_backup; nothing to roll back.';
  end if;

  -- 1. Function definitions exactly as captured
  for r in select definition from digop_backup.mig01b_functions loop
    execute r.definition;
  end loop;

  -- 2. EXECUTE grants exactly as captured
  for r in select distinct signature from digop_backup.mig01b_function_grants loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.signature);
  end loop;
  for r in select signature, grantee, privilege_type from digop_backup.mig01b_function_grants loop
    execute format('grant %s on function %s to %s',
                   r.privilege_type, r.signature,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end);
  end loop;

  -- 3. Policies that existed before and are gone now
  for r in select * from digop_backup.mig01b_policies loop
    if not exists (select 1 from pg_policies p
                   where p.schemaname = r.schemaname and p.tablename = r.tablename
                     and p.policyname = r.policyname) then
      execute format('create policy %I on %I.%I as %s for %s to %s%s%s',
                     r.policyname, r.schemaname, r.tablename,
                     lower(r.permissive), r.cmd, r.roles,
                     case when r.qual is not null then format(' using (%s)', r.qual) else '' end,
                     case when r.with_check is not null then format(' with check (%s)', r.with_check) else '' end);
    end if;
  end loop;
end $$;

commit;
