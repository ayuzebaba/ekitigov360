-- DiGoP 04 VERIFY (READ-ONLY). Paste the output back to me.
-- Expected: setting enforce_db_routing = off; 2 triggers enabled;
-- set_db_routing_enforcement executable by authenticated, not anon;
-- _digop_enforcement_on is executable (it only reads the setting); trigger functions are not security definer.
select 'setting' as section, key as name, value as detail from public.routing_settings where key = 'enforce_db_routing'
union all
select 'trigger', t.tgname, 'on ' || t.tgrelid::regclass || '; enabled=' || (t.tgenabled <> 'D')
from pg_trigger t where t.tgname in ('trg_guard_project_status','trg_guard_project_approvals') and not t.tgisinternal
union all
select 'function', p.proname,
       'security_definer=' || p.prosecdef || '; anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('set_db_routing_enforcement','_digop_enforcement_on','_guard_project_status','_guard_project_approvals')
order by 1, 2;
