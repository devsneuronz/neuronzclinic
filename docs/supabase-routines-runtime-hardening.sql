-- Endurece a execução das rotinas sem interromper os registros existentes.
-- Execute primeiro no Supabase e publique o backend depois.

alter table public.routine_action_runs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by uuid,
  add column if not exists next_retry_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routine_action_runs_attempt_count_check'
      and conrelid = 'public.routine_action_runs'::regclass
  ) then
    alter table public.routine_action_runs
      add constraint routine_action_runs_attempt_count_check
      check (attempt_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routine_action_runs_max_attempts_check'
      and conrelid = 'public.routine_action_runs'::regclass
  ) then
    alter table public.routine_action_runs
      add constraint routine_action_runs_max_attempts_check
      check (max_attempts between 1 and 10);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routine_action_runs_status_check'
      and conrelid = 'public.routine_action_runs'::regclass
  ) then
    alter table public.routine_action_runs
      add constraint routine_action_runs_status_check
      check (status in ('pending', 'processing', 'retrying', 'done', 'failed', 'canceled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routine_runs_status_check'
      and conrelid = 'public.routine_runs'::regclass
  ) then
    alter table public.routine_runs
      add constraint routine_runs_status_check
      check (status in ('running', 'done', 'failed', 'canceled'));
  end if;
end
$$;

create unique index if not exists routine_action_runs_run_action_uidx
  on public.routine_action_runs (routine_run_id, action_id);

create unique index if not exists routine_action_runs_run_position_uidx
  on public.routine_action_runs (routine_run_id, action_index);

create index if not exists routine_action_runs_claim_idx
  on public.routine_action_runs (execute_at, action_index)
  where status in ('pending', 'retrying');

create or replace function public.start_routine_run(
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
  p_actions jsonb
)
returns table(run_id uuid, created boolean, action_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_created boolean := false;
  v_action_count integer := 0;
begin
  if nullif(btrim(p_routine_airtable_id), '') is null
    or nullif(btrim(p_contact_id), '') is null
    or nullif(btrim(p_event_id), '') is null then
    raise exception 'Rotina, contato e evento são obrigatórios.';
  end if;

  if jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' then
    raise exception 'Ações precisam ser um array JSON.';
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
  )
  on conflict (routine_airtable_id, contact_id, event_id)
    where event_id is not null
  do nothing
  returning id into v_run_id;

  if v_run_id is not null then
    v_created := true;
  else
    select rr.id
      into v_run_id
      from public.routine_runs rr
     where rr.routine_airtable_id = p_routine_airtable_id
       and rr.contact_id = p_contact_id
       and rr.event_id = p_event_id;
  end if;

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
  )
  on conflict (routine_run_id, action_id) do nothing;

  get diagnostics v_action_count = row_count;
  return query select v_run_id, v_created, v_action_count;
end;
$$;

create or replace function public.claim_due_routine_actions(
  p_limit integer default 20,
  p_worker_id uuid default gen_random_uuid(),
  p_action_run_ids uuid[] default null,
  p_lease_seconds integer default 300
)
returns setof public.routine_action_runs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'O limite deve estar entre 1 e 100.';
  end if;

  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'A duração da reserva deve estar entre 30 e 3600 segundos.';
  end if;

  update public.routine_action_runs ar
     set status = 'retrying',
         claimed_at = null,
         claimed_by = null,
         next_retry_at = now()
   where ar.status = 'processing'
     and ar.claimed_at < now() - make_interval(secs => p_lease_seconds);

  return query
  with candidates as (
    select ar.id
      from public.routine_action_runs ar
      join public.routine_runs rr on rr.id = ar.routine_run_id
     where ar.status in ('pending', 'retrying')
       and rr.status = 'running'
       and coalesce(ar.next_retry_at, ar.execute_at) <= now()
       and ar.attempt_count < ar.max_attempts
       and (p_action_run_ids is null or ar.id = any(p_action_run_ids))
       and not exists (
         select 1
           from public.routine_action_runs previous
          where previous.routine_run_id = ar.routine_run_id
            and previous.action_index < ar.action_index
            and previous.status in ('pending', 'processing', 'retrying')
       )
     order by coalesce(ar.next_retry_at, ar.execute_at), ar.action_index
     limit p_limit
     for update of ar skip locked
  )
  update public.routine_action_runs ar
     set status = 'processing',
         claimed_at = now(),
         claimed_by = p_worker_id,
         attempt_count = ar.attempt_count + 1,
         next_retry_at = null,
         last_error = null
    from candidates
   where ar.id = candidates.id
  returning ar.*;
end;
$$;

