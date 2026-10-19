-- =====================================================================
-- DiGoP 03b: HOD-stage items cannot be decided by ordinary department_staff.
-- Reason: "department staff" is not the same authority as a designated Head
-- of Department, and no HOD designation exists yet. This keeps today's real
-- behaviour (nobody can approve HOD-stage items) until a designation
-- mechanism is built and agreed. Replaces decide_stage only. Safe to re-run.
-- To undo: re-run migration_03_routing_functions.sql's decide_stage block
-- (or rollback_03.sql, which drops the function entirely).
-- =====================================================================
-- 4b. Approve / reject an individual stage
create or replace function public.decide_stage(
  p_approval_id uuid, p_decision text, p_comments text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a     record;
  v_pid uuid;
  proj  public.projects;
  pa    public.project_approvals;
  lvl   public.approval_levels;
  ctx   record;
begin
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select * into a from public._digop_actor();
  if not found then raise exception 'You are not an active DiGoP user.'; end if;

  select x.project_id into v_pid from public.project_approvals x where x.id = p_approval_id;
  if not found then raise exception 'Approval not found.'; end if;

  -- lock order: project, then approval
  select * into proj from public.projects where id = v_pid for update;
  select * into pa from public.project_approvals where id = p_approval_id for update;
  if pa.status <> 'pending' then
    raise exception 'This approval has already been decided (status: %).', pa.status;
  end if;

  select * into lvl from public.approval_levels where id = pa.approval_level_id;
  select * into ctx from public._stage_context(p_approval_id);

  if lvl.stage_type = 'committee' then
    raise exception 'This stage is decided by a committee resolution, not by an individual approval.';
  end if;
  if lvl.required_role is null then
    raise exception 'This stage has no approving role configured.';
  end if;
  if lvl.required_role = 'department_staff' then
    raise exception 'This is a Head-of-Department stage. Ordinary department staff cannot decide it, and no HOD designation has been configured yet.';
  end if;
  if a.role <> lvl.required_role then
    raise exception 'This stage requires the "%" role. Your role ("%") does not match.', lvl.required_role, a.role;
  end if;
  if lvl.stage_type <> 'joint' and proj.created_by = a.auth_id then
    raise exception 'You cannot approve or reject a project you submitted yourself.';
  end if;
  if ctx.ctx_tier = 'LG' and proj.lga_ref is not null and a.lga_ref is not null
     and proj.lga_ref <> a.lga_ref then
    raise exception 'This project belongs to a different LGA than your account.';
  end if;

  return public._apply_stage_outcome(p_approval_id,
           case p_decision when 'approve' then 'approved' else 'rejected' end,
           p_comments, a.auth_id, null);
end $$;

revoke all on function public.decide_stage(uuid, text, text) from public, anon;
grant execute on function public.decide_stage(uuid, text, text) to authenticated, service_role;
