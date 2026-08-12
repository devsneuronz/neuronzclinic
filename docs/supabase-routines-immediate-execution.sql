alter table public.routines
  add column if not exists execution_mode text not null default 'scheduled';

alter table public.routines
  drop constraint if exists routines_execution_mode_check;

alter table public.routines
  add constraint routines_execution_mode_check
  check (execution_mode in ('scheduled', 'immediate'));

update public.routines
set execution_mode = 'immediate'
where trigger = 'manual';
