-- =====================================================================
-- DiGoP Migration 03: controlled routing functions (server-side workflow)
-- ---------------------------------------------------------------------
-- RUN ORDER: after 01, 02a, 02. Single transaction, safe to re-run.
--
-- WHAT IT ADDS (the live app does not call any of it yet, so nothing
-- changes for users until the app is switched over later):
--   * routing_settings: which rule set is active ('legacy' to start).
--   * start_project_routing(project, [tier override, reason])
--   * decide_stage(approval, 'approve'|'reject', comments)
--   * open_committee_meeting(...) / record_committee_resolution(...)
--   * escalate_to_cabinet(project, reason)       -- logged, Governor only
--   * set_active_rule_set(rule_set, reason)      -- admin only, logged
--   * preview_route(amount, lga)                 -- what the form shows
--   * small internal helpers (not callable by the app)
--   * project_approvals.resolution_id, and 'returned' added to the
--     allowed approval statuses.
--
-- WHY: the browser currently decides who may approve and writes the steps
-- one by one. These functions do each action in ONE database transaction:
-- the caller is identified from the login (not from the browser), the rows
-- are locked, the same approval cannot be decided twice, and every action
-- writes to audit_logs.
--
-- UNDER THE 'legacy' RULE SET the chains are exactly today's:
--   <=5M HOD | <=20M Director | <=100M Director>Chairman | >100M +State
--
-- BEHAVIOUR DIFFERENCES vs the browser code (all deliberate):
--   1. An approval can only be decided while it is 'pending' (the browser
--      code could approve the same row twice and create duplicate stages).
--   2. The approving role comes from the stage (approval_levels.required_role).
--      Today the browser only lets four roles act, so HOD-stage items
--      (projects up to 5M) can never be approved by anyone. With these
--      functions a department_staff user who did NOT create the project can
--      approve an HOD stage. Decide whether you want that before switching.
--   3. If two people hold a role, the approver pick is deterministic
--      (oldest account first, same LGA first for LG routes) instead of
--      arbitrary. A missing approver still does not block routing.
--   4. Escalation exists only as Governor -> Cabinet with a mandatory
--      reason; the old browser "Escalate" (which fails today because the
--      status 'escalated' does not exist) is not reproduced.
--   5. Committee stages are decided only by a Recorder entering a
--      resolution; joint stages (project presentation) may be completed
--      by the presenter even if they created the project.
--
-- NOT IN THIS MIGRATION: locking direct writes to project/approval status
-- (done only after the app is switched), the app changes, admin screens.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.committee_resolutions') is null or to_regclass('public.approval_escalations') is null then
    raise exception 'Run Migration 02 first; aborting.';
  end if;
  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'project_status' and t.typnamespace = 'public'::regnamespace
        and e.enumlabel in ('awaiting_routing','returned','rejected','approved','pending_approval')) < 5 then
    raise exception 'project_status is missing values; run Migration 02a first; aborting.';
  end if;
  if to_regprocedure('public.current_auth_phone()') is null
     or to_regprocedure('public.current_ekiti_is_admin()') is null then
    raise exception 'Helper functions missing; aborting.';
  end if;
  if not exists (select 1 from public.approval_levels where code = 'CABINET')
     or not exists (select 1 from public.approval_levels where code = 'GOVERNOR') then
    raise exception 'New approval levels missing (Migration 02); aborting.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Settings: which rule set is active
-- ---------------------------------------------------------------------
create table if not exists public.routing_settings (
  key        text primary key,
  value      text        not null,
  updated_by uuid references public.ekiti_users(id),
  updated_at timestamptz not null default now()
);
insert into public.routing_settings (key, value) values ('active_rule_set', 'legacy')
on conflict (key) do nothing;

alter table public.routing_settings enable row level security;
revoke all on public.routing_settings from anon;
grant select on public.routing_settings to authenticated;
grant all on public.routing_settings to service_role;
drop policy if exists routing_settings_member_read on public.routing_settings;
create policy routing_settings_member_read on public.routing_settings
  for select to authenticated using (public.current_ekiti_role() is not null);
-- no write policy: changed only through set_active_rule_set()

