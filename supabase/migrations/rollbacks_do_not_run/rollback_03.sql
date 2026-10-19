-- =====================================================================
-- DiGoP 03 ROLLBACK: removes the routing functions and settings added by
-- Migration 03 and restores the original approval-status rule.
-- Refuses to run (and changes nothing) if:
--   * the active rule set is not 'legacy' (switch back first), or
--   * any approval already has status 'returned', or
--   * any approval is linked to a committee resolution.
-- It leaves in place: rows the functions created (approvals, audit_logs,
-- meetings, resolutions, escalations), and everything from 01 / 02 / 02a.
-- =====================================================================

begin;

do $$
begin
  if coalesce((select value from public.routing_settings where key = 'active_rule_set'), 'legacy') <> 'legacy' then
    raise exception 'The active rule set is not legacy; switch it back first. Nothing was changed.';
  end if;
  if exists (select 1 from public.project_approvals where status = 'returned') then
    raise exception 'Approvals with status returned exist; aborting. Nothing was changed.';
  end if;
  if exists (select 1 from public.project_approvals where resolution_id is not null) then
    raise exception 'Approvals linked to committee resolutions exist; aborting. Nothing was changed.';
  end if;
end $$;

drop function if exists public.start_project_routing(uuid, text, text);
drop function if exists public.decide_stage(uuid, text, text);
drop function if exists public.open_committee_meeting(uuid, timestamptz, text, uuid[]);
drop function if exists public.record_committee_resolution(uuid, uuid, text, text, integer, integer, integer, text);
drop function if exists public.escalate_to_cabinet(uuid, text);
drop function if exists public.set_active_rule_set(text, text);
drop function if exists public.preview_route(numeric, uuid);
drop function if exists public._apply_stage_outcome(uuid, text, text, uuid, uuid);
drop function if exists public._create_stage_approval(uuid, uuid, integer);
drop function if exists public._stage_context(uuid);
drop function if exists public._select_route(text, text, numeric);
drop function if exists public._pick_approver(text, uuid);
drop function if exists public._digop_audit(uuid, text, text, uuid, text, text, jsonb);
drop function if exists public._digop_actor();

alter table public.project_approvals drop column if exists resolution_id;

alter table public.project_approvals drop constraint if exists project_approvals_status_check;
alter table public.project_approvals add constraint project_approvals_status_check
  check (status = any (array['pending'::text,'approved'::text,'rejected'::text,'escalated'::text]));

drop table if exists public.routing_settings;

commit;
