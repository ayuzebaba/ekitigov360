-- =====================================================================
-- DiGoP Migration 01: additive extensions + legacy route backfill
-- ---------------------------------------------------------------------
-- WHAT IT DOES
--   * Adds descriptive/config columns to approval_levels, approval_thresholds
--     and project_approvals (nothing dropped, renamed or overwritten).
--   * Creates approval_routes + route_stages (immutable once published).
--   * Backfills 4 "legacy" routes that reproduce TODAY's chains exactly
--     (HOD / Director / Director->Chairman / Director->Chairman->State).
-- WHAT IT DOES NOT DO
--   * It does not change application behaviour. The app does not read any
--     of the new columns/tables yet.
--   * It does not add any new approval levels, committees, Governor stage
--     or the 500K / 1M provisional values (those come in later migrations).
-- SAFE TO RE-RUN: yes (idempotent). Runs as a single transaction.
-- ROLLBACK: see the commented block at the bottom.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. approval_levels: config columns
-- ---------------------------------------------------------------------
alter table public.approval_levels
  add column if not exists code          text,
  add column if not exists display_name  text,
  add column if not exists tier          text not null default 'legacy',
  add column if not exists stage_type    text not null default 'individual',
  add column if not exists required_role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'approval_levels_stage_type_chk') then
    alter table public.approval_levels
      add constraint approval_levels_stage_type_chk
      check (stage_type in ('individual','joint','committee','review_forward'));
  end if;
end $$;

-- Backfill from the values currently hardcoded in approvalService.js
-- (LEVEL_ORDER / getRoleForLevel). Only fills rows not yet filled.
update public.approval_levels
set code          = upper(name),
    display_name  = coalesce(display_name, name),
    required_role = case name
                      when 'HOD'      then 'department_staff'
                      when 'Director' then 'lg_legislative'
                      when 'Chairman' then 'executive_chairman'
                      when 'State'    then 'mda_oversight'
                    end
where code is null;

create unique index if not exists approval_levels_code_uq
  on public.approval_levels (code);

-- ---------------------------------------------------------------------
-- 2. approval_thresholds: rule set, status, effective dates
-- ---------------------------------------------------------------------
alter table public.approval_thresholds
  add column if not exists rule_set       text        not null default 'legacy',
  add column if not exists status         text        not null default 'prototype',
  add column if not exists effective_from timestamptz not null default now(),
  add column if not exists effective_to   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'approval_thresholds_status_chk') then
    alter table public.approval_thresholds
      add constraint approval_thresholds_status_chk
      check (status in ('confirmed','provisional','prototype','demo'));
  end if;
end $$;

-- Existing rows: effective from when they were originally created.
update public.approval_thresholds
set effective_from = created_at at time zone 'UTC'
where rule_set = 'legacy' and created_at is not null;

-- ---------------------------------------------------------------------
-- 3. approval_routes + route_stages
-- ---------------------------------------------------------------------
create table if not exists public.approval_routes (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  tier           text        not null check (tier in ('legacy','LG','STATE')),
  rule_set       text        not null default 'legacy',
  min_amount     numeric     not null default 0,
  max_amount     numeric,                       -- NULL = no upper limit
  version        integer     not null default 1,
  status         text        not null default 'draft'
                             check (status in ('draft','published','retired')),
  rule_status    text        not null default 'prototype'
                             check (rule_status in ('confirmed','provisional','prototype','demo')),
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (rule_set, tier, name, version)
);

create table if not exists public.route_stages (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid    not null references public.approval_routes(id) on delete restrict,
  seq        integer not null,
  level_id   uuid    not null references public.approval_levels(id),
  stage_type text    not null default 'individual'
                     check (stage_type in ('individual','joint','committee','review_forward')),
  is_final   boolean not null default false,
  unique (route_id, seq)
);