create or replace function public.complete_routine_action(
  p_action_run_id uuid,
  p_worker_id uuid,
  p_result jsonb,
  p_executed_at timestamptz default now()
)
returns table(completed boolean, rescheduled_actions integer, routine_finished boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_action_index integer;
  v_next_execute_at timestamptz := p_executed_at;
  v_rescheduled integer := 0;
  v_finished boolean := false;
  pending_action record;
begin
  update public.routine_action_runs ar
     set status = 'done',
         executed_at = p_executed_at,
         result = coalesce(p_result, '{}'::jsonb),
         claimed_at = null,
         claimed_by = null,
         next_retry_at = null,
         last_error = null
   where ar.id = p_action_run_id
     and ar.status = 'processing'
     and ar.claimed_by = p_worker_id
  returning ar.routine_run_id, ar.action_index
       into v_run_id, v_action_index;

  if v_run_id is null then
    return query select false, 0, false;
    return;
  end if;

  for pending_action in
    select ar.id, ar.payload
      from public.routine_action_runs ar
     where ar.routine_run_id = v_run_id
       and ar.status in ('pending', 'retrying')
       and ar.action_index > v_action_index
     order by ar.action_index
     for update
  loop
    v_next_execute_at := v_next_execute_at + make_interval(
      secs => greatest(0, coalesce(nullif(pending_action.payload ->> 'delayMinutes', '')::numeric, 0) * 60)::double precision
    );

    update public.routine_action_runs
       set execute_at = v_next_execute_at,
           next_retry_at = null
     where id = pending_action.id;
    v_rescheduled := v_rescheduled + 1;
  end loop;

  if not exists (
    select 1
      from public.routine_action_runs ar
     where ar.routine_run_id = v_run_id
       and ar.status in ('pending', 'processing', 'retrying')
  ) then
    update public.routine_runs rr
       set status = case
         when exists (
           select 1 from public.routine_action_runs ar
           where ar.routine_run_id = v_run_id and ar.status = 'failed'
         ) then 'failed'
         else 'done'
       end,
       finished_at = p_executed_at
     where rr.id = v_run_id
       and rr.status = 'running';
    v_finished := found;
  end if;

  return query select true, v_rescheduled, v_finished;
end;
$$;

create or replace function public.fail_routine_action(
  p_action_run_id uuid,
  p_worker_id uuid,
  p_last_error text,
  p_failed_at timestamptz default now()
)
returns table(updated boolean, status text, next_retry_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_attempt_count integer;
  v_max_attempts integer;
  v_status text;
  v_next_retry_at timestamptz;
begin
  select ar.routine_run_id, ar.attempt_count, ar.max_attempts
    into v_run_id, v_attempt_count, v_max_attempts
    from public.routine_action_runs ar
   where ar.id = p_action_run_id
     and ar.status = 'processing'
     and ar.claimed_by = p_worker_id
   for update;

  if v_run_id is null then
    return query select false, null::text, null::timestamptz;
    return;
  end if;

  if v_attempt_count < v_max_attempts then
    v_status := 'retrying';
    v_next_retry_at := p_failed_at + case v_attempt_count
      when 1 then interval '1 minute'
      when 2 then interval '5 minutes'
      else interval '15 minutes'
    end;
  else
    v_status := 'failed';
    v_next_retry_at := null;
  end if;

  update public.routine_action_runs
     set status = v_status,
         last_error = left(coalesce(p_last_error, 'Falha ao executar ação.'), 2000),
         executed_at = case when v_status = 'failed' then p_failed_at else null end,
         next_retry_at = v_next_retry_at,
         claimed_at = null,
         claimed_by = null
   where id = p_action_run_id;

  if v_status = 'failed' then
    update public.routine_action_runs ar
       set status = 'canceled',
           last_error = 'Cancelada porque uma ação anterior excedeu o limite de tentativas.'
     where ar.routine_run_id = v_run_id
       and ar.status in ('pending', 'retrying');

    update public.routine_runs rr
       set status = 'failed', finished_at = p_failed_at
     where rr.id = v_run_id
       and rr.status = 'running';
  end if;

  return query select true, v_status, v_next_retry_at;
end;
$$;

revoke execute on function public.start_routine_run(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.claim_due_routine_actions(integer, uuid, uuid[], integer)
  from public, anon, authenticated;
revoke execute on function public.complete_routine_action(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.fail_routine_action(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.start_routine_run(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.claim_due_routine_actions(integer, uuid, uuid[], integer)
  to service_role;
grant execute on function public.complete_routine_action(uuid, uuid, jsonb, timestamptz)
  to service_role;
grant execute on function public.fail_routine_action(uuid, uuid, text, timestamptz)
  to service_role;
