-- =====================================================================
-- DiGoP Migration 02: LGAs, committees, new approval levels, draft routes
-- ---------------------------------------------------------------------
-- RUN ORDER: after Migration 01 (and 02a). Single transaction, safe to re-run.
--
-- WHAT IT ADDS (nothing is dropped or renamed; the live app does not read
-- any of it yet, so approvals behave exactly as today):
--   1. lgas table (16 Ekiti LGAs, editable by admins) + a new lga_ref link on
--      ekiti_users and projects. Existing lga text / lga_id are untouched.
--   2. seat_designations (the committee seat types your source described).
--   3. committees + committee_seats (by designation; people are assigned
--      later from an admin screen). One row is seeded: State Cabinet.
--   4. committee_meetings, meeting_attendance, committee_resolutions
--      (quorum rule is snapshotted per meeting; quorum is UNVERIFIED).
--   5. approval_escalations (log for manual escalation: who/when/why).
--   6. Five new approval levels (tier LG / STATE).
--   7. Four DRAFT routes, rule_set 'ekiti_process_v1', all marked provisional.
--      They are drafts: nothing uses them until an admin publishes them.
--   8. A publish check: a route cannot be published unless it has stages,
--      exactly one final stage (the last), and no overlap with another
--      published route of the same rule set and tier.
--   9. Row level security: members of DiGoP can read; only DiGoP admins
--      (current_ekiti_is_admin) can change configuration. Meetings,
--      resolutions and escalations have NO direct write access: they will be
--      written by controlled functions in Migration 03.
--
-- PROVISIONAL / UNCONFIRMED (stored, but labelled as such):
--   * LG limit 500,000 and State/MDA limit 1,000,000 (scope unconfirmed)
--   * Committee quorum numbers (unknown -> NULL, status 'unverified')
--   * MoLGA stage role mapping; the full title behind "HLA"; whether
--     "Zonal Inspector / Executive Secretary" is one seat or two.
--   * No Governor-versus-Cabinet cutoff exists anywhere. Cabinet is only
--     reachable by a logged manual escalation (Migration 03).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.approval_routes') is null or to_regclass('public.route_stages') is null then
    raise exception 'Run Migration 01 first (approval_routes / route_stages missing); aborting.';
  end if;
  if to_regprocedure('public.current_ekiti_is_admin()') is null
     or to_regprocedure('public.current_ekiti_role()') is null then
    raise exception 'current_ekiti_is_admin() / current_ekiti_role() missing; aborting.';
  end if;
  if to_regclass('public.ekiti_users') is null or to_regclass('public.projects') is null
     or to_regclass('public.departments') is null then
    raise exception 'ekiti_users / projects / departments missing; aborting.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. LGAs
