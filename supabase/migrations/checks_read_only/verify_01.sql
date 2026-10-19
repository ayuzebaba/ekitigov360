-- DiGoP Migration 01 verification. Run AFTER migration_01, in the Supabase SQL Editor.
-- Paste the results back to me.
--
-- Expected results:
--   routes = 4, stages = 7
--   400000     -> HOD
--   5000000    -> HOD
--   10000000   -> Director
--   50000000   -> Director -> Chairman
--   150000000  -> Director -> Chairman -> State

with amounts(a) as (
  values (400000::numeric), (5000000), (10000000), (50000000), (150000000)
),
picked as (
  select a,
         (select r.id from public.approval_routes r
           where r.rule_set = 'legacy' and r.status = 'published'
             and (r.max_amount is null or r.max_amount >= a)
           order by r.min_amount limit 1) as rid
  from amounts
)
select 'chain' as check_name,
       a::text as amount,
       string_agg(l.name, ' -> ' order by s.seq) as result
from picked p
join public.route_stages s on s.route_id = p.rid
join public.approval_levels l on l.id = s.level_id
group by a
union all
select 'count', 'legacy routes', count(*)::text from public.approval_routes where rule_set = 'legacy'
union all
select 'count', 'route stages', count(*)::text from public.route_stages
order by check_name, amount;
