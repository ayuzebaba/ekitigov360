-- DiGoP 01c VERIFY (READ-ONLY). Run AFTER migration_01c and paste the output.
-- Expected: anon=false authenticated=true service_role=true;
--           SECURITY DEFINER with config search_path=""; snapshot functions=1, grants=5.
select 'privilege' as section, 'public.get_chairmen_directory()' as name,
       'anon=' || has_function_privilege('anon', 'public.get_chairmen_directory()', 'execute')
         || ' authenticated=' || has_function_privilege('authenticated', 'public.get_chairmen_directory()', 'execute')
         || ' service_role=' || has_function_privilege('service_role', 'public.get_chairmen_directory()', 'execute') as detail
union all
select 'function', p.proname,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
         || '; config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname = 'get_chairmen_directory'
union all
select 'snapshot', 'functions', count(*)::text from digop_backup.mig01c_functions
union all
select 'snapshot', 'function grants', count(*)::text from digop_backup.mig01c_function_grants
order by 1, 2, 3;
