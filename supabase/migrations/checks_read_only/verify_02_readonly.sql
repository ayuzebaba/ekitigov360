-- =====================================================================
-- DiGoP 02 VERIFY  (READ-ONLY: only SELECTs). Run AFTER 02a and 02.
-- Paste the output back to me.
-- Expected:
--   counts       lgas=16, seat_designations=12, committees=1, committee_seats=2,
--                levels total=9 (4 legacy + 5 new), thresholds=4,
--                legacy routes=4 (all published), ekiti_process_v1 routes=4 (all draft)
--   draft stages LG up to=2, LG above=4, State up to=1, State above=2
--   legacy chain unchanged (same five results as verify_01)
--   rls          rls_enabled=true for all 8 new tables
--   status enum  10 values ending awaiting_routing, returned, withdrawn
-- Result columns: section | name | detail
-- =====================================================================

select 'count' as section, 'lgas' as name, count(*)::text as detail from public.lgas
union all select 'count', 'seat_designations', count(*)::text from public.seat_designations
union all select 'count', 'committees', count(*)::text from public.committees
union all select 'count', 'committee_seats', count(*)::text from public.committee_seats
union all select 'count', 'approval_levels (total)', count(*)::text from public.approval_levels
union all select 'count', 'approval_thresholds', count(*)::text from public.approval_thresholds
union all select 'count', 'legacy routes published',
       count(*)::text from public.approval_routes where rule_set = 'legacy' and status = 'published'
union all select 'count', 'ekiti_process_v1 routes draft',
       count(*)::text from public.approval_routes where rule_set = 'ekiti_process_v1' and status = 'draft'

union all
select 'draft stages', r.name,
       string_agg(l.code, ' -> ' order by s.seq)
from public.approval_routes r
join public.route_stages s on s.route_id = r.id
join public.approval_levels l on l.id = s.level_id
where r.rule_set = 'ekiti_process_v1'
group by r.name

union all
select 'legacy chain', a::text,
       (select string_agg(l.name, ' -> ' order by s.seq)
        from public.route_stages s join public.approval_levels l on l.id = s.level_id
        where s.route_id = (select r.id from public.approval_routes r
                            where r.rule_set = 'legacy' and r.status = 'published'
                              and (r.max_amount is null or r.max_amount >= a)
                            order by r.min_amount limit 1))
from (values (400000::numeric), (5000000), (10000000), (50000000), (150000000)) v(a)

union all
select 'lga links', 'ekiti_users with lga_ref', count(*)::text from public.ekiti_users where lga_ref is not null
union all
select 'lga links', 'projects with lga_ref', count(*)::text from public.projects where lga_ref is not null

union all
select 'rls', c.relname, 'rls_enabled=' || c.relrowsecurity
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('lgas','seat_designations','committees','committee_seats','committee_meetings',
                    'meeting_attendance','committee_resolutions','approval_escalations')

union all
select 'privilege', t, 'anon_select=' || has_table_privilege('anon', 'public.' || t, 'select')
from unnest(array['lgas','committees','committee_seats','committee_resolutions']) t

union all
select 'status enum', 'project_status',
       string_agg(e.enumlabel, ', ' order by e.enumsortorder)
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'project_status' and t.typnamespace = 'public'::regnamespace

order by 1, 2, 3;
