-- DiGoP 04 ROLLBACK: removes the lock triggers, helper, admin switch and setting.
-- Run this BEFORE rollback_03.sql if you are undoing both.
begin;
drop trigger if exists trg_guard_project_status on public.projects;
drop trigger if exists trg_guard_project_approvals on public.project_approvals;
drop function if exists public._guard_project_status();
drop function if exists public._guard_project_approvals();
drop function if exists public._digop_enforcement_on();
drop function if exists public.set_db_routing_enforcement(boolean, text);
delete from public.routing_settings where key = 'enforce_db_routing';
commit;
