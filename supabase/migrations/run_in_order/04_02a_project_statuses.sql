-- =====================================================================
-- DiGoP Migration 02a: three new project statuses (standalone, tiny)
-- ---------------------------------------------------------------------
-- Adds to the existing project_status list (planning, pending_approval,
-- approved, ongoing, stalled, completed, rejected):
--     awaiting_routing  - project held until its routing is clarified
--     returned          - sent back to the originator for rework
--     withdrawn         - pulled back by the originator
--
-- Deliberately NOT added here: 'escalated'. The Escalate button in the app
-- already tries to set it, and adding it now would make that button
-- "succeed" into a dead end (no next stage is created). It is added later,
-- together with the function that handles escalation properly.
--
-- Nothing in the app uses these values yet, so nothing changes for users.
-- Run this on its own (not together with other statements): Postgres does
-- not let a newly added enum value be used in the same transaction.
-- Safe to re-run. Rollback: Postgres cannot remove an enum value; leaving
-- unused values in place is harmless.
-- =====================================================================

alter type public.project_status add value if not exists 'awaiting_routing';
alter type public.project_status add value if not exists 'returned';
alter type public.project_status add value if not exists 'withdrawn';

-- Check (read-only): expect 10 values, ending with the three new ones
select string_agg(e.enumlabel, ', ' order by e.enumsortorder) as project_status_values
from pg_enum e join pg_type t on t.oid = e.enumtypid
where t.typname = 'project_status' and t.typnamespace = 'public'::regnamespace;