-- Link approvals to the route/version they were routed under.
alter table public.project_approvals
  add column if not exists route_id      uuid,
  add column if not exists route_version integer,
  add column if not exists stage_seq     integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_approvals_route_fk') then
    alter table public.project_approvals
      add constraint project_approvals_route_fk
      foreign key (route_id) references public.approval_routes(id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Immutability: a published route (and its stages) cannot be edited.
--    Changes must create a new version. A published route may only be
--    moved to 'retired'.
-- ---------------------------------------------------------------------
create or replace function public.guard_published_route()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('published','retired') then
      raise exception 'Published or retired routes cannot be deleted. Retire it and create a new version.';
    end if;
    return old;
  end if;

  if old.status = 'retired' then
    raise exception 'Retired routes are read-only.';
  end if;

  if old.status = 'published' then
    if (new.name, new.tier, new.rule_set, new.min_amount, new.max_amount, new.version, new.rule_status)
       is distinct from
       (old.name, old.tier, old.rule_set, old.min_amount, old.max_amount, old.version, old.rule_status) then
      raise exception 'Published route definitions are immutable. Create a new version instead.';
    end if;
    if new.status not in ('published','retired') then
      raise exception 'A published route can only be moved to retired.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_published_route on public.approval_routes;
create trigger trg_guard_published_route
  before update or delete on public.approval_routes
  for each row execute function public.guard_published_route();

create or replace function public.guard_published_route_stage()
returns trigger language plpgsql as $$
declare st text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into st from public.approval_routes where id = old.route_id;
    if st in ('published','retired') then
      raise exception 'Stages of a published route are immutable. Create a new route version.';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select status into st from public.approval_routes where id = new.route_id;
    if st in ('published','retired') then
      raise exception 'Stages of a published route are immutable. Create a new route version.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_guard_published_route_stage on public.route_stages;
create trigger trg_guard_published_route_stage
  before insert or update or delete on public.route_stages
  for each row execute function public.guard_published_route_stage();

-- ---------------------------------------------------------------------
-- 5. Backfill LEGACY routes from the current thresholds
--    (same rule the app uses today: first threshold, ordered by
--     min_amount, whose max_amount >= amount, or max_amount is NULL)
--      <= 5M    -> HOD
--      <= 20M   -> Director
--      <= 100M  -> Director -> Chairman
--      > 100M   -> Director -> Chairman -> State
-- ---------------------------------------------------------------------
do $$
declare
  r   record;
  rid uuid;
begin
  if exists (select 1 from public.approval_routes where rule_set = 'legacy') then
    raise notice 'Legacy routes already present; skipping backfill.';
    return;
  end if;

  for r in
    select t.min_amount, t.max_amount, l.name as final_name, l.level_order
    from public.approval_thresholds t
    join public.approval_levels l on l.id = t.approval_level_id
    where t.rule_set = 'legacy'
    order by t.min_amount
  loop
    insert into public.approval_routes
      (name, tier, rule_set, min_amount, max_amount, version, status, rule_status)
    values
      ('Legacy: up to ' || r.final_name, 'legacy', 'legacy',
       coalesce(r.min_amount, 0), r.max_amount, 1, 'draft', 'prototype')
    returning id into rid;

    if r.final_name = 'HOD' then
      insert into public.route_stages (route_id, seq, level_id, stage_type, is_final)
      select rid, 1, l.id, 'individual', true
      from public.approval_levels l where l.name = 'HOD';
    else
      insert into public.route_stages (route_id, seq, level_id, stage_type, is_final)
      select rid,
             (row_number() over (order by l.level_order))::int,
             l.id,
             'individual',
             (l.name = r.final_name)
      from public.approval_levels l
      where l.name in ('Director','Chairman','State')
        and l.level_order <= r.level_order;
    end if;

    update public.approval_routes set status = 'published' where id = rid;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Row level security on the NEW tables.
--    Read for signed-in users. No write policies yet, so writes are
--    blocked for the app; admin write policies are added together with
--    the admin screens (after we copy the admin check you already use).
-- ---------------------------------------------------------------------
alter table public.approval_routes enable row level security;
alter table public.route_stages    enable row level security;

drop policy if exists approval_routes_read on public.approval_routes;
create policy approval_routes_read on public.approval_routes
  for select to authenticated using (true);

drop policy if exists route_stages_read on public.route_stages;
create policy route_stages_read on public.route_stages
  for select to authenticated using (true);

commit;

-- =====================================================================
-- VERIFY (run AFTER the migration; paste the results back to me)
-- =====================================================================
-- A) Expect: routes = 4, stages = 7 (1 + 1 + 2 + 3)
-- select 'routes' as what, count(*) from public.approval_routes where rule_set = 'legacy'
-- union all
-- select 'stages', count(*) from public.route_stages;
--
-- B) Expect:
--      400000     -> HOD
--      10000000   -> Director
--      50000000   -> Director -> Chairman
--      150000000  -> Director -> Chairman -> State
-- with amounts(a) as (values (400000::numeric),(10000000),(50000000),(150000000)),
-- picked as (
--   select a, (select r.id from public.approval_routes r
--              where r.rule_set = 'legacy' and r.status = 'published'
--                and (r.max_amount is null or r.max_amount >= a)
--              order by r.min_amount limit 1) as rid
--   from amounts)
-- select a as amount, string_agg(l.name, ' -> ' order by s.seq) as chain
-- from picked p
-- join public.route_stages s on s.route_id = p.rid
-- join public.approval_levels l on l.id = s.level_id
-- group by a order by a;

-- =====================================================================
-- ROLLBACK (only if needed; removes everything this migration added)
-- =====================================================================
-- begin;
--   alter table public.project_approvals drop constraint if exists project_approvals_route_fk;
--   alter table public.project_approvals
--     drop column if exists route_id, drop column if exists route_version, drop column if exists stage_seq;
--   drop table if exists public.route_stages;
--   drop table if exists public.approval_routes;
--   drop function if exists public.guard_published_route_stage();
--   drop function if exists public.guard_published_route();
--   alter table public.approval_thresholds
--     drop constraint if exists approval_thresholds_status_chk,
--     drop column if exists rule_set, drop column if exists status,
--     drop column if exists effective_from, drop column if exists effective_to;
--   drop index if exists public.approval_levels_code_uq;
--   alter table public.approval_levels
--     drop constraint if exists approval_levels_stage_type_chk,
--     drop column if exists code, drop column if exists display_name, drop column if exists tier,
--     drop column if exists stage_type, drop column if exists required_role;
-- commit;
