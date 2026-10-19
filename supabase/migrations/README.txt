DiGoP / EkitiGov - database migrations (Supabase project "scholaria-mvp")
Save this folder as C:\ekitigov\supabase\migrations

run_in_order/          Already run on the live database, in this order (01 ... 08).
                       Never run them again unless told to; keep them as the record.
rollbacks_do_not_run/  Undo scripts. Only for an emergency, one at a time.
                       If undoing both 03 and 04, run rollback_04 before rollback_03.
checks_read_only/      SELECT-only scripts used to check the database. Safe to run.

Notes
- 06 (03) was run before 07 (03b). 07 replaces one function from 06.
- 08 (04) installs the lock on direct approval writes but leaves it OFF.
  Turn on:  update public.routing_settings set value='on'  where key='enforce_db_routing';
  Turn off: update public.routing_settings set value='off' where key='enforce_db_routing';
  (or, as an admin in the app session: select public.set_db_routing_enforcement(true/false, 'reason');)
  Turn it on only together with the app switch (REACT_APP_DB_ROUTING=true on the deployed app).

Which account role approves which level (stored in approval_levels.required_role)
  HOD              department_staff     (not approvable until an HOD designation exists)
  Director         lg_legislative
  Chairman         executive_chairman
  State            mda_oversight
  LG Presentation  department_staff     (joint stage)
  F&GPC            none                 (committee, decided by recorded resolution)
  MoLGA            mda_oversight        (review and forward)
  Governor         governor
  State Cabinet    none                 (committee, decided by recorded resolution)
First four levels = the current chain. The other five belong to the draft Ekiti process routes.
Read the live values with:
  select name, code, required_role, stage_type from public.approval_levels order by level_order;
