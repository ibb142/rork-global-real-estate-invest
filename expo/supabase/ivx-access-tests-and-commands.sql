create extension if not exists pgcrypto;

create table if not exists public.ivx_command_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  command text not null,
  status text not null default 'pending',
  result_json jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ivx_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ivx_knowledge_documents(id) on delete cascade,
  source_id text not null,
  chunk_index integer not null,
  content_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ivx_access_test_rows (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ivx_command_logs_command_created_at on public.ivx_command_logs(command, created_at desc);
create index if not exists idx_ivx_command_logs_owner_created_at on public.ivx_command_logs(owner_user_id, created_at desc);
create index if not exists idx_ivx_knowledge_chunks_document_id on public.ivx_knowledge_chunks(document_id, chunk_index);
create index if not exists idx_ivx_knowledge_chunks_source_id on public.ivx_knowledge_chunks(source_id);
create index if not exists idx_ivx_knowledge_chunks_content_text on public.ivx_knowledge_chunks using gin(to_tsvector('english', content_text));
create unique index if not exists idx_ivx_access_test_rows_request_id_unique on public.ivx_access_test_rows(request_id);
create unique index if not exists idx_ivx_ai_requests_request_id_unique on public.ivx_ai_requests(request_id) where request_id is not null;

alter table public.ivx_command_logs enable row level security;
alter table public.ivx_knowledge_chunks enable row level security;
alter table public.ivx_access_test_rows enable row level security;

alter table public.ivx_command_logs force row level security;
alter table public.ivx_knowledge_chunks force row level security;
alter table public.ivx_access_test_rows force row level security;

drop policy if exists ivx_command_logs_owner_only on public.ivx_command_logs;
drop policy if exists ivx_knowledge_chunks_owner_only on public.ivx_knowledge_chunks;
drop policy if exists ivx_access_test_rows_owner_only on public.ivx_access_test_rows;

create policy ivx_command_logs_owner_only on public.ivx_command_logs
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_knowledge_chunks_owner_only on public.ivx_knowledge_chunks
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_access_test_rows_owner_only on public.ivx_access_test_rows
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ivx-owner-files',
  'ivx-owner-files',
  false,
  52428800,
  array['image/*', 'video/*', 'application/pdf', 'text/plain', 'application/json', 'application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ivx_owner_files_owner_only on storage.objects;
drop policy if exists ivx_owner_files_select_owner on storage.objects;
drop policy if exists ivx_owner_files_insert_owner on storage.objects;
drop policy if exists ivx_owner_files_update_owner on storage.objects;
drop policy if exists ivx_owner_files_delete_owner on storage.objects;

create policy ivx_owner_files_select_owner on storage.objects
for select
to authenticated
using (bucket_id = 'ivx-owner-files' and public.ivx_is_owner());

create policy ivx_owner_files_insert_owner on storage.objects
for insert
to authenticated
with check (bucket_id = 'ivx-owner-files' and public.ivx_is_owner());

create policy ivx_owner_files_update_owner on storage.objects
for update
to authenticated
using (bucket_id = 'ivx-owner-files' and public.ivx_is_owner())
with check (bucket_id = 'ivx-owner-files' and public.ivx_is_owner());

create policy ivx_owner_files_delete_owner on storage.objects
for delete
to authenticated
using (bucket_id = 'ivx-owner-files' and public.ivx_is_owner());
