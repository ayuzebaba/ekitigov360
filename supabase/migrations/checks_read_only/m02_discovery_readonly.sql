-- =====================================================================
-- DiGoP MIGRATION 02 DISCOVERY  (READ-ONLY: only SELECTs, changes nothing)
-- Run in the Supabase SQL Editor; paste (or download) the output.
-- Purpose: read the exact shapes Migration 02 must fit, instead of guessing.
-- Result columns: section | name | detail | body
-- =====================================================================

-- 1. Enum types used by projects (exact allowed values, in order)
select '1 enum' as section, t.typname as name,
       string_agg(e.enumlabel, ', ' order by e.enumsortorder) as detail, '' as body
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typnamespace = 'public'::regnamespace
group by t.typname

union all
-- 2. Columns of the tables Migration 02 touches or references
select '2 column', c.table_name || '.' || c.column_name,
       c.data_type || case when c.udt_name <> c.data_type then ' (' || c.udt_name || ')' else '' end
         || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end,
       coalesce(c.column_default, '')
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('projects', 'project_approvals', 'approval_levels', 'approval_thresholds',
                       'approval_routes', 'route_stages', 'departments', 'audit_logs')

union all
-- 3. Triggers on those tables (anything that fires automatically)
select '3 trigger', c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  and c.relname in ('projects', 'project_approvals', 'approval_levels', 'approval_thresholds',
                    'approval_routes', 'route_stages', 'departments', 'audit_logs')

union all
-- 4. Constraints (check / foreign key / unique / primary key)
select '4 constraint', c.relname, k.conname, pg_get_constraintdef(k.oid)
from pg_constraint k
join pg_class c on c.oid = k.conrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('projects', 'project_approvals', 'departments', 'audit_logs')

union all
-- 5. How many rows are in each status today
select '5 projects by status', status::text, count(*)::text, '' from public.projects group by status
union all
select '5 approvals by status', status::text, count(*)::text, '' from public.project_approvals group by status

union all
-- 6. Departments (committee seats may refer to them): count and names
select '6 departments', name, id::text, '' from public.departments

union all
-- 7. Do any committee / meeting / LGA tables already exist?
select '7 existing table', tablename, '', ''
from pg_tables
where schemaname = 'public' and tablename ~* 'committee|meeting|resolution|lga|seat|quorum'

order by 1, 2, 3;
