import { IVX_OWNER_AI_SCHEMA_SQL } from './ivx-owner-ai-schema-sql';

const OWNER_ADMIN_RPC_SQL = `create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.ivx_is_owner();
$$;

create or replace function public.is_owner_of(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.ivx_is_owner();
$$;

create or replace function public.verify_admin_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.ivx_is_owner();
$$;`;

const OWNER_ADMIN_LEGACY_ROOM_SQL = `create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Workspace Assistant',
  subtitle text,
  slug text,
  last_message_text text,
  last_message_at timestamptz not null default now()
);

alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists subtitle text;
alter table public.conversations add column if not exists slug text;
alter table public.conversations add column if not exists last_message_text text;
alter table public.conversations add column if not exists last_message_at timestamptz not null default now();
create index if not exists idx_conversations_slug on public.conversations(slug);
create index if not exists idx_conversations_last_message_at on public.conversations(last_message_at desc);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id text not null,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants add column if not exists unread_count integer not null default 0;
alter table public.conversation_participants add column if not exists last_read_at timestamptz;
create index if not exists idx_conversation_participants_user on public.conversation_participants(user_id);
create index if not exists idx_conversation_participants_conversation on public.conversation_participants(conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id text not null,
  text text,
  body text,
  file_url text,
  file_type text,
  read_by text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists sender_id text;
alter table public.messages add column if not exists text text;
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists file_url text;
alter table public.messages add column if not exists file_type text;
alter table public.messages add column if not exists read_by text[] not null default '{}'::text[];
alter table public.messages add column if not exists created_at timestamptz not null default now();
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_sender_created on public.messages(sender_id, created_at desc);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text,
  title text,
  subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_rooms add column if not exists slug text;
alter table public.chat_rooms add column if not exists title text;
alter table public.chat_rooms add column if not exists subtitle text;
alter table public.chat_rooms add column if not exists created_at timestamptz not null default now();
alter table public.chat_rooms add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_chat_rooms_slug on public.chat_rooms(slug);
create index if not exists idx_chat_rooms_updated_at on public.chat_rooms(updated_at desc);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id text,
  user_id text,
  text text,
  body text,
  file_url text,
  file_type text,
  read_by text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.room_messages add column if not exists sender_id text;
alter table public.room_messages add column if not exists user_id text;
alter table public.room_messages add column if not exists text text;
alter table public.room_messages add column if not exists body text;
alter table public.room_messages add column if not exists file_url text;
alter table public.room_messages add column if not exists file_type text;
alter table public.room_messages add column if not exists read_by text[] not null default '{}'::text[];
alter table public.room_messages add column if not exists created_at timestamptz not null default now();
create index if not exists idx_room_messages_room_created on public.room_messages(room_id, created_at desc);

create or replace function public.ivx_is_owner_room_conversation(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations
    where id = target_conversation_id
      and (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  );
$$;

create or replace function public.ivx_is_owner_room_chat(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_rooms
    where id = target_room_id
      and (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.room_messages enable row level security;

alter table public.conversations force row level security;
alter table public.conversation_participants force row level security;
alter table public.messages force row level security;
alter table public.chat_rooms force row level security;
alter table public.room_messages force row level security;

drop policy if exists conversations_auth_all on public.conversations;
create policy conversations_auth_all on public.conversations
for all
to authenticated
using (
  not (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  or public.ivx_is_owner()
)
with check (
  not (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  or public.ivx_is_owner()
);

drop policy if exists conversation_participants_auth_all on public.conversation_participants;
create policy conversation_participants_auth_all on public.conversation_participants
for all
to authenticated
using (
  not public.ivx_is_owner_room_conversation(conversation_id)
  or public.ivx_is_owner()
)
with check (
  not public.ivx_is_owner_room_conversation(conversation_id)
  or public.ivx_is_owner()
);

drop policy if exists messages_auth_all on public.messages;
create policy messages_auth_all on public.messages
for all
to authenticated
using (
  not public.ivx_is_owner_room_conversation(conversation_id)
  or public.ivx_is_owner()
)
with check (
  not public.ivx_is_owner_room_conversation(conversation_id)
  or public.ivx_is_owner()
);

drop policy if exists chat_rooms_auth_all on public.chat_rooms;
create policy chat_rooms_auth_all on public.chat_rooms
for all
to authenticated
using (
  not (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  or public.ivx_is_owner()
)
with check (
  not (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid or coalesce(slug, '') = 'ivx-owner-room')
  or public.ivx_is_owner()
);

drop policy if exists room_messages_auth_all on public.room_messages;
create policy room_messages_auth_all on public.room_messages
for all
to authenticated
using (
  not public.ivx_is_owner_room_chat(room_id)
  or public.ivx_is_owner()
)
with check (
  not public.ivx_is_owner_room_chat(room_id)
  or public.ivx_is_owner()
);

do $$
begin
  if exists (select 1 from public.conversations where slug = 'ivx-owner-room') then
    update public.conversations
    set title = 'IVX Owner Room',
        subtitle = 'Owner-only shared realtime IVX room.',
        last_message_at = now()
    where slug = 'ivx-owner-room';
  else
    insert into public.conversations (
      id,
      slug,
      title,
      subtitle,
      last_message_at
    ) values (
      '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
      'ivx-owner-room',
      'IVX Owner Room',
      'Owner-only shared realtime IVX room.',
      now()
    );
  end if;
end
$$;

do $$
begin
  if exists (select 1 from public.chat_rooms where slug = 'ivx-owner-room') then
    update public.chat_rooms
    set title = 'IVX Owner Room',
        subtitle = 'Owner-only shared realtime IVX room.',
        updated_at = now()
    where slug = 'ivx-owner-room';
  else
    insert into public.chat_rooms (
      id,
      slug,
      title,
      subtitle,
      updated_at
    ) values (
      '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
      'ivx-owner-room',
      'IVX Owner Room',
      'Owner-only shared realtime IVX room.',
      now()
    );
  end if;
end
$$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversation_participants;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_rooms;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.room_messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;`;

export const IVX_OWNER_ADMIN_MODULE_SQL = `${IVX_OWNER_AI_SCHEMA_SQL}

${OWNER_ADMIN_RPC_SQL}

${OWNER_ADMIN_LEGACY_ROOM_SQL}`;
