-- =====================================================================
-- DiGoP 02 ROLLBACK: removes everything Migration 02 added.
-- Intended for use soon after running 02, before anyone has used the new
-- tables. It refuses to run (and changes nothing) if:
--   * any ekiti_process_v1 route has been published or retired, or
--   * any meeting, resolution or escalation has been recorded, or
--   * any project approval already uses one of the new levels.
-- WARNING: it drops the lga_ref columns, so LGA links you set after 02
-- (including via the future admin screen) are lost.
-- It does NOT touch: legacy routes, legacy levels, thresholds, profiles,
-- or the new project statuses (02a), which cannot be removed.
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from public.approval_routes
             where rule_set = 'ekiti_process_v1' and status <> 'draft') then
    raise exception 'Routes of rule set ekiti_process_v1 are published or retired; retire them instead. Nothing was changed.';
  end if;
  if exists (select 1 from public.committee_meetings)
     or exists (select 1 from public.committee_resolutions)
     or exists (select 1 from public.approval_escalations) then
    raise exception 'Meeting, resolution or escalation records exist; aborting. Nothing was changed.';
  end if;
  if exists (select 1 from public.project_approvals pa
             join public.approval_levels l on l.id = pa.approval_level_id
             where l.code in ('LG_PRESENT','FGPC','MOLGA','GOVERNOR','CABINET')) then
    raise exception 'Project approvals already use the new levels; aborting. Nothing was changed.';
  end if;
end $$;

-- Draft routes and their stages
delete from public.route_stages
where route_id in (select id from public.approval_routes where rule_set = 'ekiti_process_v1');
delete from public.approval_routes where rule_set = 'ekiti_process_v1';

-- Publish check
drop trigger  if exists trg_validate_route_publish on public.approval_routes;
drop function if exists public.validate_route_publish();

-- Policies added on tables that existed before 02
drop policy if exists approval_routes_admin_insert on public.approval_routes;
drop policy if exists approval_routes_admin_update on public.approval_routes;
drop policy if exists approval_routes_admin_delete on public.approval_routes;
drop policy if exists route_stages_admin_write     on public.route_stages;

-- New levels
delete from public.approval_levels
where code in ('LG_PRESENT','FGPC','MOLGA','GOVERNOR','CABINET');

-- New tables (children first)
drop table if exists public.approval_escalations;
drop table if exists public.committee_resolutions;
drop table if exists public.meeting_attendance;
drop table if exists public.committee_meetings;
drop table if exists public.committee_seats;
drop table if exists public.committees;
drop table if exists public.seat_designations;

-- LGA links, then the table
alter table public.projects    drop column if exists lga_ref;
alter table public.ekiti_users drop column if exists lga_ref;
drop table if exists public.lgas;

commit;