-- ---------------------------------------------------------------------
-- 2. project_approvals: link to a committee resolution; allow 'returned'
-- ---------------------------------------------------------------------
alter table public.project_approvals
  add column if not exists resolution_id uuid references public.committee_resolutions(id);

do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'project_approvals_status_check'
               and conrelid = 'public.project_approvals'::regclass
               and pg_get_constraintdef(oid) not like '%returned%') then
    alter table public.project_approvals drop constraint project_approvals_status_check;
    alter table public.project_approvals add constraint project_approvals_status_check
      check (status = any (array['pending'::text,'approved'::text,'rejected'::text,'escalated'::text,'returned'::text]));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Internal helpers (not callable by the app)
-- ---------------------------------------------------------------------
create or replace function public._digop_actor()
returns table(user_id uuid, auth_id uuid, role text, lga_ref uuid, is_admin boolean)
language sql stable security definer set search_path = ''
as $$
  select eu.id, auth.uid(), eu.role, eu.lga_ref, coalesce(eu.is_admin, false)
  from public.ekiti_users eu
  where eu.is_active = true
    and eu.phone = '+' || public.current_auth_phone()
  limit 1;
$$;

create or replace function public._digop_audit(
  p_actor uuid, p_action text, p_table text, p_record uuid, p_old text, p_new text, p_meta jsonb)
returns void
language sql security definer set search_path = ''
as $$
  -- audit_logs.user_id points at the shared profiles table; store the id only if it exists there
  insert into public.audit_logs (user_id, action_type, table_name, record_id, old_value, new_value, metadata)
  values ((select p.id from public.profiles p where p.id = p_actor),
          p_action, p_table, p_record, p_old, p_new, p_meta);
$$;

