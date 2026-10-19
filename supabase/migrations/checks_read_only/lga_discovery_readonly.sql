-- =====================================================================
-- DiGoP LGA DISCOVERY  (READ-ONLY: only SELECTs, changes nothing)
-- Run in the Supabase SQL Editor and paste the output back to me.
-- Purpose: find out where "LGA" really lives in the database, because
-- the project form fills its LGA dropdown from get_chairmen_directory().
-- Result columns: section | name | detail | body
-- =====================================================================

-- 1. The function behind the LGA dropdown: definition, owner, settings
select '1 function' as section, p.proname as name,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
         || '; owner=' || pg_get_userbyid(p.proowner)
         || '; config=' || coalesce(array_to_string(p.proconfig, ';'), '-') as detail,
       pg_get_functiondef(p.oid) as body
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname = 'get_chairmen_directory'

union all
-- 2. Who may execute it
select '2 grant', p.proname,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type, ''
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.pronamespace = 'public'::regnamespace and p.proname = 'get_chairmen_directory'

union all
-- 3. What projects.lga_id is: type and any foreign key
select '3 column', c.table_name || '.' || c.column_name, c.data_type, ''
from information_schema.columns c
where c.table_schema = 'public'
  and ((c.table_name = 'projects' and c.column_name = 'lga_id')
    or (c.table_name = 'ekiti_users' and c.column_name = 'lga'))
union all
select '3 foreign key', conrelid::regclass::text, conname, pg_get_constraintdef(oid)
from pg_constraint
where contype = 'f' and conrelid = 'public.projects'::regclass
  and pg_get_constraintdef(oid) ~ 'lga_id'

union all
-- 4. Any table that looks like an LGA table
select '4 lga-like table', tablename, '', ''
from pg_tables
where schemaname = 'public' and tablename ~* 'lga|local_gov'

union all
-- 5. What values projects.lga_id actually holds (ids only, with counts)
select '5 project lga_id', coalesce(lga_id::text, '(null)'), count(*)::text || ' projects', ''
from public.projects
group by lga_id

union all
-- 6. The LGA names written on user accounts, by role
select '6 user lga text', coalesce(lga, '(null)'), role || ' x ' || count(*)::text, ''
from public.ekiti_users
group by lga, role

union all
-- 7. Anything else in the database that depends on the function
select '7 consumer function', p.proname, 'mentions get_chairmen_directory', ''
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosrc ~* 'get_chairmen_directory'
  and p.proname <> 'get_chairmen_directory'
union all
select '7 consumer policy', tablename, policyname, ''
from pg_policies
where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* 'get_chairmen_directory'

order by 1, 2, 3;
