-- =====================================================================
-- DiGoP Migration 01b (REVISED): security hardening of existing objects
-- ---------------------------------------------------------------------
-- RUN ORDER: preflight_01b_readonly.sql  ->  this file  ->  verify_01b_readonly.sql
--
-- WHAT IT CHANGES (and nothing else; no tables, columns or data; the shared
-- `profiles` table is not touched):
--   A. Snapshots the REAL current policies, function definitions and function
--      grants into the private schema digop_backup (only the first time), so
--      rollback_01b.sql restores the actual previous state.
--   B. Rewrites the five SECURITY DEFINER functions with the same behaviour
--      but fully schema-qualified bodies and SET search_path = ''.
--   C. get_officials_directory() / get_approver_auth_id() now return results
--      only to an ACTIVE DiGoP user (a row in ekiti_users matching the caller's
--      verified phone) or to service_role. Signed-in users of your other apps
--      get an empty result / NULL.
--   D. Revokes EXECUTE on those two functions from PUBLIC and anon.
--      (Grants on current_ekiti_* / current_auth_phone are left as they are:
--       RLS policies call them for every role.)
--   E. Drops the six legacy admin policies on approval_levels /
--      approval_thresholds that trust profiles.role = 'admin'. Aborts the whole
--      migration if any unexpected write policy would remain.
--
-- EXPECTED IMPACT
--   * DiGoP pages: none for signed-in DiGoP users. Manage Users / Thresholds
--     (is_admin) keep working through approval_*_write + current_ekiti_is_admin().
--   * Not-logged-in callers: lose access to the two functions (intended).
--   * Other apps: no change, unless they call these two DiGoP functions or rely
--     on the dropped policies. The preflight section "5/6 consumer" lists any
--     such dependency inside the database. Search your other apps' code for
--     get_officials_directory / get_approver_auth_id to be sure.
-- SAFE TO RE-RUN. Single transaction: any failed guard rolls everything back.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Guards: refuse to run if the world is not as expected
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  if to_regprocedure('auth.role()') is null then
    raise exception 'auth.role() is not available; aborting.';
  end if;

  foreach fn in array array[
    'public.get_approver_auth_id(text)', 'public.get_officials_directory()',
    'public.current_auth_phone()', 'public.current_ekiti_is_admin()', 'public.current_ekiti_role()'
  ] loop
    if to_regprocedure(fn) is null then
      raise exception 'Function % not found; aborting.', fn;
    end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(fn)) then
      raise exception 'Function % is not SECURITY DEFINER as expected; aborting.', fn;
    end if;
  end loop;

  -- The replacement admin policies must exist, be permissive, and use the DiGoP admin check.
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'approval_levels'
                   and policyname = 'approval_levels_write' and cmd = 'ALL' and permissive = 'PERMISSIVE'
                   and qual ~ 'current_ekiti_is_admin' and with_check ~ 'current_ekiti_is_admin') then
    raise exception 'approval_levels_write is missing or not as expected; aborting.';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'approval_thresholds'
                   and policyname = 'approval_thresholds_write' and cmd = 'ALL' and permissive = 'PERMISSIVE'
                   and qual ~ 'current_ekiti_is_admin' and with_check ~ 'current_ekiti_is_admin') then
    raise exception 'approval_thresholds_write is missing or not as expected; aborting.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- A. Snapshot the real current state (first run only)
-- ---------------------------------------------------------------------
create schema if not exists digop_backup;
revoke all on schema digop_backup from public, anon, authenticated;

create table if not exists digop_backup.mig01b_policies (
  schemaname text, tablename text, policyname text, permissive text,
  roles text, cmd text, qual text, with_check text
);
create table if not exists digop_backup.mig01b_functions (
  signature text primary key, definition text, owner text, config text
);
create table if not exists digop_backup.mig01b_function_grants (
  signature text, grantee text, privilege_type text
);
alter table digop_backup.mig01b_policies        enable row level security;
alter table digop_backup.mig01b_functions       enable row level security;
alter table digop_backup.mig01b_function_grants enable row level security;