-- ---------------------------------------------------------------------
create table if not exists public.lgas (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists lgas_name_uq on public.lgas (lower(name));

insert into public.lgas (name)
select v.name
from (values
  ('Ado-Ekiti'), ('Efon'), ('Ekiti East'), ('Ekiti South-West'), ('Ekiti West'),
  ('Emure'), ('Gbonyin'), ('Ido-Osi'), ('Ijero'), ('Ikere'), ('Ikole'),
  ('Ilejemeje'), ('Irepodun/Ifelodun'), ('Ise/Orun'), ('Moba'), ('Oye')
) as v(name)
where not exists (select 1 from public.lgas l where lower(l.name) = lower(v.name));

alter table public.ekiti_users add column if not exists lga_ref uuid references public.lgas(id);
alter table public.projects    add column if not exists lga_ref uuid references public.lgas(id);
create index if not exists ekiti_users_lga_ref_idx on public.ekiti_users (lga_ref);
create index if not exists projects_lga_ref_idx    on public.projects (lga_ref);

-- Fill the new link from what already exists (only where it can be matched)
update public.ekiti_users u
set lga_ref = l.id
from public.lgas l
where u.lga_ref is null and u.lga is not null
  and lower(btrim(u.lga)) = lower(l.name);

update public.projects p
set lga_ref = u.lga_ref
from public.ekiti_users u
where p.lga_ref is null and p.lga_id = u.id and u.lga_ref is not null;

-- ---------------------------------------------------------------------
-- 2. Seat designations (catalog)
-- ---------------------------------------------------------------------
create table if not exists public.seat_designations (
  code       text primary key,
  name       text    not null,
  tier       text    not null check (tier in ('LG','STATE')),
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  note       text
);

insert into public.seat_designations (code, name, tier, sort_order, note) values
  ('LG_CHAIRMAN',          'LG Chairman',                          'LG',    10, 'Leads the committee'),
  ('LG_VICE_CHAIRMAN',     'Vice Chairman',                        'LG',    20, null),
  ('LG_SECRETARY',         'LG Secretary',                         'LG',    30, null),
  ('HLA',                  'HLA',                                  'LG',    40, 'Written as "HLA" by the source; full title to be confirmed'),
  ('HOD',                  'Head of Department',                   'LG',    50, 'One seat per department (set department on the seat)'),
  ('COUNCIL_EXCO',         'Council executive member',             'LG',    60, null),
  ('TRADITIONAL_RULER_REP','Traditional ruler representative',     'LG',    70, null),
  ('ZONAL_INSPECTOR',      'Zonal Inspector / Executive Secretary','LG',    80, 'Source wrote "Zonal Inspector/Executive Secretary": confirm whether this is one seat or two'),
  ('RECORDER',             'Recorder',                             'LG',    90, 'LG staff who take minutes and communicate the decision'),
  ('GOVERNOR',             'Governor',                             'STATE', 10, 'Presides at State Cabinet'),
  ('COMMISSIONER_INFO',    'Commissioner for Information',         'STATE', 20, 'Communicates Cabinet decisions'),
  ('CABINET_MEMBER',       'Cabinet member',                       'STATE', 30, 'Membership list not yet confirmed')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Committees and seats
-- ---------------------------------------------------------------------
create table if not exists public.committees (
  id            uuid primary key default gen_random_uuid(),
  kind          text    not null check (kind in ('FGPC','CABINET')),
  name          text    not null,
  lga_ref       uuid references public.lgas(id),
  quorum_min    integer check (quorum_min is null or quorum_min > 0),
  quorum_status text    not null default 'unverified'
                        check (quorum_status in ('confirmed','provisional','unverified')),
  decision_rule text    not null default 'consensus_else_majority'
                        check (decision_rule in ('consensus_else_majority','majority','consensus')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  -- LG committees (F&GPC) belong to an LGA; the State Cabinet does not.
  check ( (kind = 'FGPC' and lga_ref is not null) or (kind = 'CABINET' and lga_ref is null) )
);
create unique index if not exists committees_kind_lga_uq
  on public.committees (kind, coalesce(lga_ref, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.committee_seats (
  id               uuid primary key default gen_random_uuid(),
  committee_id     uuid    not null references public.committees(id) on delete cascade,
  designation_code text    not null references public.seat_designations(code),
  department_id    uuid references public.departments(id),
  holder_user_id   uuid references public.ekiti_users(id),   -- NULL = vacant
  is_chair         boolean not null default false,
  can_record       boolean not null default false,           -- may enter resolutions
  is_voting        boolean not null default true,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  check (department_id is null or designation_code = 'HOD')
);
create index if not exists committee_seats_committee_idx on public.committee_seats (committee_id);
create unique index if not exists committee_seats_one_chair_uq
  on public.committee_seats (committee_id) where is_chair and is_active;

-- Seed: State Cabinet (Governor presides; Commissioner for Information communicates)
insert into public.committees (kind, name, lga_ref, quorum_min, quorum_status)
select 'CABINET', 'State Cabinet', null, null, 'unverified'
where not exists (select 1 from public.committees where kind = 'CABINET');

insert into public.committee_seats (committee_id, designation_code, is_chair)
select c.id, 'GOVERNOR', true
from public.committees c
where c.kind = 'CABINET'
  and not exists (select 1 from public.committee_seats s
                  where s.committee_id = c.id and s.designation_code = 'GOVERNOR');

insert into public.committee_seats (committee_id, designation_code, is_chair)
select c.id, 'COMMISSIONER_INFO', false
from public.committees c
where c.kind = 'CABINET'
  and not exists (select 1 from public.committee_seats s
                  where s.committee_id = c.id and s.designation_code = 'COMMISSIONER_INFO');

-- ---------------------------------------------------------------------
-- 4. Meetings, attendance, resolutions (written by Migration 03 functions)
-- ---------------------------------------------------------------------
create table if not exists public.committee_meetings (
  id                      uuid primary key default gen_random_uuid(),
  committee_id            uuid not null references public.committees(id),
  held_at                 timestamptz not null,
  venue                   text,
  status                  text not null default 'open' check (status in ('open','closed')),
  -- quorum rule as it stood when the meeting was opened
  quorum_min_snapshot     integer,
  quorum_status_snapshot  text not null default 'unverified'
                          check (quorum_status_snapshot in ('confirmed','provisional','unverified')),
  attendee_count          integer,
  quorum_met              boolean,            -- NULL = not assessable (no rule set)
  recorded_by             uuid references public.ekiti_users(id),
  created_at              timestamptz not null default now()
);

create table if not exists public.meeting_attendance (
  meeting_id uuid    not null references public.committee_meetings(id) on delete cascade,
  seat_id    uuid    not null references public.committee_seats(id),
  present    boolean not null,
  primary key (meeting_id, seat_id)
);

create table if not exists public.committee_resolutions (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references public.committee_meetings(id),
  project_id      uuid not null references public.projects(id),
  outcome         text not null check (outcome in ('approved','rejected','returned','deferred')),
  decision_method text not null check (decision_method in ('consensus','majority')),
  votes_for       integer check (votes_for is null or votes_for >= 0),
  votes_against   integer check (votes_against is null or votes_against >= 0),
  abstentions     integer check (abstentions is null or abstentions >= 0),
  notes           text,
  is_provisional  boolean not null default true,  -- true while the quorum rule is unverified
  recorded_by     uuid references public.ekiti_users(id),
  created_at      timestamptz not null default now()
);
create index if not exists committee_resolutions_project_idx on public.committee_resolutions (project_id);

-- ---------------------------------------------------------------------
-- 5. Manual escalation log (who / when / why)
-- ---------------------------------------------------------------------
create table if not exists public.approval_escalations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id),
  from_level_id uuid references public.approval_levels(id),
  to_level_id   uuid references public.approval_levels(id),
  reason        text not null check (length(btrim(reason)) > 0),
  escalated_by  uuid not null references public.ekiti_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists approval_escalations_project_idx on public.approval_escalations (project_id);

-- ---------------------------------------------------------------------
-- 6. New approval levels (levels 101+ keep them clear of the legacy 1-4)
-- ---------------------------------------------------------------------
insert into public.approval_levels
  (name, level_order, description, code, display_name, tier, stage_type, required_role)
values
  ('LG Presentation', 101, 'Head of Works presents the project with the LG Chairman present',
   'LG_PRESENT', 'Project presentation', 'LG', 'joint', 'department_staff'),
  ('F&GPC', 102, 'LG Finance and General Purpose Committee (committee decision)',
   'FGPC', 'F&GPC', 'LG', 'committee', null),
  ('MoLGA', 103, 'Ministry of Local Government Affairs: review and forward (role mapping provisional)',
   'MOLGA', 'MoLGA review', 'STATE', 'review_forward', 'mda_oversight'),
  ('Governor', 104, 'Governor (final authority is configurable per route)',
   'GOVERNOR', 'Governor', 'STATE', 'individual', 'governor'),
  ('State Cabinet', 105, 'State Cabinet (reached by logged manual escalation only)',
   'CABINET', 'State Cabinet', 'STATE', 'committee', null)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 7. Publish check (overlap protection + stage sanity)
-- ---------------------------------------------------------------------
create or replace function public.validate_route_publish()
returns trigger language plpgsql set search_path = ''
as $$
declare
  n int; finals int; last_seq int; final_seq int; clash text;
begin
  if not (old.status = 'draft' and new.status = 'published') then
    return new;
  end if;

  select count(*), count(*) filter (where is_final), max(seq), max(seq) filter (where is_final)
    into n, finals, last_seq, final_seq
  from public.route_stages where route_id = new.id;

  if n = 0 then
    raise exception 'Cannot publish route "%": it has no stages.', new.name;
  end if;
  if finals <> 1 or final_seq is distinct from last_seq then
    raise exception 'Cannot publish route "%": it needs exactly one final stage and it must be the last stage.', new.name;
  end if;
  if new.max_amount is not null and new.max_amount <= new.min_amount then
    raise exception 'Cannot publish route "%": the maximum amount must be greater than the minimum.', new.name;
  end if;

  -- Ranges are (min, max]: routes that only touch at a boundary do not overlap.
  select r.name into clash
  from public.approval_routes r
  where r.id <> new.id
    and r.status = 'published'
    and r.rule_set = new.rule_set
    and r.tier = new.tier
    and (new.max_amount is null or r.min_amount < new.max_amount)
    and (r.max_amount is null or new.min_amount < r.max_amount)
  limit 1;
  if clash is not null then
    raise exception 'Cannot publish route "%": its amount range overlaps the published route "%".', new.name, clash;
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_route_publish on public.approval_routes;
create trigger trg_validate_route_publish
  before update on public.approval_routes
  for each row execute function public.validate_route_publish();

-- ---------------------------------------------------------------------
-- 8. Draft routes (provisional; nothing uses them until published)
-- ---------------------------------------------------------------------
insert into public.approval_routes (name, tier, rule_set, min_amount, max_amount, version, status, rule_status)
select v.name, v.tier, 'ekiti_process_v1', v.min_amount, v.max_amount, 1, 'draft', 'provisional'
from (values
  ('LG: up to ₦500,000 (provisional)',          'LG',    0::numeric,       500000::numeric),
  ('LG: above ₦500,000 (provisional)',          'LG',    500000::numeric,  null::numeric),
  ('State/MDA: up to ₦1,000,000 (provisional)', 'STATE', 0::numeric,       1000000::numeric),
  ('State/MDA: above ₦1,000,000 (provisional)', 'STATE', 1000000::numeric, null::numeric)
) as v(name, tier, min_amount, max_amount)
where not exists (select 1 from public.approval_routes r
                  where r.rule_set = 'ekiti_process_v1' and r.tier = v.tier
                    and r.name = v.name and r.version = 1);

-- Stages: only for draft routes that have none yet
insert into public.route_stages (route_id, seq, level_id, stage_type, is_final)
select r.id, s.seq, l.id, l.stage_type, s.is_final
from public.approval_routes r
join (values
  ('LG: up to ₦500,000 (provisional)',          1, 'LG_PRESENT', false),
  ('LG: up to ₦500,000 (provisional)',          2, 'FGPC',       true),
  ('LG: above ₦500,000 (provisional)',          1, 'LG_PRESENT', false),
  ('LG: above ₦500,000 (provisional)',          2, 'FGPC',       false),
  ('LG: above ₦500,000 (provisional)',          3, 'MOLGA',      false),
  ('LG: above ₦500,000 (provisional)',          4, 'GOVERNOR',   true),
  ('State/MDA: up to ₦1,000,000 (provisional)', 1, 'STATE',      true),
  ('State/MDA: above ₦1,000,000 (provisional)', 1, 'STATE',      false),
  ('State/MDA: above ₦1,000,000 (provisional)', 2, 'GOVERNOR',   true)
) as s(route_name, seq, level_code, is_final) on s.route_name = r.name
join public.approval_levels l on l.code = s.level_code
where r.rule_set = 'ekiti_process_v1' and r.version = 1 and r.status = 'draft'
  and not exists (select 1 from public.route_stages x where x.route_id = r.id);

-- ---------------------------------------------------------------------
-- 9. Row level security + grants
-- ---------------------------------------------------------------------
alter table public.lgas                  enable row level security;
alter table public.seat_designations     enable row level security;
alter table public.committees            enable row level security;
alter table public.committee_seats       enable row level security;
alter table public.committee_meetings    enable row level security;
alter table public.meeting_attendance    enable row level security;
alter table public.committee_resolutions enable row level security;
alter table public.approval_escalations  enable row level security;

revoke all on public.lgas, public.seat_designations, public.committees, public.committee_seats,
              public.committee_meetings, public.meeting_attendance, public.committee_resolutions,
              public.approval_escalations from anon;

grant select, insert, update, delete on public.lgas, public.seat_designations, public.committees,
      public.committee_seats to authenticated;
grant select on public.committee_meetings, public.meeting_attendance,
      public.committee_resolutions, public.approval_escalations to authenticated;
grant all on public.lgas, public.seat_designations, public.committees, public.committee_seats,
      public.committee_meetings, public.meeting_attendance, public.committee_resolutions,
      public.approval_escalations to service_role;

-- Read: any active-looking DiGoP account (a row in ekiti_users); other apps' users see nothing
do $$
declare t text;
begin
  foreach t in array array['lgas','seat_designations','committees','committee_seats',
                           'committee_meetings','meeting_attendance','committee_resolutions',
                           'approval_escalations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_ekiti_role() is not null)',
                   t || '_member_read', t);
  end loop;

  -- Configuration tables: DiGoP admins may change them
  foreach t in array array['lgas','seat_designations','committees','committee_seats','route_stages'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_ekiti_is_admin()) with check (public.current_ekiti_is_admin())',
                   t || '_admin_write', t);
  end loop;
end $$;

-- approval_routes: admins may create DRAFTS and edit/remove them
-- (published routes are protected by the triggers from Migration 01)
drop policy if exists approval_routes_admin_insert on public.approval_routes;
create policy approval_routes_admin_insert on public.approval_routes
  for insert to authenticated
  with check (public.current_ekiti_is_admin() and status = 'draft');

drop policy if exists approval_routes_admin_update on public.approval_routes;
create policy approval_routes_admin_update on public.approval_routes
  for update to authenticated
  using (public.current_ekiti_is_admin()) with check (public.current_ekiti_is_admin());

drop policy if exists approval_routes_admin_delete on public.approval_routes;
create policy approval_routes_admin_delete on public.approval_routes
  for delete to authenticated using (public.current_ekiti_is_admin());

grant insert, update, delete on public.approval_routes, public.route_stages to authenticated;

commit;
