-- =====================================================================
-- DiGoP 03 VERIFY  (READ-ONLY: only SELECTs). Run AFTER migration 03.
-- Paste the output back to me.
-- Expected:
--   function   14 rows: 7 public (anon=false authenticated=true) and
--              7 internal starting with "_" (anon=false authenticated=false);
--              all SECURITY DEFINER with config search_path=""
--   settings   active_rule_set = legacy
--   column     project_approvals.resolution_id exists
--   constraint status check includes 'returned'
--   rls        routing_settings rls_enabled=true
--   legacy     same five chains as before (routes untouched)
-- Result columns: section | name | detail
-- =====================================================================

select 'function' as section, p.proname as name,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
         || '; config=' || coalesce(array_to_string(p.proconfig, ';'), '-')
         || '; anon=' || has_function_privilege('anon', p.oid, 'execute')
         || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute') as detail
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('start_project_routing','decide_stage','open_committee_meeting',
                    'record_committee_resolution','escalate_to_cabinet','set_active_rule_set',
                    'preview_route','_digop_actor','_digop_audit','_pick_approver','_select_route',
                    '_stage_context','_create_stage_approval','_apply_stage_outcome')

union all
select 'settings', key, value from public.routing_settings

union all
select 'column', 'project_approvals.resolution_id', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'project_approvals' and column_name = 'resolution_id'

union all
select 'constraint', conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.project_approvals'::regclass and conname = 'project_approvals_status_check'

union all
select 'rls', c.relname, 'rls_enabled=' || c.relrowsecurity
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relname = 'routing_settings'

union all
select 'legacy chain', a::text,
       (select string_agg(l.name, ' -> ' order by s.seq)
        from public.route_stages s join public.approval_levels l on l.id = s.level_id
        where s.route_id = (select r.id from public.approval_routes r
                            where r.rule_set = 'legacy' and r.status = 'published'
                              and (r.max_amount is null or r.max_amount >= a)
                            order by r.min_amount limit 1))
from (values (400000::numeric), (5000000), (10000000), (50000000), (150000000)) v(a)

order by 1, 2, 3;
