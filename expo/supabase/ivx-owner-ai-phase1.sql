create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  country text,
  avatar text,
  kyc_status text default 'pending',
  total_invested numeric default 0,
  total_returns numeric default 0,
  role text default 'investor',
  referral_code text,
  vip_tier text default 'standard',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_owner_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select_owner_self on public.profiles
for select
to authenticated
using (id = auth.uid() or regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') in ('owner', 'owneradmin', 'ivxowner', 'developer', 'dev', 'admin', 'superadmin', 'administrator', 'founder', 'staff', 'staffmember', 'ceo', 'manager', 'analyst', 'support'));

create policy profiles_insert_self on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_role on public.profiles(role);

create or replace function public.ivx_is_owner()
returns boolean
language sql
security definer
set search_path = public
as '
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and regexp_replace(lower(coalesce(role, ''investor'')), ''[^a-z0-9]+'', '''', ''g'') in (''owner'', ''owneradmin'', ''ivxowner'', ''developer'', ''dev'', ''admin'', ''superadmin'', ''administrator'', ''founder'', ''staff'', ''staffmember'', ''ceo'', ''manager'', ''analyst'', ''support'')
    );
';

create table if not exists public.ivx_conversations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_text text,
  last_message_at timestamptz
);

create table if not exists public.ivx_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_role text not null default 'owner',
  sender_label text,
  body text,
  attachment_url text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  attachment_kind text not null default 'text',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ivx_inbox_state (
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table if not exists public.ivx_ai_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text,
  prompt text not null,
  response_text text,
  response_message_id uuid references public.ivx_messages(id) on delete set null,
  status text not null default 'completed',
  model text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ivx_ai_requests add column if not exists request_id text;
alter table public.ivx_ai_requests add column if not exists response_message_id uuid references public.ivx_messages(id) on delete set null;

create table if not exists public.ivx_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_name text not null,
  storage_path text not null,
  public_url text not null,
  mime_type text,
  content_text text,
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ivx_messages_conversation_created_at on public.ivx_messages(conversation_id, created_at);
create index if not exists idx_ivx_inbox_state_user_id on public.ivx_inbox_state(user_id, updated_at desc);
create index if not exists idx_ivx_ai_requests_conversation_id on public.ivx_ai_requests(conversation_id, created_at desc);
create unique index if not exists idx_ivx_ai_requests_request_id_unique on public.ivx_ai_requests(request_id) where request_id is not null;
create unique index if not exists idx_ivx_ai_requests_response_message_id_unique on public.ivx_ai_requests(response_message_id) where response_message_id is not null;
create index if not exists idx_ivx_knowledge_documents_owner_id on public.ivx_knowledge_documents(owner_user_id, updated_at desc);

alter table public.ivx_conversations enable row level security;
alter table public.ivx_messages enable row level security;
alter table public.ivx_inbox_state enable row level security;
alter table public.ivx_ai_requests enable row level security;
alter table public.ivx_knowledge_documents enable row level security;

alter table public.ivx_conversations force row level security;
alter table public.ivx_messages force row level security;
alter table public.ivx_inbox_state force row level security;
alter table public.ivx_ai_requests force row level security;
alter table public.ivx_knowledge_documents force row level security;

drop policy if exists ivx_conversations_owner_only on public.ivx_conversations;
drop policy if exists ivx_messages_owner_only on public.ivx_messages;
drop policy if exists ivx_inbox_state_owner_only on public.ivx_inbox_state;
drop policy if exists ivx_ai_requests_owner_only on public.ivx_ai_requests;
drop policy if exists ivx_knowledge_documents_owner_only on public.ivx_knowledge_documents;

create policy ivx_conversations_owner_only on public.ivx_conversations
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_messages_owner_only on public.ivx_messages
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_inbox_state_owner_only on public.ivx_inbox_state
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_ai_requests_owner_only on public.ivx_ai_requests
for all
to authenticated
using (public.ivx_is_owner())
with check (public.ivx_is_owner());

create policy ivx_knowledge_documents_owner_only on public.ivx_knowledge_documents
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

create policy ivx_owner_files_owner_only on storage.objects
for all
to authenticated
using (bucket_id = 'ivx-owner-files' and public.ivx_is_owner())
with check (bucket_id = 'ivx-owner-files' and public.ivx_is_owner());

insert into public.ivx_conversations (id, slug, title, subtitle)
values (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner AI Room',
  'Owner-only shared room for AI chat, inbox, uploads, knowledge, and commands.'
)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  updated_at = timezone('utc', now());

do 'begin alter publication supabase_realtime add table public.ivx_messages; exception when duplicate_object then null; end';
do 'begin alter publication supabase_realtime add table public.ivx_inbox_state; exception when duplicate_object then null; end';
do 'begin alter publication supabase_realtime add table public.ivx_conversations; exception when duplicate_object then null; end';
