create extension if not exists pgcrypto;

begin;

lock table public.ivx_conversations in share row exclusive mode;
lock table public.ivx_messages in share row exclusive mode;
lock table public.ivx_inbox_state in share row exclusive mode;
lock table public.ivx_ai_requests in share row exclusive mode;

insert into public.ivx_conversations (id, slug, title, subtitle)
values (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner AI Room',
  'Owner-only shared room for AI chat, inbox, uploads, knowledge, and commands.'
)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  subtitle = excluded.subtitle,
  updated_at = timezone('utc', now());

do $
declare
  canonical_id uuid := '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid;
  duplicate_ids uuid[];
begin
  select coalesce(array_agg(id order by created_at asc, id asc), '{}'::uuid[])
  into duplicate_ids
  from public.ivx_conversations
  where slug = 'ivx-owner-room'
    and id <> canonical_id;

  if array_length(duplicate_ids, 1) is not null then
    update public.ivx_messages
    set conversation_id = canonical_id
    where conversation_id = any(duplicate_ids);

    insert into public.ivx_inbox_state (conversation_id, user_id, unread_count, last_read_at, updated_at)
    select
      canonical_id,
      user_id,
      max(unread_count),
      max(last_read_at),
      timezone('utc', now())
    from public.ivx_inbox_state
    where conversation_id = any(duplicate_ids)
    group by user_id
    on conflict (conversation_id, user_id) do update set
      unread_count = greatest(public.ivx_inbox_state.unread_count, excluded.unread_count),
      last_read_at = greatest(public.ivx_inbox_state.last_read_at, excluded.last_read_at),
      updated_at = excluded.updated_at;

    delete from public.ivx_inbox_state
    where conversation_id = any(duplicate_ids);

    update public.ivx_ai_requests
    set conversation_id = canonical_id
    where conversation_id = any(duplicate_ids);

    delete from public.ivx_conversations
    where id = any(duplicate_ids);
  end if;
end
$;

create unique index if not exists idx_ivx_conversations_slug_unique on public.ivx_conversations(slug);
create unique index if not exists idx_conversations_slug_unique on public.conversations(slug) where slug is not null;
create unique index if not exists idx_chat_rooms_slug_unique on public.chat_rooms(slug) where slug is not null;
create unique index if not exists idx_ivx_ai_requests_request_id_unique on public.ivx_ai_requests(request_id) where request_id is not null;
create unique index if not exists idx_ivx_ai_requests_response_message_id_unique on public.ivx_ai_requests(response_message_id) where response_message_id is not null;

commit;

select
  'ivx_owner_room_dedupe_complete' as migration_status,
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid as canonical_conversation_id,
  coalesce((select count(*)::int from public.ivx_conversations where slug = 'ivx-owner-room'), 0) as canonical_slug_rows,
  coalesce((select count(*)::int from public.ivx_messages where conversation_id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid), 0) as canonical_message_rows,
  coalesce((select count(*)::int from public.ivx_inbox_state where conversation_id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid), 0) as canonical_inbox_rows,
  coalesce((select count(*)::int from public.ivx_ai_requests where conversation_id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid), 0) as canonical_ai_request_rows; 
