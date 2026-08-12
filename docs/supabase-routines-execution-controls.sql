alter table public.routines
  add column if not exists execution_time time without time zone not null default time '09:00',
  add column if not exists max_executions_per_contact integer not null default 1;

alter table public.routines
  drop constraint if exists routines_max_executions_per_contact_check;

alter table public.routines
  add constraint routines_max_executions_per_contact_check
  check (max_executions_per_contact between 1 and 1000);

create index if not exists routine_runs_routine_contact_idx
  on public.routine_runs (routine_airtable_id, contact_id);

create or replace function public.start_limited_routine_run(
  p_routine_airtable_id text,
  p_routine_name text,
  p_contact_id text,
  p_contact_airtable_id text,
  p_chat_id text,
  p_contact_name text,
  p_contact_phone text,
  p_trigger_type text,
  p_trigger_target text,
  p_event_id text,
  p_payload jsonb,
  p_actions jsonb,
  p_max_executions_per_contact integer
)
returns table(run_id uuid, created boolean, action_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_action_count integer := 0;
  v_execution_count integer := 0;
begin
  if nullif(btrim(p_routine_airtable_id), '') is null
    or nullif(btrim(p_contact_id), '') is null
    or nullif(btrim(p_event_id), '') is null then
    raise exception 'Rotina, contato e evento são obrigatórios.';
  end if;

  if p_max_executions_per_contact not between 1 and 1000 then
    raise exception 'O limite de execuções por contato é inválido.';
  end if;

  if jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' then
    raise exception 'Ações precisam ser um array JSON.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_routine_airtable_id || ':' || p_contact_id, 0));

  select rr.id
    into v_run_id
    from public.routine_runs rr
   where rr.routine_airtable_id = p_routine_airtable_id
     and rr.contact_id = p_contact_id
     and rr.event_id = p_event_id;

  if v_run_id is not null then
    return query select v_run_id, false, 0;
    return;
  end if;

  select count(*)
    into v_execution_count
    from public.routine_runs rr
   where rr.routine_airtable_id = p_routine_airtable_id
     and rr.contact_id = p_contact_id;

  if v_execution_count >= p_max_executions_per_contact then
    return query select null::uuid, false, 0;
    return;
  end if;

  insert into public.routine_runs (
    routine_airtable_id,
    routine_name,
    contact_id,
    contact_airtable_id,
    chat_id,
    contact_name,
    contact_phone,
    trigger_type,
    trigger_target,
    event_id,
    status,
    payload
  ) values (
    p_routine_airtable_id,
    nullif(p_routine_name, ''),
    p_contact_id,
    nullif(p_contact_airtable_id, ''),
    nullif(p_chat_id, ''),
    nullif(p_contact_name, ''),
    nullif(p_contact_phone, ''),
    p_trigger_type,
    nullif(p_trigger_target, ''),
    p_event_id,
    'running',
    coalesce(p_payload, '{}'::jsonb)
  ) returning id into v_run_id;

  insert into public.routine_action_runs (
    routine_run_id,
    action_id,
    action_index,
    action_type,
    execute_at,
    status,
    payload
  )
  select
    v_run_id,
    action.action_id,
    action.action_index,
    action.action_type,
    action.execute_at,
    'pending',
    coalesce(action.payload, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_actions, '[]'::jsonb)) as action(
    action_id text,
    action_index integer,
    action_type text,
    execute_at timestamptz,
    payload jsonb
  );

  get diagnostics v_action_count = row_count;
  return query select v_run_id, true, v_action_count;
end;
$$;
