create extension if not exists pgcrypto;

create table if not exists public.saved_attachments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('text', 'image', 'video', 'audio', 'document')),
  body text,
  media_url text,
  media_path text,
  media_mime_type text,
  file_name text,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_attachments_title_not_blank check (length(btrim(title)) > 0),
  constraint saved_attachments_text_has_body check (kind <> 'text' or length(btrim(coalesce(body, ''))) > 0),
  constraint saved_attachments_media_has_url check (kind = 'text' or length(btrim(coalesce(media_url, ''))) > 0)
);

alter table public.saved_attachments
  add column if not exists media_path text;

alter table public.saved_attachments
  drop constraint if exists saved_attachments_kind_check;

alter table public.saved_attachments
  add constraint saved_attachments_kind_check
  check (kind in ('text', 'image', 'video', 'audio', 'document'));

create index if not exists saved_attachments_active_sort_idx
  on public.saved_attachments (is_active, title, created_at desc);

create or replace function public.set_saved_attachments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saved_attachments_updated_at on public.saved_attachments;

create trigger set_saved_attachments_updated_at
before update on public.saved_attachments
for each row
execute function public.set_saved_attachments_updated_at();

alter table public.saved_attachments enable row level security;

drop policy if exists "saved_attachments_select" on public.saved_attachments;
drop policy if exists "saved_attachments_insert" on public.saved_attachments;
drop policy if exists "saved_attachments_update" on public.saved_attachments;
drop policy if exists "saved_attachments_delete" on public.saved_attachments;

create policy "saved_attachments_select"
on public.saved_attachments
for select
to anon, authenticated
using (true);

create policy "saved_attachments_insert"
on public.saved_attachments
for insert
to anon, authenticated
with check (true);

create policy "saved_attachments_update"
on public.saved_attachments
for update
to anon, authenticated
using (true)
with check (true);

create policy "saved_attachments_delete"
on public.saved_attachments
for delete
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.saved_attachments to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'saved-attachments',
  'saved-attachments',
  true,
  83886080,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/webm',
    'audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "saved_attachments_storage_select" on storage.objects;
drop policy if exists "saved_attachments_storage_insert" on storage.objects;
drop policy if exists "saved_attachments_storage_update" on storage.objects;
drop policy if exists "saved_attachments_storage_delete" on storage.objects;

create policy "saved_attachments_storage_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'saved-attachments');

create policy "saved_attachments_storage_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'saved-attachments');

create policy "saved_attachments_storage_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'saved-attachments')
with check (bucket_id = 'saved-attachments');

create policy "saved_attachments_storage_delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'saved-attachments');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'saved_attachments'
    ) then
    alter publication supabase_realtime add table public.saved_attachments;
  end if;
end;
$$;
