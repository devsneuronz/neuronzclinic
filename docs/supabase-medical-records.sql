-- Proposta de schema para persistir prontuários clínicos.
-- Execute manualmente no Supabase quando decidir ativar a persistência.
-- O app deve acessar essas tabelas pelo backend com SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  contact_chat_id text,
  contact_airtable_id text,
  contact_name text,
  contact_phone text,
  appointment_airtable_id text,
  professional_airtable_id text,
  professional_name text,
  title text,
  status text not null default 'draft'
    check (status in ('draft', 'finalized', 'canceled')),
  content_html text not null default '',
  content_json jsonb,
  ai_transcription text,
  ai_summary text,
  conduct text,
  prescription_summary text,
  exam_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  updated_by text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medical_records_contact_chat_id_idx
  on public.medical_records (contact_chat_id);

create index if not exists medical_records_contact_airtable_id_idx
  on public.medical_records (contact_airtable_id);

create index if not exists medical_records_appointment_airtable_id_idx
  on public.medical_records (appointment_airtable_id);

create index if not exists medical_records_created_at_idx
  on public.medical_records (created_at desc);

create table if not exists public.medical_record_attachments (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  kind text not null default 'image'
    check (kind in ('image', 'document', 'audio', 'video', 'link')),
  title text,
  url text,
  storage_path text,
  mime_type text,
  file_name text,
  file_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists medical_record_attachments_record_id_idx
  on public.medical_record_attachments (medical_record_id);

create or replace function public.set_medical_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_medical_records_updated_at on public.medical_records;

create trigger set_medical_records_updated_at
before update on public.medical_records
for each row
execute function public.set_medical_records_updated_at();

alter table public.medical_records enable row level security;
alter table public.medical_record_attachments enable row level security;

-- Sem policies públicas por enquanto.
-- A service_role continua conseguindo acessar as tabelas pelo backend.
