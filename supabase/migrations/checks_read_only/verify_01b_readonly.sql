-- =====================================================================
-- DiGoP 01b VERIFY  (READ-ONLY: only SELECTs). Run AFTER the migration.
-- Paste the output back to me.
-- Expected:
--   privilege   anon / PUBLIC cannot execute either function  -> false
--   privilege   authenticated / service_role can              -> true
--   function    all five: SECURITY DEFINER, config search_path=""
--   policy      approval_levels / approval_thresholds: only the
--               *_select, "Allow authenticated users to view ..." and *_write policies
--   snapshot    policies = the number of rows in preflight section "1 policy",
--               functions = 5, function grants = the number of "4 grant" rows
--               (this is the saved original state used by the rollback)
-- =====================================================================

select 'privilege' as section,
       f.sig as name,
       'anon=' || has_function_privilege('anon', f.sig, 'execute')
         || ' authenticated=' || has_function_privilege('authenticated', f.sig, 'execute')
         || ' service_role=' || has_function_privilege('service_role', f.sig, 'execute') as detail
from (values ('public.get_officials_directory()'), ('public.get_approver_auth_id(text)')) f(sig)

union all
select 'function', p.proname,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
         || '; config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('get_approver_auth_id', 'get_officials_directory',
                    'current_auth_phone', 'current_ekiti_is_admin', 'current_ekiti_role')

union all
select 'policy', tablename, policyname || ' [' || cmd || ']'
from pg_policies
where schemaname = 'public' and tablename in ('approval_levels', 'approval_thresholds')

union all
select 'snapshot', 'policies', count(*)::text from digop_backup.mig01b_policies
union all
select 'snapshot', 'functions', count(*)::text from digop_backup.mig01b_functions
union all
select 'snapshot', 'function grants', count(*)::text from digop_backup.mig01b_function_grants

order by 1, 2, 3;
