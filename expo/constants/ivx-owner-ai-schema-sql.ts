export const IVX_OWNER_AI_SCHEMA_SQL = `create extension if not exists pgcrypto;

create or replace function public.ivx_is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') in ('owner', 'owneradmin')
    );
$$;

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
  prompt text not null,
  response_text text,
  status text not null default 'completed',
  model text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

do $
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ivx_conversations'
  loop
    execute format('drop policy if exists %I on public.ivx_conversations', policy_name);
  end loop;

  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ivx_messages'
  loop
    execute format('drop policy if exists %I on public.ivx_messages', policy_name);
  end loop;

  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ivx_inbox_state'
  loop
    execute format('drop policy if exists %I on public.ivx_inbox_state', policy_name);
  end loop;

  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ivx_ai_requests'
  loop
    execute format('drop policy if exists %I on public.ivx_ai_requests', policy_name);
  end loop;

  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'ivx_knowledge_documents'
  loop
    execute format('drop policy if exists %I on public.ivx_knowledge_documents', policy_name);
  end loop;
end
$;

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

do $
begin
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
end
$;

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

do $
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ivx_messages'
  ) then
    alter publication supabase_realtime add table public.ivx_messages;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ivx_inbox_state'
  ) then
    alter publication supabase_realtime add table public.ivx_inbox_state;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ivx_conversations'
  ) then
    alter publication supabase_realtime add table public.ivx_conversations;
  end if;
end
$;

-- ============================================================
-- Generic chat room tables (primary storage path for ChatScreen)
-- These are used by ivxChat.ts sendTextMessage / sendAttachmentMessage
-- ============================================================

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text,
  subtitle text,
  last_message_text text,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id text not null,
  sender_label text,
  text text,
  body text,
  file_url text,
  file_type text,
  file_name text,
  file_mime text,
  file_size bigint,
  read_by text[] default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id text not null,
  display_name text,
  avatar_url text,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_conversation_participants_user on public.conversation_participants(user_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_participants enable row level security;

do $
begin
  drop policy if exists conversations_authenticated on public.conversations;
  drop policy if exists messages_authenticated on public.messages;
  drop policy if exists conversation_participants_authenticated on public.conversation_participants;

  create policy conversations_authenticated on public.conversations
  for all to authenticated using (true) with check (true);

  create policy messages_authenticated on public.messages
  for all to authenticated using (true) with check (true);

  create policy conversation_participants_authenticated on public.conversation_participants
  for all to authenticated using (true) with check (true);
end
$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-uploads',
  'chat-uploads',
  true,
  52428800,
  array['image/*', 'video/*', 'application/pdf', 'text/plain', 'application/json', 'application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-chat-uploads',
  'shared-chat-uploads',
  true,
  52428800,
  array['image/*', 'video/*', 'application/pdf', 'text/plain', 'application/json', 'application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $
begin
  drop policy if exists chat_uploads_public_read on storage.objects;
  drop policy if exists chat_uploads_auth_write on storage.objects;
  drop policy if exists shared_chat_uploads_public_read on storage.objects;
  drop policy if exists shared_chat_uploads_auth_write on storage.objects;

  create policy chat_uploads_public_read on storage.objects
  for select to public using (bucket_id = 'chat-uploads');

  create policy chat_uploads_auth_write on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-uploads');

  create policy shared_chat_uploads_public_read on storage.objects
  for select to public using (bucket_id = 'shared-chat-uploads');

  create policy shared_chat_uploads_auth_write on storage.objects
  for insert to authenticated with check (bucket_id = 'shared-chat-uploads');
end
$;

insert into public.conversations (id, slug, title, subtitle)
values (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner AI Room',
  'Owner-first shared room for AI chat, inbox, uploads, knowledge, and commands.'
)
on conflict (id) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  updated_at = timezone('utc', now());

do $
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end
$;
`;
