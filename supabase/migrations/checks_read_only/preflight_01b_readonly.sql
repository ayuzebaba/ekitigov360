-- =====================================================================
-- DiGoP 01b PREFLIGHT  (READ-ONLY: only SELECTs, changes nothing)
-- Run in the Supabase SQL Editor BEFORE migration_01b. Paste the output
-- back to me and keep a copy: it is the human-readable record of the
-- state before the change. (The migration also snapshots this state
-- into a private schema so the rollback restores the REAL previous state.)
-- Result columns: section | name | detail | body
-- =====================================================================

-- 1. Complete policy definitions on the two approval-config tables
select '1 policy' as section, tablename as name,
       policyname || ' [' || permissive || '; roles=' || array_to_string(roles, ',') || '; cmd=' || cmd || ']' as detail,
       'USING: ' || coalesce(qual, '-') || E'\nWITH CHECK: ' || coalesce(with_check, '-') as body
from pg_policies
where schemaname = 'public' and tablename in ('approval_levels', 'approval_thresholds')

union all
-- 2. RLS flags on those tables
select '2 rls', c.relname,
       'rls_enabled=' || c.relrowsecurity || ' rls_forced=' || c.relforcerowsecurity, ''
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname in ('approval_levels', 'approval_thresholds')

union all
-- 3. The five functions: security mode, owner, settings, full definition
select '3 function', p.proname,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
         || '; owner=' || pg_get_userbyid(p.proowner)
         || '; config=' || coalesce(array_to_string(p.proconfig, ';'), '-'),
       pg_get_functiondef(p.oid)
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('get_approver_auth_id', 'get_officials_directory',
                    'current_auth_phone', 'current_ekiti_is_admin', 'current_ekiti_role')

union all
-- 4. EXECUTE grants on the five functions
select '4 grant', p.proname,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type, ''
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('get_approver_auth_id', 'get_officials_directory',
                    'current_auth_phone', 'current_ekiti_is_admin', 'current_ekiti_role')

union all
-- 5. CONSUMERS: policies on ANY table (any app) that call these functions
select '5 consumer policy', tablename, policyname,
       coalesce(qual, '') || ' ' || coalesce(with_check, '')
from pg_policies
where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* 'current_ekiti|current_auth_phone|get_approver_auth_id|get_officials_directory'
  and not (schemaname = 'public' and tablename in ('approval_levels', 'approval_thresholds'))

union all
-- 6. CONSUMERS: other functions and views that mention them
select '6 consumer function', p.proname, 'calls one of the five', ''
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosrc ~* 'current_ekiti|current_auth_phone|get_approver_auth_id|get_officials_directory'
  and p.proname not in ('get_approver_auth_id', 'get_officials_directory',
                        'current_auth_phone', 'current_ekiti_is_admin', 'current_ekiti_role')
union all
select '6 consumer view', viewname, 'mentions one of the five', ''
from pg_views
where schemaname = 'public'
  and definition ~* 'current_ekiti|current_auth_phone|get_approver_auth_id|get_officials_directory'

union all
-- 7. Data checks the functions rely on (phone is the identity bridge)
select '7 data check', 'duplicate phones in ekiti_users', count(*)::text, 'expect 0'
from (select phone from public.ekiti_users group by phone having count(*) > 1) d
union all
select '7 data check', 'ekiti_users phones not starting with +', count(*)::text, 'expect 0'
from public.ekiti_users where phone not like '+%'
union all
select '7 data check', 'active ekiti_users with no matching auth user',
       count(*)::text, 'informational: these people have never completed OTP login'
from public.ekiti_users eu
where eu.is_active = true
  and not exists (select 1 from auth.users au where au.phone = trim(leading '+' from eu.phone))
union all
select '7 data check', 'auth.role() available', (to_regprocedure('auth.role()') is not null)::text, 'expect true'

order by 1, 2, 3;
