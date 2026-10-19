-- =====================================================================
-- DiGoP Migration 01c: lock down get_chairmen_directory()
-- ---------------------------------------------------------------------
-- RUN ORDER: AFTER 01b.  Then verify_01c_readonly.sql.
--
-- WHAT IT CHANGES (this one function only; no tables, no data; the shared
-- `profiles` table is not touched):
--   A. Snapshots the real current definition and grants into digop_backup
--      (first run only) so rollback_01c.sql restores the actual old state.
--   B. Rewrites the function with the SAME columns (id, full_name, lga) and
--      the SAME rows, but schema-qualified and SET search_path = ''.
--   C. Returns rows only to an ACTIVE DiGoP user (a row in ekiti_users that
--      matches the caller's verified phone) or to service_role.
--   D. Revokes EXECUTE from PUBLIC and anon.
--
-- EXPECTED IMPACT
--   * Project form LGA dropdown: unchanged for any signed-in DiGoP user.
--   * Logged-out visitors: can no longer list chairmen (intended).
--   * Signed-in users of OTHER apps: get an empty list (intended).
--   * Anything of yours that calls get_chairmen_directory while logged out
--     will get "permission denied". Search your code for the name first.
-- SAFE TO RE-RUN. Single transaction.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.get_chairmen_directory()') is null then
    raise exception 'public.get_chairmen_directory() not found; aborting.';
  end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.get_chairmen_directory()')) then
    raise exception 'get_chairmen_directory is not SECURITY DEFINER as expected; aborting.';
  end if;
  if to_regprocedure('auth.role()') is null then
    raise exception 'auth.role() is not available; aborting.';
  end if;
  if to_regprocedure('public.current_auth_phone()') is null then
    raise exception 'public.current_auth_phone() not found (run 01b first); aborting.';
  end if;
end $$;

-- A. Snapshot (first run only)
create schema if not exists digop_backup;
revoke all on schema digop_backup from public, anon, authenticated;

create table if not exists digop_backup.mig01c_functions (
  signature text primary key, definition text, owner text, config text
);
create table if not exists digop_backup.mig01c_function_grants (
  signature text, grantee text, privilege_type text
);
alter table digop_backup.mig01c_functions       enable row level security;
alter table digop_backup.mig01c_function_grants enable row level security;

do $$
begin
  if exists (select 1 from digop_backup.mig01c_functions) then
    raise notice 'Snapshot already exists; keeping the original.';
    return;
  end if;

  insert into digop_backup.mig01c_functions
  select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proconfig, ';'), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure('public.get_chairmen_directory()');

  insert into digop_backup.mig01c_function_grants
  select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = to_regprocedure('public.get_chairmen_directory()');
end $$;

-- B + C. Same output shape, DiGoP callers only
create or replace function public.get_chairmen_directory()
returns table(id uuid, full_name text, lga text)
language sql stable security definer set search_path = ''
as $$
  select eu.id, eu.username as full_name, eu.lga
  from public.ekiti_users eu
  where eu.role = 'executive_chairman'
    and ( auth.role() = 'service_role'
          or exists (select 1 from public.ekiti_users me
                     where me.is_active = true
                       and me.phone = '+' || public.current_auth_phone()) );
$$;

-- D. Close to PUBLIC / anon
revoke execute on function public.get_chairmen_directory() from public, anon;
grant  execute on function public.get_chairmen_directory() to authenticated, service_role;

commit;
