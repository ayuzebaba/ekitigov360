-- =====================================================================
-- DiGoP Migration 04: lock direct writes to approval state (SWITCHED OFF).
--
-- What it adds:
--   * a setting  routing_settings.enforce_db_routing  = 'off'   (default)
--   * triggers on projects and project_approvals. While the setting is 'on',
--     a browser/app call (role authenticated or anon) can no longer:
--        - create or edit project_approvals rows, or delete them
--        - move a project into / out of an approval-controlled status
--          (pending_approval, approved-by-approval, rejected, escalated,
--           awaiting_routing, returned, withdrawn) or insert a project
--           with a status other than 'planning'
--     Allowed even when on: edits that keep status unchanged, and the normal
--     life of an approved project (approved -> ongoing -> stalled -> completed).
--   * The Migration 03 functions still work (they run as the database owner),
--     and so do the SQL editor / service_role (your emergency path).
--   * admin function  set_db_routing_enforcement(on_off, reason)  (logged)
--
-- AS DELIVERED NOTHING CHANGES: the setting is 'off', so the old app works
-- exactly as today. Turn it 'on' only together with the app switch.
-- Safe to re-run. Undo: rollback_04.sql
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.routing_settings') is null then
    raise exception 'Migration 03 is missing (routing_settings). Run it first.';
  end if;
  if to_regprocedure('public._digop_actor()') is null then
    raise exception 'Migration 03 is missing (_digop_actor). Run it first.';
  end if;
end $$;

insert into public.routing_settings (key, value) values ('enforce_db_routing', 'off')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- helper: is enforcement switched on? (just reads the setting; harmless to expose)
-- The triggers combine it with current_user: inside the Migration 03 functions
-- current_user is the database owner, for direct app calls it is
-- 'authenticated' / 'anon'.
-- ---------------------------------------------------------------------
create or replace function public._digop_enforcement_on()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.value from public.routing_settings s
                   where s.key = 'enforce_db_routing'), 'off') = 'on';
$$;
revoke all on function public._digop_enforcement_on() from public;
grant execute on function public._digop_enforcement_on() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- project_approvals: no direct writes while enforced
-- ---------------------------------------------------------------------
create or replace function public._guard_project_approvals()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and public._digop_enforcement_on() then
    raise exception 'Approvals can only be changed through the approval workflow functions.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_guard_project_approvals on public.project_approvals;
create trigger trg_guard_project_approvals
  before insert or update or delete on public.project_approvals
  for each row execute function public._guard_project_approvals();

-- ---------------------------------------------------------------------
-- projects: no direct moves into/out of approval-controlled statuses
-- ---------------------------------------------------------------------
create or replace function public._guard_project_status()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_old text;
  v_new text;
  life  text[] := array['ongoing','stalled','completed'];
begin
  if not (current_user in ('authenticated', 'anon') and public._digop_enforcement_on()) then
    return new;
  end if;

  v_new := new.status::text;

  if tg_op = 'INSERT' then
    if v_new <> 'planning' then
      raise exception 'New projects must start as planning; approval status is set by the workflow.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  v_old := old.status::text;
  if v_new is not distinct from v_old then
    return new;                                   -- status not changed
  end if;

  -- allowed life-cycle moves after approval
  if v_new = any (life) and (v_old = 'approved' or v_old = any (life)) then
    return new;
  end if;

  raise exception 'Project status "%" -> "%" can only be changed through the approval workflow.', v_old, v_new
    using errcode = '42501';
end $$;

drop trigger if exists trg_guard_project_status on public.projects;
create trigger trg_guard_project_status
  before insert or update on public.projects
  for each row execute function public._guard_project_status();

revoke all on function public._guard_project_approvals() from public, anon, authenticated;
revoke all on function public._guard_project_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- admin switch (reason required, logged)
-- ---------------------------------------------------------------------
create or replace function public.set_db_routing_enforcement(p_on boolean, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a     record;
  v_old text;
  v_new text := case when p_on then 'on' else 'off' end;
begin
  select * into a from public._digop_actor();
  if not found or not a.is_admin then
    raise exception 'Only a DiGoP admin can change this setting.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;

  select s.value into v_old from public.routing_settings s where s.key = 'enforce_db_routing';
  insert into public.routing_settings (key, value, updated_by, updated_at)
  values ('enforce_db_routing', v_new, a.user_id, now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  perform public._digop_audit(a.auth_id, 'SET_DB_ROUTING_ENFORCEMENT', 'routing_settings',
    gen_random_uuid(), v_old, v_new, jsonb_build_object('reason', p_reason, 'previous', v_old));

  return jsonb_build_object('ok', true, 'previous', v_old, 'enforce_db_routing', v_new);
end $$;

revoke all on function public.set_db_routing_enforcement(boolean, text) from public, anon;
grant execute on function public.set_db_routing_enforcement(boolean, text) to authenticated, service_role;

commit;
