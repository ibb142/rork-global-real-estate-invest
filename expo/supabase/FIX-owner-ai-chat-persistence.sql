-- =====================================================================
-- FIX: IVX Owner AI chat does not persist (assistantPersisted: false)
-- =====================================================================
-- ROOT CAUSE
--   backend/api/ivx-owner-ai.ts -> resolveOwnerTables() probes for
--   public.ivx_conversations(slug) and public.ivx_messages(conversation_id).
--   If those tables are missing, it returns schema:'none', insertMessage()
--   returns a synthetic non-persisted row, and the guard at line ~6183
--   throws "Shared owner-room persistence is unavailable."
--   => messages send (HTTP 200) but never reach the durable table.
--
-- HOW TO APPLY (one time, ~60 seconds, NO redeploy needed)
--   1. Open Supabase dashboard -> your project -> SQL Editor -> New query.
--   2. Paste this entire file and click Run.
--   3. Send a new Owner AI message. Persistence works immediately because
--      the backend re-probes the tables on every request.
--
-- This script is idempotent (safe to run more than once). It bypasses RLS
-- when run from the SQL editor; the backend reaches it via the service-role
-- key, which also bypasses RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- Owner conversation room ----------------------------------------------
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

-- Owner messages (the durable chat transcript) -------------------------
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

create index if not exists idx_ivx_messages_conversation_created_at
  on public.ivx_messages(conversation_id, created_at);

-- Inbox unread state (optional, used by inbox sync) --------------------
create table if not exists public.ivx_inbox_state (
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

-- AI request idempotency log (optional) --------------------------------
create table if not exists public.ivx_ai_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  request_id text,
  prompt text not null,
  response_text text,
  response_message_id uuid references public.ivx_messages(id) on delete set null,
  status text not null default 'completed',
  model text not null default 'gpt-4.1-mini',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists idx_ivx_ai_requests_request_id_unique
  on public.ivx_ai_requests(request_id) where request_id is not null;

-- Seed the owner room row (matches IVX_OWNER_AI_ROOM_ID / _SLUG) --------
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

-- Row level security: owner-only. The backend service-role key bypasses
-- RLS, so these policies do not block server writes; they protect the
-- tables from client/anon access.
alter table public.ivx_conversations enable row level security;
alter table public.ivx_messages       enable row level security;
alter table public.ivx_inbox_state    enable row level security;
alter table public.ivx_ai_requests    enable row level security;

-- ivx_is_owner() is created by ivx-owner-ai-phase1.sql. Create a minimal
-- fallback so this file is self-sufficient if phase1 was never applied.
create or replace function public.ivx_is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g')
            in ('owner','owneradmin','ivxowner','developer','dev','admin',
                'superadmin','administrator','founder','staff','staffmember',
                'ceo','manager','analyst','support')
    );
$$;

drop policy if exists ivx_conversations_owner_only on public.ivx_conversations;
drop policy if exists ivx_messages_owner_only      on public.ivx_messages;
drop policy if exists ivx_inbox_state_owner_only   on public.ivx_inbox_state;
drop policy if exists ivx_ai_requests_owner_only   on public.ivx_ai_requests;

create policy ivx_conversations_owner_only on public.ivx_conversations
  for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_messages_owner_only on public.ivx_messages
  for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_inbox_state_owner_only on public.ivx_inbox_state
  for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_ai_requests_owner_only on public.ivx_ai_requests
  for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());

-- Verify (should return one row, 8 / "ivx-owner-room" columns present):
-- select id, slug, title from public.ivx_conversations where slug = 'ivx-owner-room';