create or replace function public._pick_approver(p_role text, p_lga_ref uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select au.id
  from public.ekiti_users eu
  join auth.users au on au.phone = trim(leading '+' from eu.phone)
  where eu.role = p_role
    and eu.is_active = true
    and (p_lga_ref is null or eu.lga_ref is null or eu.lga_ref = p_lga_ref)
  order by coalesce(eu.lga_ref = p_lga_ref, false) desc, eu.created_at, eu.id
  limit 1;
$$;

create or replace function public._select_route(p_rule_set text, p_tier text, p_amount numeric)
returns uuid
language sql stable security definer set search_path = ''
as $$
  -- same rule the app uses today: lowest range whose maximum covers the amount
  select r.id
  from public.approval_routes r
  where r.status = 'published'
    and r.rule_set = p_rule_set
    and r.tier = p_tier
    and r.effective_from <= now()
    and (r.effective_to is null or r.effective_to > now())
    and (r.max_amount is null or r.max_amount >= coalesce(p_amount, 0))
  order by r.min_amount
  limit 1;
$$;

create or replace function public._stage_context(p_approval_id uuid)
returns table(ctx_project_id uuid, ctx_route_id uuid, ctx_seq integer, ctx_tier text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  pa  public.project_approvals;
  amt numeric;
  rid uuid;
  s   integer;
begin
  select * into pa from public.project_approvals where id = p_approval_id;
  if not found then return; end if;
  rid := pa.route_id;
  s   := pa.stage_seq;
  if rid is null then
    -- approval created by the old browser code: resolve its route by amount under the legacy rule set
    select coalesce(p.budget_amount, 0) into amt from public.projects p where p.id = pa.project_id;
    rid := public._select_route('legacy', 'legacy', amt);
    if rid is not null then
      select rs.seq into s from public.route_stages rs
      where rs.route_id = rid and rs.level_id = pa.approval_level_id;
    end if;
  end if;
  return query select pa.project_id, rid, s, (select r.tier from public.approval_routes r where r.id = rid);
end $$;

create or replace function public._create_stage_approval(p_project_id uuid, p_route_id uuid, p_seq integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.approval_routes;
  s public.route_stages;
  l public.approval_levels;
  v_lga uuid;
  v_approver uuid;
  v_id uuid;
begin
  select * into r from public.approval_routes where id = p_route_id;
  select * into s from public.route_stages where route_id = p_route_id and seq = p_seq;
  if s.id is null then raise exception 'Route stage % not found.', p_seq; end if;
  select * into l from public.approval_levels where id = s.level_id;
  select p.lga_ref into v_lga from public.projects p where p.id = p_project_id;

  if l.required_role is not null then
    v_approver := public._pick_approver(l.required_role, case when r.tier = 'LG' then v_lga end);
  end if;

  insert into public.project_approvals
    (project_id, approval_level_id, approver_id, status, route_id, route_version, stage_seq)
  values (p_project_id, l.id, v_approver, 'pending', r.id, r.version, s.seq)
  returning id into v_id;

  return jsonb_build_object('approval_id', v_id, 'level_code', l.code,
                            'stage_type', l.stage_type, 'approver_resolved', v_approver is not null);
end $$;

-- Applies a decision to a pending approval. Callers have ALREADY locked the
-- rows and checked permission.
create or replace function public._apply_stage_outcome(
  p_approval_id uuid, p_outcome text, p_comments text, p_actor_auth uuid, p_resolution_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pa      public.project_approvals;
  ctx     record;
  nxt     public.route_stages;
  created jsonb;
  v_code  text;
  v_next  text;
  v_final boolean := false;
  v_row   public.project_approvals;
begin
  select * into pa from public.project_approvals where id = p_approval_id;
  select * into ctx from public._stage_context(p_approval_id);
  select l.code into v_code from public.approval_levels l where l.id = pa.approval_level_id;

  if p_outcome = 'approved' then
    if ctx.ctx_seq is not null and ctx.ctx_route_id is not null then
      select * into nxt from public.route_stages rs
      where rs.route_id = ctx.ctx_route_id and rs.seq > ctx.ctx_seq
      order by rs.seq limit 1;
    end if;

    if nxt.id is not null then
      created := public._create_stage_approval(pa.project_id, ctx.ctx_route_id, nxt.seq);
      v_next := created->>'level_code';
      perform public._digop_audit(p_actor_auth, 'ADVANCE_APPROVAL_STAGE', 'projects', pa.project_id, null,
        jsonb_build_object('nextLevel', v_next, 'approver_resolved', created->'approver_resolved')::text,
        jsonb_build_object('action', 'ADVANCE_APPROVAL_STAGE', 'nextLevel', v_next,
                           'approverResolved', created->'approver_resolved'));
    else
      update public.projects set status = 'approved' where id = pa.project_id;
      v_final := true;
    end if;
  elsif p_outcome = 'rejected' then
    update public.projects set status = 'rejected' where id = pa.project_id;
  elsif p_outcome = 'returned' then
    update public.projects set status = 'returned' where id = pa.project_id;
  else
    raise exception 'Unknown outcome %.', p_outcome;
  end if;

  update public.project_approvals
  set status        = p_outcome,
      comments      = p_comments,
      approved_at   = now(),
      route_id      = coalesce(route_id, ctx.ctx_route_id),
      route_version = coalesce(route_version, (select r.version from public.approval_routes r where r.id = ctx.ctx_route_id)),
      stage_seq     = coalesce(stage_seq, ctx.ctx_seq),
      resolution_id = p_resolution_id
  where id = p_approval_id
  returning * into v_row;

  perform public._digop_audit(p_actor_auth,
    case p_outcome when 'approved' then 'APPROVE' when 'rejected' then 'REJECT' else 'RETURN' end,
    'project_approvals', p_approval_id, null, to_jsonb(v_row)::text,
    jsonb_build_object('action', upper(p_outcome), 'comments', p_comments, 'project_id', pa.project_id,
                       'currentLevel', v_code, 'nextLevel', v_next, 'resolution_id', p_resolution_id));

  return jsonb_build_object('ok', true, 'approval_id', p_approval_id, 'project_id', pa.project_id,
                            'outcome', p_outcome, 'current_stage', v_code, 'next_stage', v_next,
                            'project_final', v_final);
end $$;

-- ---------------------------------------------------------------------
-- 4. Public functions
-- ---------------------------------------------------------------------

-- 4a. Start (or restart) routing for a project
create or replace function public.start_project_routing(
  p_project_id uuid, p_tier_override text default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a        record;
  proj     public.projects;
  v_rule   text;
  v_tier   text;
  v_route  uuid;
  v_first  integer;
  created  jsonb;
  v_pending uuid;
  v_name   text;
begin
  select * into a from public._digop_actor();
  if not found then raise exception 'You are not an active DiGoP user.'; end if;

  select * into proj from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;

  if not (proj.created_by = a.auth_id or a.is_admin) then
    raise exception 'Only the project creator or an admin can route this project.';
  end if;

  -- idempotent: already waiting for a decision
  select pa.id into v_pending from public.project_approvals pa
  where pa.project_id = p_project_id and pa.status = 'pending' limit 1;
  if v_pending is not null then
    return jsonb_build_object('ok', true, 'already_routed', true, 'approval_id', v_pending);
  end if;

  v_rule := coalesce((select s.value from public.routing_settings s where s.key = 'active_rule_set'), 'legacy');

  if v_rule = 'legacy' then
    v_tier := 'legacy';
  elsif p_tier_override is not null then
    if not a.is_admin then raise exception 'Only an admin can choose the routing tier.'; end if;
    if p_tier_override not in ('LG','STATE') then raise exception 'Tier must be LG or STATE.'; end if;
    if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required to choose the routing tier.'; end if;
    v_tier := p_tier_override;
    perform public._digop_audit(a.auth_id, 'ROUTING_TIER_OVERRIDE', 'projects', p_project_id, null, v_tier,
      jsonb_build_object('reason', p_reason, 'tier', v_tier));
  elsif proj.lga_ref is not null then
    v_tier := 'LG';
  else
    update public.projects set status = 'awaiting_routing' where id = p_project_id;
    perform public._digop_audit(a.auth_id, 'ROUTING_HELD', 'projects', p_project_id, null, 'awaiting_routing',
      jsonb_build_object('reason', 'No LGA on the project, so the routing tier is unknown'));
    return jsonb_build_object('ok', true, 'held', true,
                              'message', 'Project is on hold until its routing is clarified (no LGA set).');
  end if;

  v_route := public._select_route(v_rule, v_tier, proj.budget_amount);
  if v_route is null then
    raise exception 'No published approval route covers this amount (rule set %, tier %).', v_rule, v_tier;
  end if;

  select min(rs.seq) into v_first from public.route_stages rs where rs.route_id = v_route;
  created := public._create_stage_approval(p_project_id, v_route, v_first);

  update public.projects set status = 'pending_approval' where id = p_project_id;

  select r.name into v_name from public.approval_routes r where r.id = v_route;
  perform public._digop_audit(a.auth_id, 'ROUTE_APPROVAL', 'projects', p_project_id, null,
    jsonb_build_object('approvalLevel', created->>'level_code', 'route', v_name)::text,
    jsonb_build_object('action', 'ROUTE_APPROVAL', 'budgetAmount', proj.budget_amount,
                       'approvalLevel', created->>'level_code', 'rule_set', v_rule, 'route', v_name,
                       'approverResolved', created->'approver_resolved'));

  return jsonb_build_object('ok', true, 'approval_id', created->>'approval_id',
                            'stage', created->>'level_code', 'route', v_name, 'rule_set', v_rule,
                            'approver_resolved', created->'approver_resolved');
end $$;

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

-- 4c. Committee meeting (Recorder only)
create or replace function public.open_committee_meeting(
  p_committee_id uuid, p_held_at timestamptz, p_venue text, p_present_seat_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a        record;
  com      public.committees;
  v_ids    uuid[] := coalesce(p_present_seat_ids, '{}'::uuid[]);
  v_bad    integer;
  v_n      integer;
  v_met    boolean;
  v_id     uuid;
begin
  select * into a from public._digop_actor();
  if not found then raise exception 'You are not an active DiGoP user.'; end if;

  select * into com from public.committees where id = p_committee_id and is_active;
  if not found then raise exception 'Committee not found.'; end if;

  if not exists (select 1 from public.committee_seats s
                 where s.committee_id = com.id and s.holder_user_id = a.user_id
                   and s.can_record and s.is_active) then
    raise exception 'Only this committee''s Recorder can open a meeting.';
  end if;

  select count(*) into v_bad from unnest(v_ids) sid
  where not exists (select 1 from public.committee_seats s
                    where s.id = sid and s.committee_id = com.id and s.is_active);
  if v_bad > 0 then raise exception 'Some attendees are not seats of this committee.'; end if;

  select count(*) into v_n from public.committee_seats s
  where s.committee_id = com.id and s.is_active and s.is_voting and s.id = any(v_ids);

  v_met := case when com.quorum_min is null then null else v_n >= com.quorum_min end;

  insert into public.committee_meetings
    (committee_id, held_at, venue, quorum_min_snapshot, quorum_status_snapshot,
     attendee_count, quorum_met, recorded_by)
  values (com.id, coalesce(p_held_at, now()), p_venue, com.quorum_min, com.quorum_status,
          v_n, v_met, a.user_id)
  returning id into v_id;

  insert into public.meeting_attendance (meeting_id, seat_id, present)
  select v_id, s.id, s.id = any(v_ids)
  from public.committee_seats s where s.committee_id = com.id and s.is_active;

  perform public._digop_audit(a.auth_id, 'COMMITTEE_MEETING_OPENED', 'committee_meetings', v_id, null, null,
    jsonb_build_object('committee_id', com.id, 'attendee_count', v_n, 'quorum_min', com.quorum_min,
                       'quorum_status', com.quorum_status, 'quorum_met', v_met));

  return jsonb_build_object('ok', true, 'meeting_id', v_id, 'attendee_count', v_n,
                            'quorum_min', com.quorum_min, 'quorum_status', com.quorum_status,
                            'quorum_met', v_met);
end $$;

-- 4d. Record a committee resolution for a pending committee stage (Recorder only)
create or replace function public.record_committee_resolution(
  p_meeting_id uuid, p_approval_id uuid, p_outcome text, p_decision_method text,
  p_votes_for integer, p_votes_against integer, p_abstentions integer, p_notes text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a      record;
  mtg    public.committee_meetings;
  com    public.committees;
  v_pid  uuid;
  proj   public.projects;
  pa     public.project_approvals;
  lvl    public.approval_levels;
  v_prov boolean;
  v_res  uuid;
  res    jsonb;
begin
  if p_outcome not in ('approved','rejected','returned','deferred') then
    raise exception 'Outcome must be approved, rejected, returned or deferred.';
  end if;
  if p_decision_method not in ('consensus','majority') then
    raise exception 'Decision method must be consensus or majority.';
  end if;

  select * into a from public._digop_actor();
  if not found then raise exception 'You are not an active DiGoP user.'; end if;

  select * into mtg from public.committee_meetings where id = p_meeting_id for update;
  if not found then raise exception 'Meeting not found.'; end if;
  if mtg.status <> 'open' then raise exception 'This meeting is closed.'; end if;
  select * into com from public.committees where id = mtg.committee_id;

  if not exists (select 1 from public.committee_seats s
                 where s.committee_id = com.id and s.holder_user_id = a.user_id
                   and s.can_record and s.is_active) then
    raise exception 'Only this committee''s Recorder can record a resolution.';
  end if;

  select x.project_id into v_pid from public.project_approvals x where x.id = p_approval_id;
  if not found then raise exception 'Approval not found.'; end if;
  select * into proj from public.projects where id = v_pid for update;
  select * into pa from public.project_approvals where id = p_approval_id for update;
  if pa.status <> 'pending' then
    raise exception 'This approval has already been decided (status: %).', pa.status;
  end if;
  select * into lvl from public.approval_levels where id = pa.approval_level_id;

  if lvl.stage_type <> 'committee' then
    raise exception 'This stage is not a committee stage.';
  end if;
  if not ( (lvl.code = 'FGPC' and com.kind = 'FGPC' and proj.lga_ref is not null and com.lga_ref = proj.lga_ref)
        or (lvl.code = 'CABINET' and com.kind = 'CABINET') ) then
    raise exception 'This committee cannot decide this stage (check the project''s LGA and the committee).';
  end if;

  if mtg.quorum_met is false then
    raise exception 'Quorum not met (% present, % required); no resolution can be recorded.',
      mtg.attendee_count, mtg.quorum_min_snapshot;
  end if;

  if p_decision_method = 'majority' then
    if p_votes_for is null or p_votes_against is null then
      raise exception 'Votes for and against are required for a majority decision.';
    end if;
    if p_outcome = 'approved' and not (p_votes_for > p_votes_against) then
      raise exception 'An approval by majority needs more votes for than against.';
    end if;
    if p_outcome = 'rejected' and p_votes_for > p_votes_against then
      raise exception 'A rejection by majority cannot have more votes for than against.';
    end if;
  end if;

  -- provisional unless the quorum rule is confirmed AND was met
  v_prov := not (mtg.quorum_status_snapshot = 'confirmed' and mtg.quorum_met is true);

  insert into public.committee_resolutions
    (meeting_id, project_id, outcome, decision_method, votes_for, votes_against, abstentions,
     notes, is_provisional, recorded_by)
  values (p_meeting_id, v_pid, p_outcome, p_decision_method, p_votes_for, p_votes_against,
          p_abstentions, p_notes, v_prov, a.user_id)
  returning id into v_res;

  if p_outcome = 'deferred' then
    perform public._digop_audit(a.auth_id, 'COMMITTEE_RESOLUTION', 'committee_resolutions', v_res, null, p_outcome,
      jsonb_build_object('project_id', v_pid, 'meeting_id', p_meeting_id, 'provisional', v_prov));
    return jsonb_build_object('ok', true, 'resolution_id', v_res, 'outcome', 'deferred',
                              'provisional', v_prov, 'approval_still_pending', true);
  end if;

  res := public._apply_stage_outcome(p_approval_id, p_outcome, p_notes, a.auth_id, v_res);
  perform public._digop_audit(a.auth_id, 'COMMITTEE_RESOLUTION', 'committee_resolutions', v_res, null, p_outcome,
    jsonb_build_object('project_id', v_pid, 'meeting_id', p_meeting_id, 'provisional', v_prov,
                       'method', p_decision_method));
  return res || jsonb_build_object('resolution_id', v_res, 'provisional', v_prov);
end $$;

-- 4e. Manual escalation: Governor -> State Cabinet (reason mandatory, logged)
create or replace function public.escalate_to_cabinet(p_project_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a     record;
  proj  public.projects;
  v_pa  public.project_approvals;
  cab   public.approval_levels;
  v_new uuid;
begin
  select * into a from public._digop_actor();
  if not found then raise exception 'You are not an active DiGoP user.'; end if;
  if a.role <> 'governor' then
    raise exception 'Only the Governor can escalate a project to Cabinet.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to escalate to Cabinet.';
  end if;

  select * into proj from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;

  select pa.* into v_pa
  from public.project_approvals pa
  join public.approval_levels l on l.id = pa.approval_level_id
  where pa.project_id = p_project_id and pa.status = 'pending' and l.code = 'GOVERNOR'
  order by pa.created_at desc limit 1
  for update of pa;
  if not found then raise exception 'This project is not currently waiting for the Governor.'; end if;

  select * into cab from public.approval_levels where code = 'CABINET';

  update public.project_approvals
  set status = 'escalated', comments = p_reason, approved_at = now()
  where id = v_pa.id;

  insert into public.project_approvals
    (project_id, approval_level_id, approver_id, status, route_id, route_version, stage_seq)
  values (p_project_id, cab.id, null, 'pending', v_pa.route_id, v_pa.route_version, null)
  returning id into v_new;

  insert into public.approval_escalations (project_id, from_level_id, to_level_id, reason, escalated_by)
  values (p_project_id, v_pa.approval_level_id, cab.id, btrim(p_reason), a.user_id);

  perform public._digop_audit(a.auth_id, 'ESCALATE_TO_CABINET', 'projects', p_project_id, null, 'CABINET',
    jsonb_build_object('reason', p_reason, 'from_approval_id', v_pa.id, 'cabinet_approval_id', v_new));

  return jsonb_build_object('ok', true, 'cabinet_approval_id', v_new);
end $$;

-- 4f. Switch the active rule set (admin only, reason required, logged)
create or replace function public.set_active_rule_set(p_rule_set text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a     record;
  v_old text;
begin
  select * into a from public._digop_actor();
  if not found or not a.is_admin then raise exception 'Only a DiGoP admin can change the active rule set.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required.'; end if;
  if p_rule_set is null or btrim(p_rule_set) = '' then raise exception 'Rule set is required.'; end if;
  if p_rule_set <> 'legacy' and not exists
     (select 1 from public.approval_routes r where r.rule_set = p_rule_set and r.status = 'published') then
    raise exception 'Rule set "%" has no published routes.', p_rule_set;
  end if;

  select s.value into v_old from public.routing_settings s where s.key = 'active_rule_set';
  insert into public.routing_settings (key, value, updated_by, updated_at)
  values ('active_rule_set', p_rule_set, a.user_id, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  perform public._digop_audit(a.auth_id, 'SET_ACTIVE_RULE_SET', 'routing_settings',
    gen_random_uuid(), v_old, p_rule_set, jsonb_build_object('reason', p_reason, 'previous', v_old));

  return jsonb_build_object('ok', true, 'previous', v_old, 'active', p_rule_set);
end $$;

-- 4g. What chain will this project follow? (for the project form preview)
create or replace function public.preview_route(p_amount numeric, p_lga_ref uuid default null)
returns table(seq integer, code text, display_name text, stage_type text,
              required_role text, is_final boolean, rule_status text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  a       record;
  v_rule  text;
  v_tier  text;
  v_route uuid;
begin
  select * into a from public._digop_actor();
  if not found then return; end if;

  v_rule := coalesce((select s.value from public.routing_settings s where s.key = 'active_rule_set'), 'legacy');
  v_tier := case when v_rule = 'legacy' then 'legacy' when p_lga_ref is not null then 'LG' else null end;
  if v_tier is null then return; end if;

  v_route := public._select_route(v_rule, v_tier, p_amount);
  if v_route is null then return; end if;

  return query
    select s.seq, l.code, coalesce(l.display_name, l.name), s.stage_type, l.required_role, s.is_final, r.rule_status
    from public.route_stages s
    join public.approval_levels l on l.id = s.level_id
    join public.approval_routes r on r.id = s.route_id
    where s.route_id = v_route
    order by s.seq;
end $$;

-- ---------------------------------------------------------------------
-- 5. Who may call what
-- ---------------------------------------------------------------------
revoke all on function public._digop_actor()                                   from public, anon, authenticated;
revoke all on function public._digop_audit(uuid, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public._pick_approver(text, uuid)                        from public, anon, authenticated;
revoke all on function public._select_route(text, text, numeric)                from public, anon, authenticated;
revoke all on function public._stage_context(uuid)                              from public, anon, authenticated;
revoke all on function public._create_stage_approval(uuid, uuid, integer)       from public, anon, authenticated;
revoke all on function public._apply_stage_outcome(uuid, text, text, uuid, uuid) from public, anon, authenticated;

revoke all on function public.start_project_routing(uuid, text, text)           from public, anon;
revoke all on function public.decide_stage(uuid, text, text)                    from public, anon;
revoke all on function public.open_committee_meeting(uuid, timestamptz, text, uuid[]) from public, anon;
revoke all on function public.record_committee_resolution(uuid, uuid, text, text, integer, integer, integer, text) from public, anon;
revoke all on function public.escalate_to_cabinet(uuid, text)                   from public, anon;
revoke all on function public.set_active_rule_set(text, text)                   from public, anon;
revoke all on function public.preview_route(numeric, uuid)                      from public, anon;

grant execute on function public.start_project_routing(uuid, text, text)           to authenticated, service_role;
grant execute on function public.decide_stage(uuid, text, text)                    to authenticated, service_role;
grant execute on function public.open_committee_meeting(uuid, timestamptz, text, uuid[]) to authenticated, service_role;
grant execute on function public.record_committee_resolution(uuid, uuid, text, text, integer, integer, integer, text) to authenticated, service_role;
grant execute on function public.escalate_to_cabinet(uuid, text)                   to authenticated, service_role;
grant execute on function public.set_active_rule_set(text, text)                   to authenticated, service_role;
grant execute on function public.preview_route(numeric, uuid)                      to authenticated, service_role;

commit;
