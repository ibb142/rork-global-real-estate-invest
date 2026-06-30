import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { loadProjectEnv } from './aws-runtime.mjs';

loadProjectEnv(import.meta.url);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '../../..');
const phase1Path = resolve(projectRoot, 'expo/supabase/ivx-owner-ai-phase1.sql');
const dedupePath = resolve(projectRoot, 'expo/supabase/ivx-owner-room-dedupe.sql');
const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const dbPassword = String(process.env.SUPABASE_DB_PASSWORD ?? '').trim();
const projectRef = supabaseUrl.replace(/^https?:\/\//i, '').split('.')[0] ?? '';
const ownerRoomId = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
const poolerRegions = ['us-east-1', 'us-west-1', 'us-west-2', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'ap-south-1', 'ap-southeast-1', 'ap-northeast-1', 'sa-east-1'];

function decodeJwtPayload(token) {
  try {
    const segment = token.split('.')[1] ?? '';
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function buildPreRepairSql() {
  return `
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists avatar text;
alter table public.profiles add column if not exists kyc_status text default 'pending';
alter table public.profiles add column if not exists total_invested numeric default 0;
alter table public.profiles add column if not exists total_returns numeric default 0;
alter table public.profiles add column if not exists role text default 'investor';
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists vip_tier text default 'standard';
alter table public.profiles add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz default timezone('utc', now());

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
  id uuid primary key default gen_random_uuid()
);
alter table public.ivx_conversations add column if not exists slug text;
alter table public.ivx_conversations add column if not exists title text;
alter table public.ivx_conversations add column if not exists subtitle text;
alter table public.ivx_conversations add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.ivx_conversations add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table public.ivx_conversations add column if not exists last_message_text text;
alter table public.ivx_conversations add column if not exists last_message_at timestamptz;
update public.ivx_conversations set slug = coalesce(slug, 'ivx-owner-room') where id = '${ownerRoomId}'::uuid;
insert into public.ivx_conversations (id, slug, title, subtitle)
values ('${ownerRoomId}'::uuid, 'ivx-owner-room', 'IVX Owner AI Room', 'Owner-only shared room for AI chat, inbox, uploads, knowledge, and commands.')
on conflict (id) do update set slug = excluded.slug, title = excluded.title, subtitle = excluded.subtitle, updated_at = timezone('utc', now());
alter table public.ivx_conversations alter column slug set not null;
alter table public.ivx_conversations alter column title set not null;
create unique index if not exists idx_ivx_conversations_slug_unique on public.ivx_conversations(slug);

create table if not exists public.ivx_messages (
  id uuid primary key default gen_random_uuid()
);
alter table public.ivx_messages add column if not exists conversation_id uuid;
alter table public.ivx_messages add column if not exists sender_user_id uuid references auth.users(id) on delete set null;
alter table public.ivx_messages add column if not exists sender_role text not null default 'owner';
alter table public.ivx_messages add column if not exists sender_label text;
alter table public.ivx_messages add column if not exists body text;
alter table public.ivx_messages add column if not exists attachment_url text;
alter table public.ivx_messages add column if not exists attachment_name text;
alter table public.ivx_messages add column if not exists attachment_mime text;
alter table public.ivx_messages add column if not exists attachment_size bigint;
alter table public.ivx_messages add column if not exists attachment_kind text not null default 'text';
alter table public.ivx_messages add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.ivx_messages add column if not exists updated_at timestamptz not null default timezone('utc', now());
update public.ivx_messages set conversation_id = '${ownerRoomId}'::uuid where conversation_id is null;
do $ivx_fix$ begin
  if not exists (select 1 from pg_constraint where conname = 'ivx_messages_conversation_id_fkey' and conrelid = 'public.ivx_messages'::regclass) then
    alter table public.ivx_messages add constraint ivx_messages_conversation_id_fkey foreign key (conversation_id) references public.ivx_conversations(id) on delete cascade;
  end if;
end $ivx_fix$;
alter table public.ivx_messages alter column conversation_id set not null;

create table if not exists public.ivx_inbox_state (
  conversation_id uuid not null references public.ivx_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table if not exists public.ivx_ai_requests (
  id uuid primary key default gen_random_uuid()
);
alter table public.ivx_ai_requests add column if not exists conversation_id uuid;
alter table public.ivx_ai_requests add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ivx_ai_requests add column if not exists request_id text;
alter table public.ivx_ai_requests add column if not exists prompt text;
alter table public.ivx_ai_requests add column if not exists response_text text;
alter table public.ivx_ai_requests add column if not exists response_message_id uuid references public.ivx_messages(id) on delete set null;
alter table public.ivx_ai_requests add column if not exists status text not null default 'completed';
alter table public.ivx_ai_requests add column if not exists model text not null default 'gpt-4.1-mini';
alter table public.ivx_ai_requests add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.ivx_ai_requests add column if not exists updated_at timestamptz not null default timezone('utc', now());
update public.ivx_ai_requests set conversation_id = '${ownerRoomId}'::uuid where conversation_id is null;
do $ivx_fix$ begin
  if not exists (select 1 from pg_constraint where conname = 'ivx_ai_requests_conversation_id_fkey' and conrelid = 'public.ivx_ai_requests'::regclass) then
    alter table public.ivx_ai_requests add constraint ivx_ai_requests_conversation_id_fkey foreign key (conversation_id) references public.ivx_conversations(id) on delete cascade;
  end if;
end $ivx_fix$;

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
`;
}

function buildPostRepairSql() {
  return `
create or replace function public.ivx_exec_sql(sql_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute sql_text;
end;
$$;
revoke all on function public.ivx_exec_sql(text) from public;
revoke all on function public.ivx_exec_sql(text) from anon;
revoke all on function public.ivx_exec_sql(text) from authenticated;
grant execute on function public.ivx_exec_sql(text) to service_role;

create index if not exists idx_ivx_messages_conversation_created_at on public.ivx_messages(conversation_id, created_at);
create index if not exists idx_ivx_inbox_state_user_id on public.ivx_inbox_state(user_id, updated_at desc);
create index if not exists idx_ivx_ai_requests_conversation_id on public.ivx_ai_requests(conversation_id, created_at desc);
create unique index if not exists idx_ivx_ai_requests_request_id_unique on public.ivx_ai_requests(request_id) where request_id is not null;
create unique index if not exists idx_ivx_ai_requests_response_message_id_unique on public.ivx_ai_requests(response_message_id) where response_message_id is not null;

alter table public.profiles enable row level security;
alter table public.ivx_conversations enable row level security;
alter table public.ivx_messages enable row level security;
alter table public.ivx_inbox_state enable row level security;
alter table public.ivx_ai_requests enable row level security;
alter table public.ivx_knowledge_documents enable row level security;

drop policy if exists profiles_select_owner_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_select_owner_self on public.profiles for select to authenticated using (id = auth.uid() or regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') in ('owner', 'owneradmin', 'ivxowner', 'developer', 'dev', 'admin', 'superadmin', 'administrator', 'founder', 'staff', 'staffmember', 'ceo', 'manager', 'analyst', 'support'));
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists ivx_conversations_owner_only on public.ivx_conversations;
drop policy if exists ivx_messages_owner_only on public.ivx_messages;
drop policy if exists ivx_inbox_state_owner_only on public.ivx_inbox_state;
drop policy if exists ivx_ai_requests_owner_only on public.ivx_ai_requests;
drop policy if exists ivx_knowledge_documents_owner_only on public.ivx_knowledge_documents;
create policy ivx_conversations_owner_only on public.ivx_conversations for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_messages_owner_only on public.ivx_messages for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_inbox_state_owner_only on public.ivx_inbox_state for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_ai_requests_owner_only on public.ivx_ai_requests for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());
create policy ivx_knowledge_documents_owner_only on public.ivx_knowledge_documents for all to authenticated using (public.ivx_is_owner()) with check (public.ivx_is_owner());

select pg_notify('pgrst', 'reload schema');
`;
}

async function tryConnect(candidate) {
  const client = new Client({
    host: candidate.host,
    port: candidate.port,
    user: candidate.user,
    password: dbPassword,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
    query_timeout: 60000,
    application_name: 'ivx_hosted_schema_fix',
  });
  try {
    await client.connect();
    await client.query('select 1 as ok');
    return { ok: true, client };
  } catch (error) {
    try { await client.end(); } catch {}
    return { ok: false, error: error instanceof Error ? error.message : String(error), code: error?.code ?? null };
  }
}

async function connectPostgres() {
  const candidates = [
    { label: 'direct', host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres' },
    ...poolerRegions.map((region) => ({ label: `pooler-${region}-6543`, host: `aws-0-${region}.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` })),
    ...poolerRegions.map((region) => ({ label: `pooler-${region}-5432`, host: `aws-0-${region}.pooler.supabase.com`, port: 5432, user: `postgres.${projectRef}` })),
  ];
  const attempts = [];
  for (const candidate of candidates) {
    const result = await tryConnect(candidate);
    attempts.push({ label: candidate.label, host: candidate.host, port: candidate.port, user: candidate.user, ok: result.ok, error: result.error ?? null, code: result.code ?? null });
    if (result.ok) {
      return { client: result.client, candidate, attempts };
    }
  }
  return { client: null, candidate: null, attempts };
}

async function rest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

async function verifyPg(client) {
  const result = await client.query(`
    select json_build_object(
      'tables', (select json_agg(table_name order by table_name) from information_schema.tables where table_schema = 'public' and table_name in ('ivx_conversations','ivx_messages','ivx_ai_requests','ivx_inbox_state')),
      'columns', (select json_agg(json_build_object('table', table_name, 'column', column_name, 'data_type', data_type, 'is_nullable', is_nullable) order by table_name, column_name) from information_schema.columns where table_schema = 'public' and ((table_name = 'ivx_messages' and column_name = 'conversation_id') or (table_name = 'profiles' and column_name = 'role') or (table_name = 'ivx_conversations' and column_name in ('id','slug','title')) or (table_name = 'ivx_ai_requests' and column_name in ('id','conversation_id','request_id')) or (table_name = 'ivx_inbox_state' and column_name in ('conversation_id','user_id')))),
      'function', (select json_agg(json_build_object('schema', n.nspname, 'name', p.proname, 'args', pg_get_function_arguments(p.oid), 'acl', coalesce(p.proacl::text, 'null')) order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ivx_exec_sql'),
      'unsafe_exec_grants', (select json_agg(grantee order by grantee) from information_schema.routine_privileges where routine_schema='public' and routine_name='ivx_exec_sql' and privilege_type='EXECUTE' and grantee in ('anon','authenticated','PUBLIC')),
      'owner_room', (select json_build_object('rows', count(*), 'id', max(id::text)) from public.ivx_conversations where slug = 'ivx-owner-room')
    ) as proof
  `);
  return result.rows[0]?.proof ?? null;
}

async function verifyRest() {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
  return {
    conversations: await rest('/rest/v1/ivx_conversations?select=id,slug,title&slug=eq.ivx-owner-room&limit=1'),
    messages: await rest(`/rest/v1/ivx_messages?select=id,conversation_id,sender_role,body&conversation_id=eq.${ownerRoomId}&limit=1`),
    aiRequests: await rest(`/rest/v1/ivx_ai_requests?select=id,conversation_id,request_id&conversation_id=eq.${ownerRoomId}&limit=1`),
    inboxState: await rest(`/rest/v1/ivx_inbox_state?select=conversation_id,user_id&conversation_id=eq.${ownerRoomId}&limit=1`),
    execSql: await rest('/rest/v1/rpc/ivx_exec_sql', { method: 'POST', body: JSON.stringify({ sql_text: "select pg_notify('pgrst','reload schema')" }) }),
  };
}

async function run() {
  const servicePayload = decodeJwtPayload(serviceRoleKey);
  const connection = await connectPostgres();
  if (!connection.client || !connection.candidate) {
    console.log(JSON.stringify({
      ok: false,
      environment: { supabaseUrl, projectRef, serviceRole: servicePayload?.role ?? null, targetDb: `db.${projectRef}.supabase.co` },
      connectionAttempts: connection.attempts,
      blocker: 'No reachable Supabase Postgres direct or pooler connection from this sandbox.',
    }, null, 2));
    process.exit(2);
  }

  const client = connection.client;
  const phase1Sql = await readFile(phase1Path, 'utf8');
  const dedupeSql = await readFile(dedupePath, 'utf8');
  const applied = [];
  try {
    await client.query(buildPreRepairSql());
    applied.push('pre_repair_shape');
    await client.query(phase1Sql);
    applied.push('expo/supabase/ivx-owner-ai-phase1.sql');
    await client.query(dedupeSql);
    applied.push('expo/supabase/ivx-owner-room-dedupe.sql');
    await client.query(buildPostRepairSql());
    applied.push('post_repair_exec_grants_schema_reload');
    const pgProof = await verifyPg(client);
    const restProof = await verifyRest();
    console.log(JSON.stringify({
      ok: true,
      environment: {
        supabaseUrl,
        projectRef,
        serviceRole: servicePayload?.role ?? null,
        serviceRef: servicePayload?.ref ?? null,
        backendBaseUrl: 'https://api.ivxholding.com',
        targetEc2HostIp: '108.132.7.57',
      },
      postgresConnection: {
        label: connection.candidate.label,
        host: connection.candidate.host,
        port: connection.candidate.port,
        user: connection.candidate.user,
      },
      applied,
      pgProof,
      restProof,
      connectionAttempts: connection.attempts,
    }, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), code: error?.code ?? null }, null, 2));
  process.exit(1);
});