do $$
begin
  if exists (select 1 from digop_backup.mig01b_functions) then
    raise notice 'Snapshot already exists; keeping the original.';
    return;
  end if;

  insert into digop_backup.mig01b_policies
  select schemaname, tablename, policyname, permissive,
         array_to_string(roles, ','), cmd, qual, with_check
  from pg_policies
  where schemaname = 'public' and tablename in ('approval_levels', 'approval_thresholds');

  insert into digop_backup.mig01b_functions
  select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proconfig, ';'), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.oid in (to_regprocedure('public.get_approver_auth_id(text)'),
                  to_regprocedure('public.get_officials_directory()'),
                  to_regprocedure('public.current_auth_phone()'),
                  to_regprocedure('public.current_ekiti_is_admin()'),
                  to_regprocedure('public.current_ekiti_role()'));

  insert into digop_backup.mig01b_function_grants
  select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid in (to_regprocedure('public.get_approver_auth_id(text)'),
                  to_regprocedure('public.get_officials_directory()'),
                  to_regprocedure('public.current_auth_phone()'),
                  to_regprocedure('public.current_ekiti_is_admin()'),
                  to_regprocedure('public.current_ekiti_role()'));
end $$;

-- ---------------------------------------------------------------------
-- B. Helper functions: same behaviour, schema-qualified, search_path = ''
-- ---------------------------------------------------------------------
create or replace function public.current_auth_phone()
returns text language sql stable security definer set search_path = ''
as $$
  select phone from auth.users where id = auth.uid();
$$;

create or replace function public.current_ekiti_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(is_admin, false) from public.ekiti_users
  where phone = '+' || public.current_auth_phone()
  limit 1;
$$;

create or replace function public.current_ekiti_role()
returns text language sql stable security definer set search_path = ''
as $$
  select role from public.ekiti_users
  where phone = '+' || (select phone from auth.users where id = auth.uid())
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- C. The two exposed lookups: same results, but only for DiGoP callers
-- ---------------------------------------------------------------------
create or replace function public.get_approver_auth_id(required_role text)
returns uuid language sql stable security definer set search_path = ''
as $$
  select au.id
  from public.ekiti_users eu
  join auth.users au on au.phone = trim(leading '+' from eu.phone)
  where eu.role = required_role
    and ( auth.role() = 'service_role'
          or exists (select 1 from public.ekiti_users me
                     where me.is_active = true
                       and me.phone = '+' || public.current_auth_phone()) )
  limit 1;
$$;

create or replace function public.get_officials_directory()
returns table(auth_id uuid, username text, full_name text, role text, lga text, department_name text)
language sql stable security definer set search_path = ''
as $$
  select au.id as auth_id,
         eu.username,
         eu.full_name,
         eu.role,
         eu.lga,
         d.name as department_name
  from public.ekiti_users eu
  join auth.users au on au.phone = trim(leading '+' from eu.phone)
  left join public.departments d on d.id = eu.department_id
  where eu.is_active = true
    and ( auth.role() = 'service_role'
          or exists (select 1 from public.ekiti_users me
                     where me.is_active = true
                       and me.phone = '+' || public.current_auth_phone()) );
$$;

-- ---------------------------------------------------------------------
-- D. Close the two lookups to PUBLIC / anon
-- ---------------------------------------------------------------------
revoke execute on function public.get_approver_auth_id(text) from public, anon;
revoke execute on function public.get_officials_directory()  from public, anon;
grant  execute on function public.get_approver_auth_id(text) to authenticated, service_role;
grant  execute on function public.get_officials_directory()  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- E. Remove legacy admin policies that trust the shared profiles table
-- ---------------------------------------------------------------------
drop policy if exists "Allow admins to delete approval_levels"      on public.approval_levels;
drop policy if exists "Allow admins to insert approval_levels"      on public.approval_levels;
drop policy if exists "Allow admins to update approval_levels"      on public.approval_levels;
drop policy if exists "Allow admins to delete approval_thresholds"  on public.approval_thresholds;
drop policy if exists "Allow admins to insert approval_thresholds"  on public.approval_thresholds;
drop policy if exists "Allow admins to update approval_thresholds"  on public.approval_thresholds;

-- Post-condition: the ONLY non-SELECT policies left on these tables are the DiGoP admin ones.
do $$
declare bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('approval_levels', 'approval_thresholds')
    and cmd <> 'SELECT'
    and policyname not in ('approval_levels_write', 'approval_thresholds_write');
  if bad is not null then
    raise exception 'Unexpected write policies remain: %. Aborting; nothing was changed.', bad;
  end if;
end $$;

commit;
