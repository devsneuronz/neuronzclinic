create extension if not exists pgcrypto;

create table if not exists public.task_resolution_notes (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  content text not null,
  status_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_resolution_notes_task_id_created_at_idx
  on public.task_resolution_notes (task_id, created_at desc);

create or replace function public.set_task_resolution_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_task_resolution_notes_updated_at on public.task_resolution_notes;

create trigger set_task_resolution_notes_updated_at
before update on public.task_resolution_notes
for each row
execute function public.set_task_resolution_notes_updated_at();

alter table public.task_resolution_notes enable row level security;
